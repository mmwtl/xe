import type { MealAnalysis } from "./types";

export type AuditStatus = "success" | "error";

export type AuditPhoto = {
  name: string;
  mimeType: string;
  size: number;
};

export type AuditError = {
  message: string;
  code?: string;
};

export type AuditSummary = {
  id: string;
  createdAt: string;
  completedAt: string;
  status: AuditStatus;
  httpStatus: number;
  description: string;
  photoCount: number;
  totalCarbs?: number;
  totalBreadUnits?: number;
  model?: string;
  errorCode?: string;
  durationMs: number;
};

export type AuditRecord = AuditSummary & {
  photos: AuditPhoto[];
  photoPreview?: string;
  response?: MealAnalysis;
  error?: AuditError;
};

export type AuditPhotoInput = AuditPhoto & {
  bytes?: ArrayBuffer;
};

export type SaveAuditInput = {
  id: string;
  createdAt: string;
  completedAt: string;
  status: AuditStatus;
  httpStatus: number;
  description: string;
  photos: AuditPhotoInput[];
  response?: MealAnalysis;
  error?: AuditError;
  model?: string;
  durationMs: number;
};
