"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ApiError, MealAnalysis } from "@/lib/types";

type Mode = "photo" | "text";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function Analyzer() {
  const [mode, setMode] = useState<Mode>("photo");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<MealAnalysis | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");

  useEffect(() => {
    return () => {
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

    setIsLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      if (mode === "photo" && photo) formData.set("photo", photo);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as MealAnalysis | ApiError;

      if (!response.ok || "error" in payload) {
        setError(
          "error" in payload
            ? payload.error
            : "Не удалось обработать запрос.",
        );
        return;
      }

      setResult(payload);
    } catch (requestError) {
      setError(
        requestError instanceof DOMException && requestError.name === "AbortError"
          ? "Gemini отвечает слишком долго. Повторите запрос."
          : "Нет соединения с локальным сервером.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError("");
    setResult(null);
  };

  return (
    <section className="analyzer-card" aria-label="Анализ блюда">
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
    </section>
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
