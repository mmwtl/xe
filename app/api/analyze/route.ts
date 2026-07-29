import { NextResponse } from "next/server";
import { analyzeMeal, MealAnalysisError } from "@/lib/gemini";
import { detectImageMimeType } from "@/lib/image-mime";
import type { MealAnalysis } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PRIMARY_MODEL = "gemini-3.6-flash";
const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const description = String(formData.get("description") ?? "")
      .trim()
      .slice(0, 2_000);
    const photoValue = formData.get("photo");
    const photo =
      photoValue instanceof File && photoValue.size > 0 ? photoValue : null;

    if (!photo && !description) {
      return NextResponse.json(
        { error: "Добавьте фотографию или описание блюда.", code: "NO_INPUT" },
        { status: 400 },
      );
    }

    if (photo && photo.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Фото больше 10 МБ. Уменьшите размер файла.", code: "TOO_LARGE" },
        { status: 413 },
      );
    }

    const photoBytes = photo ? await photo.arrayBuffer() : null;
    const photoMimeType = photoBytes
      ? detectImageMimeType(new Uint8Array(photoBytes), photo?.type ?? "")
      : null;

    if (photo && !photoMimeType) {
      return NextResponse.json(
        {
          error: "Поддерживаются JPG, PNG, WebP, HEIC и HEIF.",
          code: "UNSUPPORTED_IMAGE",
        },
        { status: 415 },
      );
    }

    const models = getModelChain();

    if (process.env.GEMINI_MOCK === "1") {
      return NextResponse.json(createMockAnalysis(models[0]));
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Не задан GEMINI_API_KEY. Скопируйте .env.example в .env.local и добавьте ключ.",
          code: "MISSING_API_KEY",
        },
        { status: 503 },
      );
    }

    const result = await analyzeMeal({
      apiKey,
      models,
      description,
      image: photoBytes && photoMimeType
        ? {
            bytes: photoBytes,
            mimeType: photoMimeType,
          }
        : undefined,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof MealAnalysisError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: "Внутренняя ошибка анализа. Повторите запрос.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
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
