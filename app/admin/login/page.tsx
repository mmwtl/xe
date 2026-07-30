import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AdminLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  return (
    <main className="admin-login-shell">
      <Link className="admin-login-brand" href="/">
        <span className="admin-brand-mark" aria-hidden="true">
          <span />
        </span>
        ХЕ.СЧЁТ
      </Link>
      <section className="admin-login-panel">
        <h1>Вход в журнал</h1>
        <p>
          Здесь хранятся запросы пользователей и ответы Gemini. Доступ закрыт
          отдельным паролем администратора.
        </p>
        <AdminLoginForm />
      </section>
      <p className="admin-login-footnote">
        Пароль передаётся только серверу и сохраняется в виде подписанной
        HttpOnly-сессии.
      </p>
    </main>
  );
}
