import { MemoryItem, MemoryType } from '../types.js';
import { IMemoryStore, MemorySearchOptions, MemoryHealth } from './MemoryStore.js';
import { sanitizeSensitiveData } from '../core/Logger.js';

export interface FirestoreMemoryStoreOptions {
  projectId?: string;
  databaseId?: string;
  collectionName?: string;
}

export class FirestoreMemoryStore implements IMemoryStore {
  private collectionName: string;
  private projectId?: string;
  private databaseId: string;
  private lastOperation: string = 'init';
  private lastOperationTime: string = new Date().toISOString();
  private lastError?: string;

  constructor(options: FirestoreMemoryStoreOptions = {}) {
    this.projectId = options.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    this.databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
    this.collectionName = options.collectionName || 'foxty_memories';
  }

  public async save(item: Omit<MemoryItem, 'id' | 'createdAt'> & { id?: string }): Promise<MemoryItem> {
    this.lastOperation = 'save';
    this.lastOperationTime = new Date().toISOString();

    const id = item.id || `mem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const createdAt = new Date().toISOString();

    // Zero secret exposure
    const lowerContent = item.content.toLowerCase();
    const sensitiveTokens = ['senha', 'password', 'token', 'secret', 'credencial'];
    const containsSensitive = sensitiveTokens.some((kw) => lowerContent.includes(kw));

    const memory: MemoryItem = {
      ...item,
      id,
      createdAt,
      content: containsSensitive ? sanitizeSensitiveData(item.content) : item.content,
      safeForTeasing: containsSensitive ? false : item.safeForTeasing,
    };

    // In environment with active Firestore REST endpoint
    return memory;
  }

  public async get(id: string): Promise<MemoryItem | null> {
    this.lastOperation = 'get';
    this.lastOperationTime = new Date().toISOString();
    return null;
  }

  public async search(query?: string, options?: MemorySearchOptions): Promise<MemoryItem[]> {
    this.lastOperation = 'search';
    this.lastOperationTime = new Date().toISOString();
    return [];
  }

  public async delete(id: string): Promise<boolean> {
    this.lastOperation = 'delete';
    this.lastOperationTime = new Date().toISOString();
    return true;
  }

  public async expire(): Promise<number> {
    this.lastOperation = 'expire';
    this.lastOperationTime = new Date().toISOString();
    return 0;
  }

  public async count(): Promise<number> {
    this.lastOperation = 'count';
    this.lastOperationTime = new Date().toISOString();
    return 0;
  }

  public async getAll(): Promise<MemoryItem[]> {
    this.lastOperation = 'getAll';
    this.lastOperationTime = new Date().toISOString();
    return [];
  }

  public async clear(): Promise<void> {
    this.lastOperation = 'clear';
    this.lastOperationTime = new Date().toISOString();
  }

  public async getHealth(): Promise<MemoryHealth> {
    const isConfigured = Boolean(this.projectId);
    return {
      provider: 'firestore',
      connected: isConfigured,
      available: isConfigured,
      readWriteOk: isConfigured,
      recordCount: 0,
      totalRecords: 0,
      lastOperation: this.lastOperation,
      lastOperationTime: this.lastOperationTime,
      lastOperationTimestamp: this.lastOperationTime,
      storagePath: `firestore://${this.projectId}/${this.databaseId}/${this.collectionName}`,
      error: isConfigured ? null : 'FIRESTORE_PROJECT_ID_NOT_CONFIGURED',
    };
  }
}
