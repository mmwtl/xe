import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  AuditStorageNotConfiguredError,
  listAuditSummaries,
} from "@/lib/audit-storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") || undefined;

  try {
    const result = await listAuditSummaries({ cursor, limit: 25 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof AuditStorageNotConfiguredError
        ? "Подключите private Vercel Blob к проекту."
        : "Не удалось прочитать журнал запросов.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof AuditStorageNotConfiguredError ? 503 : 502 },
    );
  }
}
