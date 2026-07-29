"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clearHistory,
  getHistory,
  saveHistoryEntry,
  type AnalysisHistoryEntry,
  type AnalysisMode,
} from "@/lib/history";
import type { ApiError, MealAnalysis } from "@/lib/types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function Analyzer() {
  const [mode, setMode] = useState<AnalysisMode>("photo");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<MealAnalysis | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");

  useEffect(() => {
    let isMounted = true;

    getHistory()
      .then((entries) => {
        if (!isMounted) return;
        setHistory(entries);
        setSelectedHistoryId(entries[0]?.id ?? "");
      })
      .catch(() => {
        if (isMounted) {
          setHistoryError("Не удалось открыть локальную историю.");
        }
      })
      .finally(() => {
        if (isMounted) setIsHistoryLoading(false);
      });

    return () => {
      isMounted = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPhoto = event.target.files?.[0];
    if (nextPhoto) acceptPhoto(nextPhoto);
  };

  const acceptPhoto = (nextPhoto: File) => {
    setError("");
    setResult(null);
    if (!ALLOWED_TYPES.has(nextPhoto.type)) {
      setError("Поддерживаются JPG, PNG, WebP, HEIC и HEIF.");
      return;
    }
    if (nextPhoto.size > MAX_FILE_BYTES) {
      setError("Файл больше 10 МБ. Выберите фотографию меньшего размера.");
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = URL.createObjectURL(nextPhoto);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setPhoto(nextPhoto);
  };

  const dropPhoto = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const nextPhoto = event.dataTransfer.files?.[0];
    if (nextPhoto) acceptPhoto(nextPhoto);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);

    if (mode === "photo" && !photo) {
      setError("Добавьте фотографию блюда.");
      return;
    }
    if (mode === "text" && !description.trim()) {
      setError("Опишите блюдо и примерный размер порции.");
      return;
    }

    const submittedMode = mode;
    const submittedDescription = description.trim();
    const submittedPhoto = mode === "photo" ? photo : null;
    setIsLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const formData = new FormData();
      formData.set("description", submittedDescription);
      if (submittedPhoto) formData.set("photo", submittedPhoto);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as MealAnalysis | ApiError;

      if (!response.ok || "error" in payload) {
        const responseError =
          "error" in payload ? payload.error : "Не удалось обработать запрос.";
        setError(responseError);
        await addHistoryEntry({
          mode: submittedMode,
          description: submittedDescription,
          photo: submittedPhoto,
          error: responseError,
        });
        return;
      }

      setResult(payload);
      await addHistoryEntry({
        mode: submittedMode,
        description: submittedDescription,
        photo: submittedPhoto,
        result: payload,
      });
    } catch (requestError) {
      const responseError =
        requestError instanceof DOMException && requestError.name === "AbortError"
          ? "Gemini отвечает слишком долго. Повторите запрос."
          : "Нет соединения с локальным сервером.";
      setError(responseError);
      await addHistoryEntry({
        mode: submittedMode,
        description: submittedDescription,
        photo: submittedPhoto,
        error: responseError,
      });
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const addHistoryEntry = async ({
    mode: entryMode,
    description: entryDescription,
    photo: entryPhoto,
    result: entryResult,
    error: entryError,
  }: {
    mode: AnalysisMode;
    description: string;
    photo: File | null;
    result?: MealAnalysis;
    error?: string;
  }) => {
    const entry: AnalysisHistoryEntry = {
      id: createHistoryId(),
      createdAt: new Date().toISOString(),
      mode: entryMode,
      description: entryDescription,
      ...(entryPhoto
        ? { photo: entryPhoto, photoName: entryPhoto.name }
        : {}),
      ...(entryResult ? { result: entryResult } : {}),
      ...(entryError ? { error: entryError } : {}),
    };

    try {
      await saveHistoryEntry(entry);
      setHistoryError("");
    } catch {
      setHistoryError(
        "Результат показан, но сохранить его в историю не удалось.",
      );
    }

    setHistory((currentHistory) => [entry, ...currentHistory]);
    setSelectedHistoryId(entry.id);
  };

  const changeMode = (nextMode: AnalysisMode) => {
    setMode(nextMode);
    setError("");
    setResult(null);
  };

  const removeAllHistory = async () => {
    if (
      !window.confirm(
        "Удалить всю историю запросов, ответов и сохранённых фотографий?",
      )
    ) {
      return;
    }

    try {
      await clearHistory();
      setHistory([]);
      setSelectedHistoryId("");
      setHistoryError("");
    } catch {
      setHistoryError("Не удалось очистить локальную историю.");
    }
  };

  return (
    <div className="analyzer-stack">
      <section
        className="analyzer-card"
        id="calculator"
        aria-label="Анализ блюда"
      >
        <div className="card-toolbar">
          <strong>Новый расчёт</strong>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Источник данных">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "photo"}
            className={mode === "photo" ? "active" : ""}
            onClick={() => changeMode("photo")}
          >
            <CameraIcon />
            По фото
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "text"}
            className={mode === "text" ? "active" : ""}
            onClick={() => changeMode("text")}
          >
            <TextIcon />
            По описанию
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "photo" ? (
            <div className="photo-section">
              <input
                ref={fileInputRef}
                className="visually-hidden"
                id="meal-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={choosePhoto}
              />
              <div
                className={`dropzone ${previewUrl ? "with-preview" : ""} ${
                  isDragging ? "dragging" : ""
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={dropPhoto}
              >
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Выбранное блюдо" />
                    <div className="preview-overlay">
                      <span>{photo?.name}</span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Заменить
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="dropzone-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="upload-icon" aria-hidden="true">
                      <UploadIcon />
                    </span>
                    <strong>Добавьте фото тарелки</strong>
                    <span>Нажмите или перетащите сюда · до 10 МБ</span>
                    <small>JPG, PNG, WebP, HEIC</small>
                  </button>
                )}
              </div>
              <label className="field-label" htmlFor="photo-description">
                Уточнение <span>необязательно</span>
              </label>
              <textarea
                id="photo-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Например: каша на молоке без сахара, тарелка 24 см"
                rows={2}
                maxLength={2_000}
              />
            </div>
          ) : (
            <div className="text-section">
              <label className="field-label" htmlFor="meal-description">
                Что у вас на тарелке?
              </label>
              <textarea
                id="meal-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Например: 200 г гречки, куриная котлета 90 г и салат без заправки"
                rows={5}
                maxLength={2_000}
                autoFocus
              />
              <div className="examples">
                <span>Чем точнее вес и состав, тем полезнее оценка.</span>
              </div>
            </div>
          )}

          {error ? (
            <div className="error-message" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </div>
          ) : null}

          <button
            className="analyze-button"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Gemini анализирует…
              </>
            ) : (
              <>
                <SparkIcon />
                Рассчитать ХЕ
              </>
            )}
          </button>
        </form>

        {result ? <ResultView result={result} /> : <EmptyResult />}
        {historyError ? (
          <p className="history-storage-error" role="status">
            {historyError}
          </p>
        ) : null}
      </section>

      <section className="analyzer-card history-card" aria-label="История анализов">
        <HistoryView
          entries={history}
          selectedId={selectedHistoryId}
          isLoading={isHistoryLoading}
          error={historyError}
          onClear={removeAllHistory}
          onSelect={setSelectedHistoryId}
          onToAnalyzer={() =>
            document
              .getElementById("calculator")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
      </section>
    </div>
  );
}

function HistoryView({
  entries,
  selectedId,
  isLoading,
  error,
  onClear,
  onSelect,
  onToAnalyzer,
}: {
  entries: AnalysisHistoryEntry[];
  selectedId: string;
  isLoading: boolean;
  error: string;
  onClear: () => void;
  onSelect: (id: string) => void;
  onToAnalyzer: () => void;
}) {
  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? entries[0];

  return (
    <>
      <div className="history-header">
        <div>
          <span>{entries.length} сохранено</span>
          <h2>История</h2>
        </div>
        <button
          className="clear-history-button"
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
        >
          Очистить
        </button>
      </div>

      {error ? (
        <p className="history-storage-error" role="status">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="history-empty">
          <span className="spinner dark-spinner" aria-hidden="true" />
          Загружаем историю…
        </div>
      ) : entries.length === 0 ? (
        <div className="history-empty">
          <HistoryIcon />
          <strong>История пока пуста</strong>
          <p>После первого расчёта здесь сохранятся запрос и ответ.</p>
          <button type="button" onClick={onToAnalyzer}>
            Сделать расчёт
          </button>
        </div>
      ) : (
        <div className="history-layout">
          <div className="history-list" aria-label="Прошлые запросы">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === selectedEntry?.id ? "active" : ""}
                aria-pressed={entry.id === selectedEntry?.id}
                onClick={() => onSelect(entry.id)}
              >
                <span className="history-list-icon" aria-hidden="true">
                  {entry.mode === "photo" ? <CameraIcon /> : <TextIcon />}
                </span>
                <span className="history-list-copy">
                  <strong>{getHistoryTitle(entry)}</strong>
                  <small>{formatHistoryDate(entry.createdAt)}</small>
                </span>
                <span
                  className={`history-list-value ${
                    entry.error ? "history-list-error" : ""
                  }`}
                >
                  {entry.result
                    ? `${formatNumber(entry.result.totalBreadUnits)} ХЕ`
                    : "Ошибка"}
                </span>
              </button>
            ))}
          </div>
          {selectedEntry ? (
            <HistoryDetail key={selectedEntry.id} entry={selectedEntry} />
          ) : null}
        </div>
      )}
    </>
  );
}

function HistoryDetail({ entry }: { entry: AnalysisHistoryEntry }) {
  const [photoUrl] = useState(() =>
    entry.photo ? URL.createObjectURL(entry.photo) : "",
  );

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  return (
    <article className="history-detail">
      <div className="history-request">
        <div className="history-detail-heading">
          <div>
            <span>Запрос</span>
            <strong>{formatHistoryDate(entry.createdAt, true)}</strong>
          </div>
          <span className="history-mode">
            {entry.mode === "photo" ? "По фото" : "По описанию"}
          </span>
        </div>

        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="history-photo"
            src={photoUrl}
            alt={entry.photoName ? `Блюдо: ${entry.photoName}` : "Блюдо из истории"}
          />
        ) : null}

        {entry.description ? (
          <p className="history-description">{entry.description}</p>
        ) : (
          <p className="history-description history-description-muted">
            Запрос отправлен без текстового уточнения.
          </p>
        )}
      </div>

      <div className="history-answer">
        <span className="history-section-label">Ответ</span>
        {entry.result ? (
          <ResultView result={entry.result} />
        ) : (
          <div className="history-error-answer" role="status">
            <span aria-hidden="true">!</span>
            <div>
              <strong>Расчёт не выполнен</strong>
              <p>{entry.error ?? "Ответ не был получен."}</p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function EmptyResult() {
  return (
    <div className="empty-result" aria-hidden="true">
      <div className="empty-xe">
        <span>—</span>
        <small>ХЕ</small>
      </div>
      <div>
        <strong>Результат появится здесь</strong>
        <p>Gemini определит продукты, порции и примерные углеводы.</p>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: MealAnalysis }) {
  const confidenceLabel = {
    high: "высокая",
    medium: "средняя",
    low: "низкая",
  }[result.confidence];

  return (
    <div className="result" aria-live="polite">
      <div className="result-summary">
        <div className="xe-circle">
          <strong>{formatNumber(result.totalBreadUnits)}</strong>
          <span>ХЕ</span>
        </div>
        <div className="result-copy">
          <span>Итого в порции</span>
          <strong>{formatNumber(result.totalCarbs)} г</strong>
          <small>углеводов</small>
        </div>
        <div className={`confidence confidence-${result.confidence}`}>
          <span>Оценка</span>
          <strong>{confidenceLabel}</strong>
        </div>
      </div>

      <p className="result-description">{result.summary}</p>

      <div className="food-list">
        {result.foods.map((food, index) => (
          <article className="food-row" key={`${food.name}-${index}`}>
            <span className="food-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="food-main">
              <strong>{food.name}</strong>
              <span>
                {formatNumber(food.portionGrams)} г ·{" "}
                {formatNumber(food.carbsPer100g)} г углеводов / 100 г
              </span>
              {food.note ? <small>{food.note}</small> : null}
            </div>
            <div className="food-xe">
              <strong>{formatNumber(food.breadUnits)} ХЕ</strong>
              <span>{formatNumber(food.totalCarbs)} г</span>
            </div>
          </article>
        ))}
      </div>

      {result.assumptions.length > 0 ? (
        <details className="assumptions">
          <summary>Допущения Gemini</summary>
          <ul>
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="formula-row">
        <span>Проверка расчёта</span>
        <strong>
          {formatNumber(result.totalCarbs)} г ÷ 12 ={" "}
          {formatNumber(result.totalBreadUnits)} ХЕ
        </strong>
      </div>
      <p className="model-label">Модель: {result.model}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function getHistoryTitle(entry: AnalysisHistoryEntry) {
  const description = entry.description.trim();
  if (description) return description;
  return entry.photoName || "Фотография блюда";
}

function formatHistoryDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function createHistoryId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 5.5 10 3.7h4l1.5 1.8H19A2.5 2.5 0 0 1 21.5 8v9A2.5 2.5 0 0 1 19 19.5H5A2.5 2.5 0 0 1 2.5 17V8A2.5 2.5 0 0 1 5 5.5h3.5Z" />
      <circle cx="12" cy="12.5" r="4" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.5h14M5 12h14M5 17.5h9" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5V19h14v-4.5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8c.6 4.8 3.2 7.4 8 8-4.8.6-7.4 3.2-8 8-.6-4.8-3.2-7.4-8-8 4.8-.6 7.4-3.2 8-8Z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 7.5V12l3 1.8" />
    </svg>
  );
}
