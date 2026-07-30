import "server-only";

import { del, get, list, put } from "@vercel/blob";
import sharp from "sharp";
import { MOCK_AUDIT_RECORDS } from "./audit-mock";
import type {
  AuditRecord,
  AuditSummary,
  SaveAuditInput,
} from "./audit-types";

const SUMMARY_PREFIX = "audit/summaries/";
const RECORD_PREFIX = "audit/records/";
const REVERSE_TIME_MAX = 9_999_999_999_999;
const MAX_LIST_LIMIT = 50;

export class AuditStorageNotConfiguredError extends Error {}

export function isAuditStorageConfigured(): boolean {
  return Boolean(
    process.env.AUDIT_MOCK === "1" ||
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
      (process.env.BLOB_STORE_ID?.trim() &&
        process.env.VERCEL_OIDC_TOKEN?.trim()),
  );
}

export async function saveAnalysisAudit(
  input: SaveAuditInput,
): Promise<void> {
  if (process.env.AUDIT_MOCK === "1") return;
  if (!isAuditStorageConfigured()) return;

  const photoPreview = await createPhotoPreview(input.photos);
  const photos = input.photos.map((photo) => ({
    name: photo.name,
    mimeType: photo.mimeType,
    size: photo.size,
  }));
  const summary: AuditSummary = {
    id: input.id,
    createdAt: input.createdAt,
    completedAt: input.completedAt,
    status: input.status,
    httpStatus: input.httpStatus,
    description: input.description,
    photoCount: photos.length,
    totalCarbs: input.response?.totalCarbs,
    totalBreadUnits: input.response?.totalBreadUnits,
    model: input.response?.model ?? input.model,
    errorCode: input.error?.code,
    durationMs: input.durationMs,
  };
  const record: AuditRecord = {
    ...summary,
    photos,
    photoPreview,
    response: input.response,
    error: input.error,
  };
  const recordPath = `${RECORD_PREFIX}${input.id}.json`;
  const reverseTimestamp = String(
    REVERSE_TIME_MAX - new Date(input.createdAt).getTime(),
  ).padStart(13, "0");
  const summaryPath = `${SUMMARY_PREFIX}${reverseTimestamp}_${input.id}.json`;

  await put(recordPath, JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  try {
    await put(summaryPath, JSON.stringify(summary), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
    });
  } catch (error) {
    await del(recordPath).catch(() => undefined);
    throw error;
  }
}

export async function listAuditSummaries({
  cursor,
  limit = 25,
}: {
  cursor?: string;
  limit?: number;
}): Promise<{
  items: AuditSummary[];
  cursor?: string;
  hasMore: boolean;
}> {
  assertStorageConfigured();
  if (process.env.AUDIT_MOCK === "1") {
    return {
      items: MOCK_AUDIT_RECORDS.map(toAuditSummary),
      hasMore: false,
    };
  }
  const result = await list({
    prefix: SUMMARY_PREFIX,
    cursor,
    limit: Math.min(Math.max(limit, 1), MAX_LIST_LIMIT),
  });
  const items = (
    await Promise.all(result.blobs.map((blob) => readJson<AuditSummary>(blob.pathname)))
  ).filter((item): item is AuditSummary => item !== null);

  return {
    items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function getAuditRecord(id: string): Promise<AuditRecord | null> {
  assertStorageConfigured();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (process.env.AUDIT_MOCK === "1") {
    return MOCK_AUDIT_RECORDS.find((record) => record.id === id) ?? null;
  }
  return readJson<AuditRecord>(`${RECORD_PREFIX}${id}.json`);
}

async function readJson<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return (await new Response(result.stream).json()) as T;
}

async function createPhotoPreview(
  photos: SaveAuditInput["photos"],
): Promise<string | undefined> {
  const renderable = photos.filter(
    (photo): photo is typeof photo & { bytes: ArrayBuffer } =>
      photo.bytes instanceof ArrayBuffer,
  );
  if (renderable.length === 0) return undefined;

  const width = 320;
  const height = 240;
  const gap = 8;
  const tileResults = await Promise.all(
    renderable.map(async (photo) => {
      try {
        return await sharp(Buffer.from(photo.bytes))
          .rotate()
          .resize(width, height, { fit: "cover" })
          .webp({ quality: 68 })
          .toBuffer();
      } catch {
        return null;
      }
    }),
  );
  const tiles: Buffer<ArrayBufferLike>[] = [];
  for (const tile of tileResults) {
    if (tile) tiles.push(tile);
  }

  if (tiles.length === 0) return undefined;

  const sheet = await sharp({
    create: {
      width: tiles.length * width + (tiles.length - 1) * gap,
      height,
      channels: 3,
      background: "#f4efe5",
    },
  })
    .composite(
      tiles.map((tile, index) => ({
        input: tile,
        left: index * (width + gap),
        top: 0,
      })),
    )
    .webp({ quality: 72 })
    .toBuffer();

  return `data:image/webp;base64,${sheet.toString("base64")}`;
}

function assertStorageConfigured(): void {
  if (!isAuditStorageConfigured()) {
    throw new AuditStorageNotConfiguredError(
      "Хранилище Vercel Blob не настроено.",
    );
  }
}

function toAuditSummary(record: AuditRecord): AuditSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    status: record.status,
    httpStatus: record.httpStatus,
    description: record.description,
    photoCount: record.photoCount,
    totalCarbs: record.totalCarbs,
    totalBreadUnits: record.totalBreadUnits,
    model: record.model,
    errorCode: record.errorCode,
    durationMs: record.durationMs,
  };
}
