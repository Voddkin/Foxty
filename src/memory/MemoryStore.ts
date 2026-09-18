import { MemoryItem, MemoryType } from '../types.js';

export interface MemorySearchOptions {
  type?: MemoryType;
  targetUser?: 'Kris' | 'Riely' | 'Other';
  safeForTeasingOnly?: boolean;
  minImportance?: number;
  limit?: number;
}

export interface IMemoryStore {
  save(item: Omit<MemoryItem, 'id' | 'createdAt'> & { id?: string }): Promise<MemoryItem>;
  get(id: string): Promise<MemoryItem | null>;
  search(query?: string, options?: MemorySearchOptions): Promise<MemoryItem[]>;
  delete(id: string): Promise<boolean>;
  expire(): Promise<number>;
  count(): Promise<number>;
  getAll(): Promise<MemoryItem[]>;
}
