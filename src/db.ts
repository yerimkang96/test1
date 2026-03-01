import { openDB } from 'idb';

export type StampRecord = {
  dateKey: string;
  blob: Blob;
  updatedAt: number;
};

const DB_NAME = 'stamp-calendar';
const STORE_NAME = 'stamps';
const DB_VERSION = 1;

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'dateKey' });
      }
    },
  });
}

export async function getAllStamps(): Promise<StampRecord[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function putStamp(dateKey: string, blob: Blob): Promise<void> {
  const db = await getDb();
  const record: StampRecord = {
    dateKey,
    blob,
    updatedAt: Date.now(),
  };
  await db.put(STORE_NAME, record);
}

export async function deleteStamp(dateKey: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, dateKey);
}
