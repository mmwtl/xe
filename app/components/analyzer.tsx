"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ApiError, MealAnalysis } from "@/lib/types";

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
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);

    if (photos.length === 0 && !description.trim()) {
      setError("Добавьте фотографии или опишите блюдо.");
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      photos.forEach(({ file }) => formData.append("photos", file));

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
          : "Не удалось связаться с сервером.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  return (
    <section className="analyzer-card" aria-label="Анализ блюда">
      <form onSubmit={submit}>
        <div className="meal-input">
          <label className="visually-hidden" htmlFor="meal-description">
            Описание блюда
          </label>
          <textarea
            id="meal-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Опишите блюдо или уточните состав"
            rows={3}
            maxLength={2_000}
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
            <button
              className="attach-button"
              type="button"
              disabled={photos.length >= MAX_PHOTOS}
              aria-label={
                photos.length >= MAX_PHOTOS
                  ? "Максимум 3 фото"
                  : photos.length === 0
                    ? "Прикрепить фото"
                    : "Добавить фото"
              }
              onClick={() => fileInputRef.current?.click()}
            >
              <AttachmentIcon />
              <span>
                {photos.length === 0
                  ? "Прикрепить фото"
                  : photos.length < MAX_PHOTOS
                    ? "Добавить фото"
                    : "3 / 3"}
              </span>
            </button>
          </div>
        </div>

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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8c.6 4.8 3.2 7.4 8 8-4.8.6-7.4 3.2-8 8-.6-4.8-3.2-7.4-8-8 4.8-.6 7.4-3.2 8-8Z" />
    </svg>
  );
}
