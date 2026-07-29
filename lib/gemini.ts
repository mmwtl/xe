import { ApiError, GoogleGenAI } from "@google/genai";
import { withRateLimitFallback } from "./model-fallback";
import type { Confidence, FoodEstimate, MealAnalysis } from "./types";

const XE_GRAMS = 12;

const analysisSchema = {
  type: "object",
  properties: {
    foods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          portion_grams: { type: "number" },
          carbs_per_100g: { type: "number" },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          note: { type: "string" },
        },
        required: [
          "name",
          "portion_grams",
          "carbs_per_100g",
          "confidence",
          "note",
        ],
        additionalProperties: false,
      },
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    summary: { type: "string" },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["foods", "confidence", "summary", "assumptions"],
  additionalProperties: false,
};

type GeminiFood = {
  name?: unknown;
  portion_grams?: unknown;
  carbs_per_100g?: unknown;
  confidence?: unknown;
  note?: unknown;
};

type GeminiPayload = {
  foods?: unknown;
  confidence?: unknown;
  summary?: unknown;
  assumptions?: unknown;
};

export class MealAnalysisError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code = "GEMINI_ERROR",
  ) {
    super(message);
  }
}

export async function analyzeMeal({
  apiKey,
  models,
  description,
  images = [],
}: {
  apiKey: string;
  models: readonly string[];
  description: string;
  images?: readonly { bytes: ArrayBuffer; mimeType: string }[];
}): Promise<MealAnalysis> {
  const client = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(description, images.length);
  const imageInputs = images.map((image) => ({
    type: "image" as const,
    mime_type: image.mimeType,
    data: Buffer.from(image.bytes).toString("base64"),
    resolution: "high" as const,
  }));
  const input =
    imageInputs.length > 0
      ? [...imageInputs, { type: "text" as const, text: prompt }]
      : prompt;

  try {
    return await withRateLimitFallback({
      models,
      isRateLimitError,
      onFallback: (failedModel, nextModel) => {
        console.warn(
          `Gemini model ${failedModel} returned 429; falling back to ${nextModel}.`,
        );
      },
      run: async (model) => {
        const interaction = await client.interactions.create({
          model,
          input,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: analysisSchema,
          },
        });

        if (!interaction.output_text) {
          throw new MealAnalysisError(
            "Gemini не вернул текстовый результат. Попробуйте другое фото.",
          );
        }

        return normalizeAnalysis(JSON.parse(interaction.output_text), model);
      },
    });
  } catch (error) {
    if (error instanceof MealAnalysisError) throw error;

    const message = error instanceof Error ? error.message : "";
    if (/api.?key|unauthenticated|permission|401|403/i.test(message)) {
      throw new MealAnalysisError(
        "Gemini отклонил API-ключ. Проверьте GEMINI_API_KEY в .env.local.",
        502,
        "INVALID_API_KEY",
      );
    }
    if (/quota|rate.?limit|429|resource.?exhausted/i.test(message)) {
      throw new MealAnalysisError(
        "Достигнут лимит Gemini API. Проверьте квоту проекта и повторите позже.",
        429,
        "RATE_LIMIT",
      );
    }
    if (/fetch|network|timeout|deadline/i.test(message)) {
      throw new MealAnalysisError(
        "Не удалось связаться с Gemini API. Проверьте интернет-соединение.",
        502,
        "NETWORK_ERROR",
      );
    }

    throw new MealAnalysisError(
      "Gemini не смог обработать запрос. Попробуйте более чёткое фото или подробное описание.",
    );
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 429;
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 429
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /quota|rate.?limit|429|resource.?exhausted/i.test(message);
}

function buildPrompt(description: string, imageCount: number): string {
  const inputDescription = description.trim()
    ? `Описание пользователя: «${description.trim()}».`
    : "Пользователь не добавил текстовое описание.";

  return [
    "Ты анализируешь еду для приблизительного подсчёта углеводов и хлебных единиц (ХЕ).",
    imageCount > 1
      ? `Все ${imageCount} фотографии показывают одно и то же блюдо с разных ракурсов. Используй их совместно и не считай повторно продукты, видимые на нескольких фотографиях.`
      : imageCount === 1
      ? "Определи все видимые продукты и блюда на фотографии."
      : "Определи продукты и блюда только по текстовому описанию.",
    inputDescription,
    "Для каждого продукта оцени массу порции в граммах и количество усваиваемых углеводов на 100 г.",
    "Если блюдо сложное, оцени типичный рецепт и перечисли ключевое допущение.",
    "Не назначай инсулин, лекарства или медицинские действия.",
    "Не добавляй предметы, которые не видны и не указаны пользователем.",
    "При высокой неопределённости используй confidence=low и объясни причину в note.",
    "Хлебная единица в этом приложении равна 12 г углеводов.",
    "Ответь только структурированным JSON по переданной схеме. Пиши названия и пояснения на русском языке.",
  ].join("\n");
}

function normalizeAnalysis(value: unknown, model: string): MealAnalysis {
  if (!value || typeof value !== "object") {
    throw new MealAnalysisError("Gemini вернул некорректный JSON.");
  }

  const payload = value as GeminiPayload;
  if (!Array.isArray(payload.foods) || payload.foods.length === 0) {
    throw new MealAnalysisError(
      "Не удалось уверенно определить продукты. Добавьте описание блюда.",
      422,
      "NO_FOODS",
    );
  }

  const foods = payload.foods
    .slice(0, 20)
    .map(normalizeFood)
    .filter((food): food is FoodEstimate => food !== null);

  if (foods.length === 0) {
    throw new MealAnalysisError(
      "Gemini не вернул пригодные для расчёта продукты.",
      422,
      "NO_FOODS",
    );
  }

  const totalCarbs = round(
    foods.reduce((sum, food) => sum + food.totalCarbs, 0),
  );

  return {
    foods,
    totalCarbs,
    totalBreadUnits: round(totalCarbs / XE_GRAMS),
    confidence: toConfidence(payload.confidence),
    summary:
      typeof payload.summary === "string" && payload.summary.trim()
        ? payload.summary.trim()
        : "Приблизительная оценка по данным Gemini.",
    assumptions: Array.isArray(payload.assumptions)
      ? payload.assumptions
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    model,
  };
}

function normalizeFood(value: unknown): FoodEstimate | null {
  if (!value || typeof value !== "object") return null;
  const food = value as GeminiFood;
  const name = typeof food.name === "string" ? food.name.trim() : "";
  const portionGrams = toNumber(food.portion_grams);
  const carbsPer100g = toNumber(food.carbs_per_100g);

  if (!name || portionGrams <= 0 || carbsPer100g < 0) return null;

  const totalCarbs = round((portionGrams * carbsPer100g) / 100);
  return {
    name,
    portionGrams: round(portionGrams),
    carbsPer100g: round(carbsPer100g),
    totalCarbs,
    breadUnits: round(totalCarbs / XE_GRAMS),
    confidence: toConfidence(food.confidence),
    note: typeof food.note === "string" ? food.note.trim() : "",
  };
}

function toNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function toConfidence(value: unknown): Confidence {
  return value === "high" || value === "low" ? value : "medium";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
