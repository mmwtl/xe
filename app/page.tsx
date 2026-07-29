import { Analyzer } from "./components/analyzer";
import { InstallButton } from "./components/install-button";

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="ХЕ.Счёт">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>ХЕ.СЧЁТ</span>
        </div>
        <div className="xe-rule">
          <span aria-hidden="true" />
          1 ХЕ = 12 г углеводов
        </div>
        <InstallButton />
      </header>

      <section className="workspace">
        <div className="intro-panel">
          <h1>
            Сколько ХЕ
            <em>на тарелке?</em>
          </h1>
          <p className="lead">
            Добавьте до трёх фотографий одного блюда или опишите его. Gemini
            оценит продукты, порции и углеводы, а приложение пересчитает
            результат в ХЕ.
          </p>
          <p className="medical-note">
            Оценка приблизительная. Не используйте результат как единственное
            основание для расчёта дозировки инсулина.
          </p>
        </div>

        <Analyzer />
      </section>

      <footer className="app-footer">
        <span>Gemini API · история хранится на устройстве</span>
        <span>PWA для Android и iOS</span>
      </footer>
    </main>
  );
}
