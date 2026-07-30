import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { saveAnalysisAudit } from "@/lib/audit-storage";
import type { AuditPhotoInput } from "@/lib/audit-types";
import { analyzeMeal, MealAnalysisError } from "@/lib/gemini";
import { detectImageMimeType } from "@/lib/image-mime";
import type { ApiError, MealAnalysis } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 14 * 1024 * 1024;
const MAX_PHOTOS = 3;
const DEFAULT_PRIMARY_MODEL = "gemini-3.6-flash";
const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

export async function POST(request: Request) {
  const id = randomUUID();
  const startedAt = Date.now();
  const createdAt = new Date(startedAt).toISOString();
  let description = "";
  let auditPhotos: AuditPhotoInput[] = [];
  let attemptedModel: string | undefined;

  const respond = (
    body: MealAnalysis | ApiError,
    status = 200,
  ): NextResponse<MealAnalysis | ApiError> => {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const isError = "error" in body;
    after(async () => {
      try {
        await saveAnalysisAudit({
          id,
          createdAt,
          completedAt,
          status: isError ? "error" : "success",
          httpStatus: status,
          description,
          photos: auditPhotos,
          response: isError ? undefined : body,
          error: isError
            ? { message: body.error, code: body.code }
            : undefined,
          model: isError ? attemptedModel : body.model,
          durationMs,
        });
      } catch (error) {
        console.error(
          `Не удалось сохранить аудит запроса ${id}:`,
          error instanceof Error ? error.message : "неизвестная ошибка",
        );
      }
    });

    return NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": id,
      },
    });
  };

  try {
    const formData = await request.formData();
    description = String(formData.get("description") ?? "")
      .trim()
      .slice(0, 2_000);
    const photos = formData
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
    auditPhotos = photos.map((photo) => ({
      name: photo.name,
      mimeType: photo.type || "application/octet-stream",
      size: photo.size,
    }));

    if (photos.length === 0 && !description) {
      return respond(
        { error: "Добавьте фотографии или описание блюда.", code: "NO_INPUT" },
        400,
      );
    }

    if (photos.length > MAX_PHOTOS) {
      return respond(
        {
          error: `Можно добавить не больше ${MAX_PHOTOS} фотографий.`,
          code: "TOO_MANY_PHOTOS",
        },
        400,
      );
    }

    if (photos.some((photo) => photo.size > MAX_FILE_BYTES)) {
      return respond(
        { error: "Одна из фотографий больше 10 МБ.", code: "TOO_LARGE" },
        413,
      );
    }

    const totalPhotoBytes = photos.reduce((sum, photo) => sum + photo.size, 0);
    if (totalPhotoBytes > MAX_TOTAL_FILE_BYTES) {
      return respond(
        {
          error: "Общий размер фотографий не должен превышать 14 МБ.",
          code: "TOTAL_TOO_LARGE",
        },
        413,
      );
    }

    const photoBuffers = await Promise.all(
      photos.map((photo) => photo.arrayBuffer()),
    );
    auditPhotos = auditPhotos.map((photo, index) => ({
      ...photo,
      bytes: photoBuffers[index],
    }));
    const images = photoBuffers.map((bytes, index) => ({
      bytes,
      mimeType: detectImageMimeType(
        new Uint8Array(bytes),
        photos[index]?.type ?? "",
      ),
    }));

    if (images.some(({ mimeType }) => !mimeType)) {
      return respond(
        {
          error: "Поддерживаются JPG, PNG, WebP, HEIC и HEIF.",
          code: "UNSUPPORTED_IMAGE",
        },
        415,
      );
    }

    const models = getModelChain();
    attemptedModel = models[0];

    if (process.env.GEMINI_MOCK === "1") {
      return respond(createMockAnalysis(models[0]));
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return respond(
        {
          error:
            "Не задан GEMINI_API_KEY. Скопируйте .env.example в .env.local и добавьте ключ.",
          code: "MISSING_API_KEY",
        },
        503,
      );
    }

    const result = await analyzeMeal({
      apiKey,
      models,
      description,
      images: images.map(({ bytes, mimeType }) => ({
        bytes,
        mimeType: mimeType as string,
      })),
    });

    return respond(result);
  } catch (error) {
    if (error instanceof MealAnalysisError) {
      return respond(
        { error: error.message, code: error.code },
        error.status,
      );
    }

    return respond(
      {
        error: "Внутренняя ошибка анализа. Повторите запрос.",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  }
}

function getModelChain(): string[] {
  const primaryModel =
    process.env.GEMINI_MODEL?.trim() || DEFAULT_PRIMARY_MODEL;
  const fallbackModels = (
    process.env.GEMINI_FALLBACK_MODELS ??
    DEFAULT_FALLBACK_MODELS.join(",")
  )
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return [...new Set([primaryModel, ...fallbackModels])];
}

function createMockAnalysis(model: string): MealAnalysis {
  return {
    foods: [
      {
        name: "Овсяная каша",
        portionGrams: 180,
        carbsPer100g: 12,
        totalCarbs: 21.6,
        breadUnits: 1.8,
        confidence: "high",
        note: "Порция оценена по размеру миски.",
      },
      {
        name: "Банан",
        portionGrams: 100,
        carbsPer100g: 23,
        totalCarbs: 23,
        breadUnits: 1.9,
        confidence: "medium",
        note: "Принят один небольшой банан.",
      },
    ],
    totalCarbs: 44.6,
    totalBreadUnits: 3.7,
    confidence: "medium",
    summary: "Овсяная каша с бананом, приблизительно 3,7 ХЕ.",
    assumptions: [
      "Каша приготовлена без сахара.",
      "Масса определена приблизительно.",
    ],
    model,
  };
}
