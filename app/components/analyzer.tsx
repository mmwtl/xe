"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
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
import { useVoiceInput } from "@/lib/use-voice-input";

const MAX_PHOTOS = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 14 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export function Analyzer() {
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [result, setResult] = useState<MealAnalysis | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setDescription((currentDescription) =>
      [currentDescription.trim(), transcript.trim()]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2_000),
    );
    setError("");
    setResult(null);
  }, []);
  const {
    error: voiceError,
    isListening,
    toggle: toggleVoiceInput,
  } = useVoiceInput(handleVoiceTranscript);

  useEffect(() => {
    let isMounted = true;
    const previewUrls = previewUrlsRef.current;

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
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    };
  }, []);

  const choosePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPhotos = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (nextPhotos.length > 0) acceptPhotos(nextPhotos);
  };

  const acceptPhotos = (nextPhotos: File[]) => {
    setError("");
    setResult(null);

    const existingKeys = new Set(
      photos.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`),
    );
    const uniquePhotos = nextPhotos.filter(
      (file) =>
        !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`),
    );

    if (uniquePhotos.length === 0) {
      setError("Эти фотографии уже добавлены.");
      return;
    }
    if (photos.length + uniquePhotos.length > MAX_PHOTOS) {
      setError(`Можно добавить не больше ${MAX_PHOTOS} фотографий.`);
      return;
    }
    if (uniquePhotos.some((file) => !ALLOWED_TYPES.has(file.type))) {
      setError("Поддерживаются JPG, PNG, WebP, HEIC и HEIF.");
      return;
    }
    if (uniquePhotos.some((file) => file.size > MAX_FILE_BYTES)) {
      setError("Одна из фотографий больше 10 МБ.");
      return;
    }

    const totalBytes = [...photos.map(({ file }) => file), ...uniquePhotos].reduce(
      (sum, file) => sum + file.size,
      0,
    );
    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
      setError("Общий размер фотографий не должен превышать 14 МБ.");
      return;
    }

    const selectedPhotos = uniquePhotos.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        id: `${file.name}:${file.size}:${file.lastModified}`,
        file,
        previewUrl,
      };
    });
    setPhotos((currentPhotos) => [...currentPhotos, ...selectedPhotos]);
  };

  const removePhoto = (photoId: string) => {
    const photo = photos.find(({ id }) => id === photoId);
    if (photo) {
      URL.revokeObjectURL(photo.previewUrl);
      previewUrlsRef.current.delete(photo.previewUrl);
    }
    setPhotos((currentPhotos) =>
      currentPhotos.filter(({ id }) => id !== photoId),
    );
    setError("");
    setResult(null);
  };

  const addHistoryEntry = async ({
    mode,
    description: entryDescription,
    photos: entryPhotos,
    result: entryResult,
    error: entryError,
  }: {
    mode: AnalysisMode;
    description: string;
    photos: File[];
    result?: MealAnalysis;
    error?: string;
  }) => {
    const entry: AnalysisHistoryEntry = {
      id: createHistoryId(),
      createdAt: new Date().toISOString(),
      mode,
      description: entryDescription,
      ...(entryPhotos.length > 0
        ? {
            photos: entryPhotos,
            photoNames: entryPhotos.map((photo) => photo.name),
          }
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);

    const submittedDescription = description.trim();
    const submittedPhotos = photos.map(({ file }) => file);
    if (submittedPhotos.length === 0 && !submittedDescription) {
      setError("Добавьте фотографии или опишите блюдо.");
      return;
    }

    const submittedMode: AnalysisMode =
      submittedPhotos.length > 0 ? "photo" : "text";
    setIsLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const formData = new FormData();
      formData.set("description", submittedDescription);
      submittedPhotos.forEach((photo) => formData.append("photos", photo));

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
          photos: submittedPhotos,
          error: responseError,
        });
        return;
      }

      setResult(payload);
      await addHistoryEntry({
        mode: submittedMode,
        description: submittedDescription,
        photos: submittedPhotos,
        result: payload,
      });
    } catch (requestError) {
      const responseError =
        requestError instanceof DOMException && requestError.name === "AbortError"
          ? "Gemini отвечает слишком долго. Повторите запрос."
          : "Не удалось связаться с сервером.";
      setError(responseError);
      await addHistoryEntry({
        mode: submittedMode,
        description: submittedDescription,
        photos: submittedPhotos,
        error: responseError,
      });
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
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
        <form onSubmit={submit}>
          <div className="meal-input">
            <label className="visually-hidden" htmlFor="meal-description">
              Описание блюда
            </label>
            <div className="description-input">
              <textarea
                id="meal-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Опишите блюдо или уточните состав"
                rows={3}
                maxLength={2_000}
              />
              <button
                className={`voice-button ${isListening ? "is-listening" : ""}`}
                type="button"
                disabled={isLoading}
                aria-label={
                  isListening
                    ? "Остановить голосовой ввод"
                    : "Ввести описание голосом"
                }
                aria-pressed={isListening}
                title={
                  isListening
                    ? "Остановить голосовой ввод"
                    : "Ввести описание голосом"
                }
                onClick={() => {
                  setError("");
                  toggleVoiceInput();
                }}
              >
                <MicrophoneIcon />
                <span className="visually-hidden">
                  {isListening ? "Слушаю…" : "Ввести голосом"}
                </span>
              </button>
            </div>

            <input
              ref={cameraInputRef}
              className="visually-hidden"
              id="meal-camera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={choosePhotos}
            />
            <input
              ref={fileInputRef}
              className="visually-hidden"
              id="meal-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={choosePhotos}
            />
            {photos.length > 0 ? (
              <div className="attachment-row">
                {photos.map((photo, index) => (
                  <div className="photo-thumbnail" key={photo.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt={`Фотография блюда ${index + 1}`}
                    />
                    <button
                      type="button"
                      aria-label={`Удалить фотографию ${index + 1}`}
                      onClick={() => removePhoto(photo.id)}
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="attachment-actions">
              <button
                className="attach-button camera-button"
                type="button"
                disabled={photos.length >= MAX_PHOTOS}
                aria-label={
                  photos.length >= MAX_PHOTOS
                    ? "Максимум 3 фото"
                    : "Сфотографировать блюдо"
                }
                onClick={() => cameraInputRef.current?.click()}
              >
                <CameraIcon />
                <span>
                  {photos.length < MAX_PHOTOS ? "Снять фото" : "3 / 3"}
                </span>
              </button>
              <button
                className="attach-button gallery-button"
                type="button"
                disabled={photos.length >= MAX_PHOTOS}
                aria-label={
                  photos.length >= MAX_PHOTOS
                    ? "Максимум 3 фото"
                    : photos.length === 0
                      ? "Выбрать готовые фото"
                      : "Добавить готовые фото"
                }
                onClick={() => fileInputRef.current?.click()}
              >
                <AttachmentIcon />
                <span>
                  {photos.length < MAX_PHOTOS ? "Выбрать фото" : "3 / 3"}
                </span>
              </button>
            </div>
          </div>

          {error || voiceError ? (
            <div className="error-message" role="alert">
              <span aria-hidden="true">!</span>
              {error || voiceError}
            </div>
          ) : null}

          <button
            className="analyze-button"
            type="submit"
            disabled={isLoading || isListening}
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
  const [photoUrls] = useState(() =>
    getHistoryPhotos(entry).map((photo) => URL.createObjectURL(photo)),
  );
  const photoNames = entry.photoNames ??
    (entry.photoName ? [entry.photoName] : []);

  useEffect(() => {
    return () => {
      photoUrls.forEach((photoUrl) => URL.revokeObjectURL(photoUrl));
    };
  }, [photoUrls]);

  return (
    <article className="history-detail">
      <div className="history-request">
        <div className="history-detail-heading">
          <div>
            <span>Запрос</span>
            <strong>{formatHistoryDate(entry.createdAt, true)}</strong>
          </div>
          <span className="history-mode">
            {entry.mode === "photo" ? "С фото" : "По описанию"}
          </span>
        </div>

        {photoUrls.length > 0 ? (
          <div className="history-photos">
            {photoUrls.map((photoUrl, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photoUrl}
                className="history-photo"
                src={photoUrl}
                alt={
                  photoNames[index]
                    ? `Блюдо: ${photoNames[index]}`
                    : `Фотография блюда ${index + 1}`
                }
              />
            ))}
          </div>
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

function getHistoryPhotos(entry: AnalysisHistoryEntry) {
  if (entry.photos?.length) return entry.photos;
  return entry.photo ? [entry.photo] : [];
}

function getHistoryTitle(entry: AnalysisHistoryEntry) {
  const description = entry.description.trim();
  if (description) return description;
  return entry.photoNames?.[0] || entry.photoName || "Фотография блюда";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
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

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.6 7.1 6 11.7a3 3 0 0 0 4.2 4.2l6.2-6.2a4.2 4.2 0 0 0-5.9-5.9L4.2 10a5.5 5.5 0 0 0 7.8 7.8l3.4-3.4" />
      <path d="M15.7 14.2h3.8a1.5 1.5 0 0 1 1.5 1.5v3.8a1.5 1.5 0 0 1-1.5 1.5h-5a1.5 1.5 0 0 1-1.5-1.5v-2.6" />
      <circle cx="17" cy="17.6" r="1.5" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 5.5 10 3.7h4l1.5 1.8H19A2.5 2.5 0 0 1 21.5 8v9A2.5 2.5 0 0 1 19 19.5H5A2.5 2.5 0 0 1 2.5 17V8A2.5 2.5 0 0 1 5 5.5h3.5Z" />
      <circle cx="12" cy="12.5" r="4" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3" width="8" height="12" rx="4" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
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
