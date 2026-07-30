"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Не удалось войти.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Сервер недоступен. Повторите попытку.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <label htmlFor="admin-password">Пароль администратора</label>
      <input
        id="admin-password"
        type="password"
        value={password}
        autoComplete="current-password"
        autoFocus
        required
        onChange={(event) => setPassword(event.target.value)}
      />
      {error ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Проверяем…" : "Войти"}
      </button>
    </form>
  );
}
