import type { MealAnalysis } from "@/lib/types";

export type AnalysisMode = "photo" | "text";

export type AnalysisHistoryEntry = {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  description: string;
  photos?: Blob[];
  photoNames?: string[];
  // Legacy fields from history entries created before multi-photo support.
  photo?: Blob;
  photoName?: string;
  result?: MealAnalysis;
  error?: string;
};

const DATABASE_NAME = "xe-schet";
const DATABASE_VERSION = 1;
const STORE_NAME = "analysis-history";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

export async function getHistory(): Promise<AnalysisHistoryEntry[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();

    request.onsuccess = () => {
      const entries = request.result as AnalysisHistoryEntry[];
      entries.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      );
      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveHistoryEntry(entry: AnalysisHistoryEntry) {
  const database = await openDatabase();
  await runWriteTransaction(database, (store) => store.put(entry));
}

export async function clearHistory() {
  const database = await openDatabase();
  await runWriteTransaction(database, (store) => store.clear());
}

function runWriteTransaction(
  database: IDBDatabase,
  operation: (store: IDBObjectStore) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}
