import { IMemoryStore, MemoryHealth, MemorySearchOptions } from './MemoryStore.js';
import { InMemoryStore } from './InMemoryStore.js';
import { PersistentMemoryStore, PersistentMemoryStoreOptions } from './PersistentMemoryStore.js';
import { FirestoreMemoryStore, FirestoreMemoryStoreOptions } from './FirestoreMemoryStore.js';

export * from './MemoryStore.js';
export * from './InMemoryStore.js';
export * from './PersistentMemoryStore.js';
export * from './FirestoreMemoryStore.js';

export function createDefaultMemoryStore(options?: {
  provider?: 'sqlite' | 'firestore' | 'in-memory';
  sqliteOptions?: PersistentMemoryStoreOptions;
  firestoreOptions?: FirestoreMemoryStoreOptions;
}): IMemoryStore {
  const provider = options?.provider || (process.env.MEMORY_PROVIDER as any) || 'sqlite';

  if (provider === 'in-memory') {
    return new InMemoryStore(true);
  }

  if (provider === 'firestore') {
    return new FirestoreMemoryStore(options?.firestoreOptions);
  }

  // Default is Persistent SQLite with WAL mode & file storage
  return new PersistentMemoryStore(options?.sqliteOptions);
}
