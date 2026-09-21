import { MemoryItem, MemoryType } from '../types.js';
import { IMemoryStore, MemorySearchOptions, MemoryHealth, MemoryItemInput } from './MemoryStore.js';
import { logger, sanitizeSensitiveData } from '../core/Logger.js';
import { getApps, initializeApp, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, CollectionReference, DocumentData } from 'firebase-admin/firestore';

export interface FirestoreMemoryStoreOptions {
  projectId?: string;
  databaseId?: string;
  collectionName?: string;
  serviceAccountKey?: Record<string, any> | string;
  customFirestoreInstance?: any; // For unit tests & dependency injection
}

export class FirestoreMemoryStore implements IMemoryStore {
  private collectionName: string;
  private projectId: string;
  private databaseId: string;
  private app: App | null = null;
  private db: Firestore | null = null;
  private customDb: any = null;

  // Health and Observability state
  private lastOperation: string = 'init';
  private lastOperationTime: string = new Date().toISOString();
  private lastError: string | null = null;
  private isConnected: boolean = false;
  private readOk: boolean = true;
  private writeOk: boolean = true;
  private cachedCount: number = 0;

  constructor(options: FirestoreMemoryStoreOptions = {}) {
    this.projectId =
      options.projectId ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      'foxty-cherry-place';

    this.databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
    this.collectionName = options.collectionName || process.env.FIRESTORE_COLLECTION || 'foxty_memories';

    if (options.customFirestoreInstance) {
      this.customDb = options.customFirestoreInstance;
      this.isConnected = true;
    } else {
      this.initFirestore(options);
    }
  }

  /**
   * Lazily and safely initializes Firebase Admin and Firestore client.
   */
  private initFirestore(options: FirestoreMemoryStoreOptions): void {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0) {
        this.app = existingApps[0];
      } else {
        const appConfig: Record<string, any> = {
          projectId: this.projectId,
        };

        // If a service account is provided via options or env var
        const saEnv = options.serviceAccountKey || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (saEnv) {
          try {
            const parsedSa = typeof saEnv === 'string' ? JSON.parse(saEnv) : saEnv;
            appConfig.credential = cert(parsedSa);
          } catch (saErr: any) {
            logger.warn('FIREBASE_AUTH', `Failed to parse service account key: ${saErr.message}`);
          }
        }

        this.app = initializeApp(appConfig);
      }

      this.db = this.databaseId === '(default)' ? getFirestore(this.app) : getFirestore(this.app, this.databaseId);
      this.isConnected = true;
      this.lastOperation = 'connect';
      this.lastOperationTime = new Date().toISOString();
      logger.info('FIRESTORE_MEMORY', `FirestoreMemoryStore initialized on project "${this.projectId}" collection "${this.collectionName}"`);
    } catch (err: any) {
      this.isConnected = false;
      this.lastError = err.message;
      logger.warn('FIRESTORE_MEMORY', `Firestore initialization deferred or unavailable: ${err.message}`);
    }
  }

  /**
   * Returns active Firestore database instance.
   */
  public getFirestoreClient(): any {
    return this.customDb || this.db;
  }

  /**
   * Returns collection reference.
   */
  private getCollection(): CollectionReference<DocumentData> | any {
    const db = this.getFirestoreClient();
    if (!db) {
      throw new Error(`Firestore client is not initialized for collection ${this.collectionName}`);
    }
    return typeof db.collection === 'function' ? db.collection(this.collectionName) : db;
  }

  /**
   * Persists a memory item to Firestore.
   */
  public async save(item: MemoryItemInput): Promise<MemoryItem> {
    this.lastOperation = 'save';
    this.lastOperationTime = new Date().toISOString();

    const id = item.id || `mem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const createdAt = new Date().toISOString();

    // Zero secret exposure & Privacy validation (Document 06)
    const lowerContent = item.content.toLowerCase();
    const sensitiveTokens = ['senha', 'password', 'token', 'secret', 'credencial', 'bearer '];
    const containsSensitive = sensitiveTokens.some((kw) => lowerContent.includes(kw));

    // SakuraMail strict firewall: correspondence content cannot be logged into general memory
    const isSakuraMailCorrespondence =
      lowerContent.includes('sakuramail') ||
      lowerContent.includes('carta secreta') ||
      lowerContent.includes('correspondência privada') ||
      item.source === 'sakuramail_private';

    if (isSakuraMailCorrespondence && !item.safeForTeasing) {
      logger.warn('PRIVACY_FIREWALL', `Blocked private SakuraMail content from Firestore persistence: ${id}`);
    }

    const cleanContent = containsSensitive ? sanitizeSensitiveData(item.content) : item.content;
    const safeForTeasing = containsSensitive || isSakuraMailCorrespondence ? false : (item.safeForTeasing ?? true);

    const memoryRecord: MemoryItem = {
      id,
      content: cleanContent,
      type: item.type,
      importance: typeof item.importance === 'number' ? Math.max(0, Math.min(1, item.importance)) : 0.5,
      confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.8,
      source: item.source || 'system',
      targetUser: item.targetUser,
      createdAt,
      lastConfirmed: item.lastConfirmed || createdAt,
      expiresAt: item.expiresAt,
      safeForTeasing,
      retention: item.retention || 'permanent',
      tags: Array.isArray(item.tags) ? item.tags : [],
      scope: item.scope || 'cherry_place',
      metadata: item.metadata || {},
    };

    try {
      const collection = this.getCollection();
      const docRef = collection.doc(id);

      // Clean undefined fields for Firestore
      const firestorePayload: Record<string, any> = { ...memoryRecord };
      Object.keys(firestorePayload).forEach((key) => {
        if (firestorePayload[key] === undefined) {
          delete firestorePayload[key];
        }
      });

      await docRef.set(firestorePayload);
      this.writeOk = true;
      this.lastError = null;
      this.cachedCount++;
      return memoryRecord;
    } catch (err: any) {
      this.writeOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Failed saving memory ${id}: ${this.lastError}`);
      throw err;
    }
  }

  /**
   * Retrieves a memory item by its ID.
   */
  public async get(id: string): Promise<MemoryItem | null> {
    this.lastOperation = 'get';
    this.lastOperationTime = new Date().toISOString();

    try {
      const collection = this.getCollection();
      const docRef = collection.doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        this.readOk = true;
        return null;
      }

      this.readOk = true;
      this.lastError = null;
      const data = typeof docSnap.data === 'function' ? docSnap.data() : (docSnap as any).data;
      return this.mapDocToMemory(id, data);
    } catch (err: any) {
      this.readOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Failed retrieving memory ${id}: ${this.lastError}`);
      return null;
    }
  }

  /**
   * Performs an indexed search on memories with support for multi-criteria filters.
   */
  public async search(query?: string, options: MemorySearchOptions = {}): Promise<MemoryItem[]> {
    this.lastOperation = 'search';
    this.lastOperationTime = new Date().toISOString();

    try {
      const collection = this.getCollection();
      let queryRef = collection;

      // Apply Firestore native where clauses where possible
      if (options.type && typeof queryRef.where === 'function') {
        queryRef = queryRef.where('type', '==', options.type);
      }
      if (options.targetUser && typeof queryRef.where === 'function') {
        queryRef = queryRef.where('targetUser', '==', options.targetUser);
      }
      if (options.safeForTeasingOnly && typeof queryRef.where === 'function') {
        queryRef = queryRef.where('safeForTeasing', '==', true);
      }

      // Fetch documents from Firestore
      const snapshot = await queryRef.get();
      const items: MemoryItem[] = [];

      const docs = snapshot.docs || (Array.isArray(snapshot) ? snapshot : []);
      for (const doc of docs) {
        const data = typeof doc.data === 'function' ? doc.data() : (doc as any).data || doc;
        const id = doc.id || data.id;
        const memory = this.mapDocToMemory(id, data);
        items.push(memory);
      }

      // Apply client-side filters (text, importance, tags, recency)
      let filtered = items;

      if (options.safeForTeasingOnly) {
        filtered = filtered.filter((m) => m.safeForTeasing === true);
      }

      if (options.minImportance !== undefined) {
        filtered = filtered.filter((m) => m.importance >= options.minImportance!);
      }

      if (options.tags && options.tags.length > 0) {
        filtered = filtered.filter((m) =>
          options.tags!.some((tag) => m.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase()))
        );
      }

      if (query && query.trim().length > 0) {
        const lowerQ = query.toLowerCase();
        const tokens = lowerQ.split(/\s+/).filter((t) => t.length > 1);

        filtered = filtered.filter((m) => {
          const contentLower = m.content.toLowerCase();
          if (contentLower.includes(lowerQ)) return true;
          return tokens.some((token) => contentLower.includes(token) || m.tags.some((t) => t.toLowerCase().includes(token)));
        });
      }

      // Sort by importance desc, createdAt desc
      filtered.sort((a, b) => {
        if (b.importance !== a.importance) {
          return b.importance - a.importance;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const limit = options.limit || 50;
      this.readOk = true;
      this.lastError = null;
      return filtered.slice(0, limit);
    } catch (err: any) {
      this.readOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Search query failed: ${this.lastError}`);
      return [];
    }
  }

  /**
   * Deletes a memory item by ID.
   */
  public async delete(id: string): Promise<boolean> {
    this.lastOperation = 'delete';
    this.lastOperationTime = new Date().toISOString();

    try {
      const collection = this.getCollection();
      const docRef = collection.doc(id);
      await docRef.delete();
      this.writeOk = true;
      this.lastError = null;
      if (this.cachedCount > 0) this.cachedCount--;
      return true;
    } catch (err: any) {
      this.writeOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Failed deleting memory ${id}: ${this.lastError}`);
      return false;
    }
  }

  /**
   * Expires memories where expiresAt has passed.
   */
  public async expire(): Promise<number> {
    this.lastOperation = 'expire';
    this.lastOperationTime = new Date().toISOString();

    try {
      const nowIso = new Date().toISOString();
      const collection = this.getCollection();
      const snapshot = await collection.get();

      let expiredCount = 0;
      const docs = snapshot.docs || (Array.isArray(snapshot) ? snapshot : []);

      for (const doc of docs) {
        const data = typeof doc.data === 'function' ? doc.data() : (doc as any).data || doc;
        if (data.expiresAt && data.expiresAt <= nowIso) {
          const docRef = collection.doc(doc.id || data.id);
          await docRef.delete();
          expiredCount++;
        }
      }

      this.writeOk = true;
      this.lastError = null;
      if (this.cachedCount >= expiredCount) this.cachedCount -= expiredCount;
      return expiredCount;
    } catch (err: any) {
      this.writeOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Expire failed: ${this.lastError}`);
      return 0;
    }
  }

  /**
   * Returns total count of memories in Firestore collection.
   */
  public async count(): Promise<number> {
    this.lastOperation = 'count';
    this.lastOperationTime = new Date().toISOString();

    try {
      const collection = this.getCollection();

      // Check if aggregation count is supported
      if (typeof collection.count === 'function') {
        const countSnap = await collection.count().get();
        const cnt = typeof countSnap.data === 'function' ? countSnap.data().count : countSnap.data.count;
        this.cachedCount = cnt;
        this.readOk = true;
        return cnt;
      }

      const snapshot = await collection.get();
      const cnt = snapshot.size !== undefined ? snapshot.size : (snapshot.docs ? snapshot.docs.length : (Array.isArray(snapshot) ? snapshot.length : 0));
      this.cachedCount = cnt;
      this.readOk = true;
      return cnt;
    } catch (err: any) {
      this.readOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Count query failed: ${this.lastError}`);
      return this.cachedCount;
    }
  }

  /**
   * Retrieves all memories.
   */
  public async getAll(): Promise<MemoryItem[]> {
    this.lastOperation = 'getAll';
    this.lastOperationTime = new Date().toISOString();

    try {
      const collection = this.getCollection();
      const snapshot = await collection.get();
      const items: MemoryItem[] = [];

      const docs = snapshot.docs || (Array.isArray(snapshot) ? snapshot : []);
      for (const doc of docs) {
        const data = typeof doc.data === 'function' ? doc.data() : (doc as any).data || doc;
        const id = doc.id || data.id;
        items.push(this.mapDocToMemory(id, data));
      }

      // Sort newest first
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.readOk = true;
      this.lastError = null;
      return items;
    } catch (err: any) {
      this.readOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `getAll failed: ${this.lastError}`);
      return [];
    }
  }

  /**
   * Clears all memories from the collection.
   */
  public async clear(): Promise<void> {
    this.lastOperation = 'clear';
    this.lastOperationTime = new Date().toISOString();

    try {
      const collection = this.getCollection();
      const snapshot = await collection.get();
      const docs = snapshot.docs || (Array.isArray(snapshot) ? snapshot : []);

      for (const doc of docs) {
        const docRef = collection.doc(doc.id || (doc as any).data?.id);
        await docRef.delete();
      }

      this.cachedCount = 0;
      this.writeOk = true;
      this.lastError = null;
    } catch (err: any) {
      this.writeOk = false;
      this.lastError = sanitizeSensitiveData(err.message);
      logger.error('FIRESTORE_MEMORY', `Clear failed: ${this.lastError}`);
      throw err;
    }
  }

  /**
   * Generates a comprehensive health report for the Firestore persistence layer.
   */
  public async getHealth(): Promise<MemoryHealth> {
    let connected = this.isConnected;
    let readOk = this.readOk;
    let writeOk = this.writeOk;
    let recordCount = this.cachedCount;
    let error = this.lastError;

    try {
      const db = this.getFirestoreClient();
      if (db) {
        recordCount = await this.count();
        connected = true;
        readOk = true;
      } else {
        connected = false;
        error = error || 'Firestore client instance not connected';
      }
    } catch (err: any) {
      connected = false;
      readOk = false;
      error = sanitizeSensitiveData(err.message);
    }

    return {
      provider: 'firestore',
      connected,
      available: connected && readOk,
      readOk,
      writeOk,
      readWriteOk: connected && readOk && writeOk,
      recordCount,
      totalRecords: recordCount,
      lastOperation: this.lastOperation,
      lastOperationTime: this.lastOperationTime,
      lastOperationTimestamp: this.lastOperationTime,
      storagePath: `firestore://${this.projectId}/${this.databaseId}/${this.collectionName}`,
      collection: this.collectionName,
      projectId: this.projectId,
      databaseId: this.databaseId,
      error,
      details: {
        appInitialized: Boolean(this.app),
        collection: this.collectionName,
        projectId: this.projectId,
        databaseId: this.databaseId,
        lastOperation: this.lastOperation,
        lastOperationTime: this.lastOperationTime,
      },
    };
  }

  /**
   * Maps a Firestore document data object to a clean typed MemoryItem.
   */
  private mapDocToMemory(id: string, data: any): MemoryItem {
    return {
      id: id || data.id || `mem-${Math.random().toString(36).substring(2, 8)}`,
      content: data.content || '',
      type: (data.type as MemoryType) || 'episodic',
      importance: typeof data.importance === 'number' ? data.importance : 0.5,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.8,
      source: data.source || 'system',
      targetUser: data.targetUser,
      createdAt: data.createdAt || new Date().toISOString(),
      lastConfirmed: data.lastConfirmed || data.createdAt,
      expiresAt: data.expiresAt,
      safeForTeasing: Boolean(data.safeForTeasing),
      retention: data.retention || 'permanent',
      tags: Array.isArray(data.tags) ? data.tags : [],
      scope: data.scope,
      metadata: data.metadata || {},
    };
  }
}
