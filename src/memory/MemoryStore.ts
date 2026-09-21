import { MemoryItem, MemoryType } from '../types.js';

export interface MemorySearchOptions {
  type?: MemoryType;
  targetUser?: 'Kris' | 'Riely' | 'Other';
  safeForTeasingOnly?: boolean;
  minImportance?: number;
  limit?: number;
}

export interface MemoryHealth {
  provider: 'sqlite' | 'firestore' | 'in-memory';
  connected: boolean;
  available: boolean;
  readWriteOk: boolean;
  recordCount: number;
  totalRecords: number;
  lastOperation: string;
  lastOperationTime?: string;
  lastOperationTimestamp?: string;
  storagePath: string;
  error: string | null;
}

export interface IMemoryStore {
  save(item: Omit<MemoryItem, 'id' | 'createdAt'> & { id?: string }): Promise<MemoryItem>;
  get(id: string): Promise<MemoryItem | null>;
  search(query?: string, options?: MemorySearchOptions): Promise<MemoryItem[]>;
  delete(id: string): Promise<boolean>;
  expire(): Promise<number>;
  count(): Promise<number>;
  getAll(): Promise<MemoryItem[]>;
  clear(): Promise<void>;
  getHealth(): Promise<MemoryHealth>;
}

