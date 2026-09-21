import { MemoryItem, MemoryType } from '../types.js';

export interface MemorySearchOptions {
  type?: MemoryType;
  targetUser?: 'Kris' | 'Riely' | 'Other';
  safeForTeasingOnly?: boolean;
  minImportance?: number;
  limit?: number;
  tags?: string[];
  minRecencyMs?: number;
  sortBy?: 'importance' | 'recency' | 'combined';
}

export interface MemoryHealth {
  provider: 'sqlite' | 'firestore' | 'in-memory';
  connected: boolean;
  available: boolean;
  readOk: boolean;
  writeOk: boolean;
  readWriteOk: boolean;
  recordCount: number;
  totalRecords: number;
  lastOperation: string;
  lastOperationTime?: string;
  lastOperationTimestamp?: string;
  storagePath: string;
  collection?: string;
  projectId?: string;
  databaseId?: string;
  error: string | null;
  details?: Record<string, any>;
}

export type MemoryItemInput = Partial<Omit<MemoryItem, 'id' | 'createdAt'>> & {
  content: string;
  type: MemoryType;
  id?: string;
};

export interface IMemoryStore {
  save(item: MemoryItemInput): Promise<MemoryItem>;
  get(id: string): Promise<MemoryItem | null>;
  search(query?: string, options?: MemorySearchOptions): Promise<MemoryItem[]>;
  delete(id: string): Promise<boolean>;
  expire(): Promise<number>;
  count(): Promise<number>;
  getAll(): Promise<MemoryItem[]>;
  clear(): Promise<void>;
  getHealth(): Promise<MemoryHealth>;
}

