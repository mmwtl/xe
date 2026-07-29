export type Confidence = "low" | "medium" | "high";

export type FoodEstimate = {
  name: string;
  portionGrams: number;
  carbsPer100g: number;
  totalCarbs: number;
  breadUnits: number;
  confidence: Confidence;
  note: string;
};

export type MealAnalysis = {
  foods: FoodEstimate[];
  totalCarbs: number;
  totalBreadUnits: number;
  confidence: Confidence;
  summary: string;
  assumptions: string[];
  model: string;
};

export type ApiError = {
  error: string;
  code?: string;
};
