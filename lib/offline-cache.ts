import type { DashboardData } from "./types";

const DB_NAME = "pole-position-hq";
const STORE_NAME = "session-snapshots";
const DB_VERSION = 1;
const MAX_SNAPSHOTS = 3;

type CachedDashboardSnapshot = {
  id: string;
  generatedAt: string;
  sessionKey: string;
  payload: DashboardData;
};

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDashboardDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("generatedAt", "generatedAt");
      }
    };

    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDashboardDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = callback(store);

        transaction.oncomplete = () => {
          db.close();
          resolve(request ? request.result : undefined);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("IndexedDB transaction failed"));
        };
      }),
  );
}

function getSessionKey(data: DashboardData) {
  return String(
    data.nextSession?.meetingKey ??
      data.telemetrySession?.meetingKey ??
      data.trackMap.circuitName ??
      data.season,
  );
}

export async function saveDashboardSnapshot(data: DashboardData) {
  if (!canUseIndexedDb()) {
    return;
  }

  const snapshot: CachedDashboardSnapshot = {
    id: `${getSessionKey(data)}:${data.generatedAt}`,
    generatedAt: data.generatedAt,
    sessionKey: getSessionKey(data),
    payload: data,
  };

  await withStore("readwrite", (store) => {
    store.put(snapshot);
  });

  const snapshots = await listDashboardSnapshots();
  await Promise.all(
    snapshots.slice(MAX_SNAPSHOTS).map((stale) =>
      withStore("readwrite", (store) => {
        store.delete(stale.id);
      }),
    ),
  );
}

export async function listDashboardSnapshots() {
  if (!canUseIndexedDb()) {
    return [] as CachedDashboardSnapshot[];
  }

  const snapshots =
    (await withStore<CachedDashboardSnapshot[]>("readonly", (store) =>
      store.getAll(),
    )) ?? [];

  return snapshots.sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
}

export async function loadLatestDashboardSnapshot() {
  const [snapshot] = await listDashboardSnapshots();
  return snapshot?.payload ?? null;
}
