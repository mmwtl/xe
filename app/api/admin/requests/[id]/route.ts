import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  AuditStorageNotConfiguredError,
  getAuditRecord,
} from "@/lib/audit-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  try {
    const record = await getAuditRecord((await params).id);
    if (!record) {
      return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
    }
    return NextResponse.json(record, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof AuditStorageNotConfiguredError
        ? "Подключите private Vercel Blob к проекту."
        : "Не удалось прочитать запись.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof AuditStorageNotConfiguredError ? 503 : 502 },
    );
  }
}
