"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AuditRecord,
  AuditStatus,
  AuditSummary,
} from "@/lib/audit-types";

type ListResponse = {
  items: AuditSummary[];
  cursor?: string;
  hasMore: boolean;
  error?: string;
};

type StatusFilter = "all" | AuditStatus;

const NUMBER_FORMAT = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function AdminDashboard() {
  const router = useRouter();
  const [items, setItems] = useState<AuditSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [record, setRecord] = useState<AuditRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/requests", {
          cache: "no-store",
        });
        const payload = (await response.json()) as ListResponse;
        if (!response.ok) throw new Error(payload.error || "Ошибка загрузки.");
        if (cancelled) return;
        setItems(payload.items);
        setCursor(payload.cursor);
        setHasMore(payload.hasMore);

        if (
          payload.items[0] &&
          window.matchMedia("(min-width: 980px)").matches
        ) {
          void selectRecord(payload.items[0].id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось загрузить журнал.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ru-RU");
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
    const toTime = dateTo
      ? new Date(`${dateTo}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return items.filter((item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return (
        (status === "all" || item.status === status) &&
        (!normalizedQuery ||
          item.description.toLocaleLowerCase("ru-RU").includes(normalizedQuery) ||
          item.model?.toLocaleLowerCase("ru-RU").includes(normalizedQuery) ||
          item.errorCode?.toLocaleLowerCase("ru-RU").includes(normalizedQuery)) &&
        createdAt >= fromTime &&
        createdAt <= toTime
      );
    });
  }, [dateFrom, dateTo, deferredQuery, items, status]);

  const counts = useMemo(
    () =>
      items.reduce(
        (result, item) => {
          result[item.status] += 1;
          return result;
        },
        { success: 0, error: 0 },
      ),
    [items],
  );

  async function selectRecord(id: string) {
    setSelectedId(id);
    setRecord(null);
    setIsLoadingRecord(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/requests/${id}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as AuditRecord & {
        error?: AuditRecord["error"] | string;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Не удалось открыть запись.",
        );
      }
      setRecord(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось открыть запись.",
      );
    } finally {
      setIsLoadingRecord(false);
    }
  }

  async function loadMore() {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/requests?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as ListResponse;
      if (!response.ok) throw new Error(payload.error || "Ошибка загрузки.");
      setItems((current) => [...current, ...payload.items]);
      setCursor(payload.cursor);
      setHasMore(payload.hasMore);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить следующую страницу.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  function resetFilters() {
    setStatus("all");
    setQuery("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <main
      className={`admin-shell ${selectedId ? "has-selection" : ""}`}
    >
      <header className="admin-topbar">
        <Link className="admin-brand" href="/">
          <span className="admin-brand-mark" aria-hidden="true">
            <span />
          </span>
          ХЕ.СЧЁТ
        </Link>
        <Link className="admin-back-link" href="/">
          <ArrowLeftIcon />
          К калькулятору
        </Link>
        <div className="admin-top-actions">
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshIcon />
            Обновить
          </button>
          <button type="button" onClick={logout}>
            <LogoutIcon />
            Выйти
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <h2>Фильтры</h2>
          <fieldset>
            <legend>Статус</legend>
            <FilterButton
              active={status === "all"}
              label="Все"
              count={items.length}
              onClick={() => setStatus("all")}
            />
            <FilterButton
              active={status === "success"}
              label="Успешные"
              count={counts.success}
              onClick={() => setStatus("success")}
            />
            <FilterButton
              active={status === "error"}
              label="Ошибки"
              count={counts.error}
              tone="error"
              onClick={() => setStatus("error")}
            />
          </fieldset>
          <fieldset>
            <legend>Диапазон дат</legend>
            <label>
              От
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label>
              До
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
          </fieldset>
          <button
            className="admin-reset-button"
            type="button"
            onClick={resetFilters}
          >
            <RefreshIcon />
            Сбросить фильтры
          </button>
          <p className="admin-filter-note">
            Фильтры применяются к загруженным записям. Для старых записей
            нажмите «Показать ещё».
          </p>
        </aside>

        <section className="admin-list-pane" aria-labelledby="audit-title">
          <div className="admin-list-heading">
            <div>
              <h1 id="audit-title">Журнал запросов</h1>
              <p>{items.length} записей загружено</p>
            </div>
            <label className="admin-search">
              <SearchIcon />
              <span className="visually-hidden">Поиск по описанию</span>
              <input
                type="search"
                placeholder="Поиск по описанию"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p className="admin-alert" role="alert">
              {error}
            </p>
          ) : null}

          <div className="admin-log-table">
            <div className="admin-log-header" aria-hidden="true">
              <span>Время</span>
              <span>Запрос</span>
              <span>Фото</span>
              <span>Результат</span>
              <span>Модель</span>
              <span>Статус</span>
            </div>
            {isLoading ? (
              <AdminEmpty icon={<LoadingIcon />} title="Загружаем журнал…" />
            ) : filteredItems.length === 0 ? (
              <AdminEmpty
                icon={<SearchIcon />}
                title={items.length === 0 ? "Журнал пока пуст" : "Ничего не найдено"}
                text={
                  items.length === 0
                    ? "Новые обращения появятся здесь после завершения анализа."
                    : "Измените запрос или сбросьте фильтры."
                }
              />
            ) : (
              filteredItems.map((item) => (
                <button
                  className={`admin-log-row ${
                    item.id === selectedId ? "is-selected" : ""
                  } ${item.status === "error" ? "is-error" : ""}`}
                  type="button"
                  key={item.id}
                  aria-pressed={item.id === selectedId}
                  onClick={() => void selectRecord(item.id)}
                >
                  <span className="admin-log-time">
                    {DATE_FORMAT.format(new Date(item.createdAt))}
                  </span>
                  <span className="admin-log-request">
                    {item.description || "Запрос по фото"}
                  </span>
                  <span className="admin-log-photos">
                    <PhotoIcon />
                    {item.photoCount}
                  </span>
                  <span className="admin-log-result">
                    {item.status === "success" ? (
                      <>
                        {NUMBER_FORMAT.format(item.totalCarbs ?? 0)} г
                        <small>
                          {NUMBER_FORMAT.format(item.totalBreadUnits ?? 0)} ХЕ
                        </small>
                      </>
                    ) : (
                      item.errorCode || `HTTP ${item.httpStatus}`
                    )}
                  </span>
                  <span className="admin-log-model">{item.model || "—"}</span>
                  <span className={`admin-status admin-status-${item.status}`}>
                    <StatusIcon status={item.status} />
                    {item.status === "success" ? "Успешно" : "Ошибка"}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="admin-pagination">
            <span>
              Показано {filteredItems.length} из {items.length} загруженных
            </span>
            {hasMore ? (
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
              >
                {isLoadingMore ? "Загружаем…" : "Показать ещё"}
              </button>
            ) : null}
          </div>
        </section>

        <aside className="admin-inspector" aria-label="Выбранная запись">
          <button
            className="admin-mobile-back"
            type="button"
            onClick={() => {
              setSelectedId("");
              setRecord(null);
            }}
          >
            <ArrowLeftIcon />
            К журналу
          </button>
          {isLoadingRecord ? (
            <AdminEmpty icon={<LoadingIcon />} title="Открываем запись…" />
          ) : record ? (
            <RecordDetail record={record} onClose={() => {
              setSelectedId("");
              setRecord(null);
            }} />
          ) : (
            <AdminEmpty
              icon={<PointerIcon />}
              title="Выберите запрос"
              text="Полный запрос и ответ откроются здесь."
            />
          )}
        </aside>
      </div>
    </main>
  );
}

function FilterButton({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: "error";
  onClick: () => void;
}) {
  return (
    <button
      className={`${active ? "is-active" : ""} ${
        tone === "error" ? "is-error" : ""
      }`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span>{count}</span>
    </button>
  );
}

function RecordDetail({
  record,
  onClose,
}: {
  record: AuditRecord;
  onClose: () => void;
}) {
  return (
    <div className="admin-record">
      <div className="admin-record-header">
        <div>
          <small>Запрос</small>
          <h2>{DATE_FORMAT.format(new Date(record.createdAt))}</h2>
        </div>
        <span className={`admin-status admin-status-${record.status}`}>
          <StatusIcon status={record.status} />
          {record.status === "success" ? "Успешно" : "Ошибка"}
        </span>
        <button type="button" aria-label="Закрыть запись" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <section className="admin-record-section">
        <h3>Запрос пользователя</h3>
        <p>{record.description || "Текстовое описание не добавлено."}</p>
      </section>

      {record.photos.length > 0 ? (
        <section className="admin-record-section">
          <h3>Фото ({record.photos.length})</h3>
          {record.photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="admin-photo-preview"
              src={record.photoPreview}
              alt={`Превью ${record.photos.length} фотографий блюда`}
            />
          ) : null}
          <div className="admin-photo-meta">
            {record.photos.map((photo, index) => (
              <div key={`${photo.name}-${index}`}>
                <strong>{photo.name || `Фото ${index + 1}`}</strong>
                <span>
                  {formatBytes(photo.size)} · {photo.mimeType}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {record.response ? (
        <section className="admin-record-section">
          <h3>Ответ Gemini</h3>
          <p className="admin-response-summary">{record.response.summary}</p>
          <div className="admin-food-table">
            <div className="admin-food-header">
              <span>Продукт</span>
              <span>Порция</span>
              <span>Углеводы</span>
              <span>ХЕ</span>
            </div>
            {record.response.foods.map((food, index) => (
              <div className="admin-food-row" key={`${food.name}-${index}`}>
                <span>{food.name}</span>
                <span>{NUMBER_FORMAT.format(food.portionGrams)} г</span>
                <span>{NUMBER_FORMAT.format(food.totalCarbs)} г</span>
                <span>{NUMBER_FORMAT.format(food.breadUnits)}</span>
              </div>
            ))}
            <div className="admin-food-total">
              <strong>Итого</strong>
              <span />
              <strong>
                {NUMBER_FORMAT.format(record.response.totalCarbs)} г
              </strong>
              <strong>
                {NUMBER_FORMAT.format(record.response.totalBreadUnits)}
              </strong>
            </div>
          </div>
          {record.response.assumptions.length > 0 ? (
            <div className="admin-assumptions">
              <strong>Допущения</strong>
              <ul>
                {record.response.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {record.error ? (
        <section className="admin-record-error">
          <StatusIcon status="error" />
          <div>
            <strong>{record.error.code || `HTTP ${record.httpStatus}`}</strong>
            <p>{record.error.message}</p>
          </div>
        </section>
      ) : null}

      <dl className="admin-record-meta">
        <div>
          <dt>Уверенность</dt>
          <dd>{confidenceLabel(record.response?.confidence)}</dd>
        </div>
        <div>
          <dt>Модель</dt>
          <dd>{record.model || "—"}</dd>
        </div>
        <div>
          <dt>Длительность</dt>
          <dd>{formatDuration(record.durationMs)}</dd>
        </div>
        <div>
          <dt>HTTP-статус</dt>
          <dd>{record.httpStatus}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd title={record.id}>{record.id.slice(0, 8)}</dd>
        </div>
      </dl>
      <button className="admin-record-close" type="button" onClick={onClose}>
        <CloseIcon />
        Закрыть запись
      </button>
    </div>
  );
}

function AdminEmpty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
}) {
  return (
    <div className="admin-empty">
      {icon}
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${NUMBER_FORMAT.format(bytes / (1024 * 1024))} МБ`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} мс`;
  return `${NUMBER_FORMAT.format(durationMs / 1_000)} сек`;
}

function confidenceLabel(confidence?: string): string {
  if (confidence === "high") return "Высокая";
  if (confidence === "medium") return "Средняя";
  if (confidence === "low") return "Низкая";
  return "—";
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2.1 5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6M9 12h11" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m4 17 5-5 4 4 2-2 5 5" />
    </svg>
  );
}

function StatusIcon({ status }: { status: AuditStatus }) {
  return status === "success" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16.5 9" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.5v.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function PointerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 3 13 9-6 2-3 6L5 3Z" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg className="admin-loading-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
