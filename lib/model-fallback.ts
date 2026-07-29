export async function withRateLimitFallback<T>({
  models,
  run,
  isRateLimitError,
  onFallback,
}: {
  models: readonly string[];
  run: (model: string) => Promise<T>;
  isRateLimitError: (error: unknown) => boolean;
  onFallback?: (failedModel: string, nextModel: string) => void;
}): Promise<T> {
  if (models.length === 0) {
    throw new Error("Не задана ни одна модель Gemini.");
  }

  let lastRateLimitError: unknown;

  for (const [index, model] of models.entries()) {
    try {
      return await run(model);
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }

      lastRateLimitError = error;
      const nextModel = models[index + 1];
      if (nextModel) {
        onFallback?.(model, nextModel);
      }
    }
  }

  throw lastRateLimitError;
}
