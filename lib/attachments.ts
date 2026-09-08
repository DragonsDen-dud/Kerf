/**
 * Proof storage.
 *
 * A photo or PDF of the supplier's quote lives in IndexedDB rather than
 * localStorage: quotes are megabytes, localStorage is a ~5MB string budget the
 * take-off itself needs. Everything degrades quietly — if IndexedDB is
 * unavailable (private browsing, locked-down browser) the price record still
 * carries its written provenance, just without the picture.
 */

const DB_NAME = "kerf-proof";
const STORE = "attachments";
const VERSION = 1;

/** Anything larger than this is refused; a phone photo of a quote is ~2-4MB. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store attachments"));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Storage request failed"));
        transaction.oncomplete = () => db.close();
      }),
  );
}

export interface StoredAttachment {
  blob: Blob;
  name: string;
  type: string;
  size: number;
  savedAt: string;
}

export async function putAttachment(id: string, file: File): Promise<StoredAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB.`,
    );
  }
  const record: StoredAttachment = {
    blob: file,
    name: file.name,
    type: file.type,
    size: file.size,
    savedAt: new Date().toISOString(),
  };
  await tx("readwrite", (store) => store.put(record, id));
  return record;
}

export async function getAttachment(id: string): Promise<StoredAttachment | null> {
  try {
    const record = await tx<StoredAttachment | undefined>("readonly", (store) => store.get(id));
    return record ?? null;
  } catch {
    return null;
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  try {
    await tx("readwrite", (store) => store.delete(id));
  } catch {
    // Nothing to do — the price record's written provenance is unaffected.
  }
}

/** Object URLs must be revoked by the caller once the preview is torn down. */
export async function attachmentUrl(id: string): Promise<string | null> {
  const record = await getAttachment(id);
  return record ? URL.createObjectURL(record.blob) : null;
}
