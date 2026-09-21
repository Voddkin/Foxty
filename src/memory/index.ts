import { IMemoryStore, MemoryHealth, MemorySearchOptions } from './MemoryStore.js';
import { InMemoryStore } from './InMemoryStore.js';
import { PersistentMemoryStore, PersistentMemoryStoreOptions } from './PersistentMemoryStore.js';
import { FirestoreMemoryStore, FirestoreMemoryStoreOptions } from './FirestoreMemoryStore.js';

export * from './MemoryStore.js';
export * from './InMemoryStore.js';
export * from './PersistentMemoryStore.js';
export * from './FirestoreMemoryStore.js';
export * from './ContextualRetriever.js';
export * from './MigrationTool.js';

export function determineActiveMemoryProvider(requested?: 'sqlite' | 'firestore' | 'in-memory'): 'sqlite' | 'firestore' | 'in-memory' {
  if (requested) return requested;

  const envProvider = process.env.MEMORY_PROVIDER?.toLowerCase();
  if (envProvider === 'firestore') return 'firestore';
  if (envProvider === 'sqlite') return 'sqlite';
  if (envProvider === 'in-memory' || envProvider === 'memory') return 'in-memory';

  // Only default to firestore if explicit Firebase config is provided
  if (process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return 'firestore';
  }

  // Local development default
  return 'sqlite';
}

export function createDefaultMemoryStore(options?: {
  provider?: 'sqlite' | 'firestore' | 'in-memory';
  sqliteOptions?: PersistentMemoryStoreOptions;
  firestoreOptions?: FirestoreMemoryStoreOptions;
}): IMemoryStore {
  const provider = determineActiveMemoryProvider(options?.provider);

  if (provider === 'in-memory') {
    return new InMemoryStore(true);
  }

  if (provider === 'firestore') {
    return new FirestoreMemoryStore(options?.firestoreOptions);
  }

  // Default is Persistent SQLite with WAL mode & file storage
  return new PersistentMemoryStore(options?.sqliteOptions);
}
