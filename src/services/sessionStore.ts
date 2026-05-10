import type { ChatMessage, LearningSession, PageLearningRecord } from "../types/learning";
import type { PdfPage } from "../types/pdf";

const dbName = "vibelearning";
const dbVersion = 1;
const sessionStoreName = "sessions";

export type StoredLearningSession = {
  id: string;
  name: string;
  documentTitle: string;
  documentId: string;
  pageCount: number;
  activePageNumber?: number;
  learningSession: LearningSession;
  messages: ChatMessage[];
  pageRecords: PageLearningRecord[];
  pages: PdfPage[];
  searchableText: string;
  createdAt: string;
  updatedAt: string;
};

function toPlainStoredSession(session: StoredLearningSession): StoredLearningSession {
  return JSON.parse(JSON.stringify(session)) as StoredLearningSession;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(sessionStoreName)) {
        const store = db.createObjectStore(sessionStoreName, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("name", "name");
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(sessionStoreName, mode);
        const store = transaction.objectStore(sessionStoreName);
        const request = callback(store);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      })
  );
}

export function buildSearchableText(session: StoredLearningSession) {
  return [
    session.name,
    session.documentTitle,
    ...session.messages.map((message) => message.content),
    ...session.pageRecords.flatMap((record) => [
      record.summary ?? "",
      ...record.keyPoints,
      ...record.questions.map((question) => question.prompt)
    ])
  ]
    .join("\n")
    .toLowerCase();
}

export async function saveStoredSession(session: StoredLearningSession) {
  const plainSession = toPlainStoredSession(session);
  const searchableText = buildSearchableText(plainSession);
  await withStore("readwrite", (store) =>
    store.put({
      ...plainSession,
      searchableText,
      updatedAt: new Date().toISOString()
    })
  );
}

export async function getStoredSession(id: string) {
  return withStore<StoredLearningSession | undefined>("readonly", (store) =>
    store.get(id)
  );
}

export async function listStoredSessions() {
  const sessions = await withStore<StoredLearningSession[]>("readonly", (store) =>
    store.getAll()
  );

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function searchStoredSessions(query: string) {
  const normalized = query.trim().toLowerCase();
  const sessions = await listStoredSessions();

  if (!normalized) {
    return sessions;
  }

  return sessions.filter((session) => session.searchableText.includes(normalized));
}
