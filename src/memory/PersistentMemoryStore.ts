import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { MemoryItem, MemoryType } from '../types.js';
import { IMemoryStore, MemorySearchOptions, MemoryHealth, MemoryItemInput } from './MemoryStore.js';
import { sanitizeSensitiveData } from '../core/Logger.js';

export interface PersistentMemoryStoreOptions {
  dbPath?: string;
  seedWithDefaults?: boolean;
}

export class PersistentMemoryStore implements IMemoryStore {
  private db: DatabaseSync;
  private dbPath: string;
  private lastOperation: string = 'init';
  private lastOperationTime: string = new Date().toISOString();
  private lastError?: string;

  constructor(optionsOrPath?: string | PersistentMemoryStoreOptions, seedDefaults: boolean = true) {
    let options: PersistentMemoryStoreOptions = {};
    if (typeof optionsOrPath === 'string') {
      options = { dbPath: optionsOrPath, seedWithDefaults: seedDefaults };
    } else if (optionsOrPath) {
      options = optionsOrPath;
    }

    const isMemory = options.dbPath === ':memory:';
    if (isMemory) {
      this.dbPath = ':memory:';
    } else {
      this.dbPath = options.dbPath || path.join(process.cwd(), 'data', 'foxty_memory.db');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initDatabase();

    const shouldSeed = options.seedWithDefaults !== false;
    if (shouldSeed) {
      this.seedInitialMemoriesIfEmpty();
    }
  }

  private initDatabase(): void {
    try {
      // WAL mode for durability and concurrent read performance (non-memory databases)
      if (this.dbPath !== ':memory:') {
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA synchronous = NORMAL;');
      }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          type TEXT NOT NULL,
          importance REAL NOT NULL,
          confidence REAL NOT NULL,
          source TEXT NOT NULL,
          target_user TEXT,
          created_at TEXT NOT NULL,
          last_confirmed TEXT,
          safe_for_teasing INTEGER NOT NULL,
          retention TEXT NOT NULL,
          tags TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memories_target_user ON memories(target_user);
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
        CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
      `);
      this.lastOperation = 'init_schema';
      this.lastOperationTime = new Date().toISOString();
    } catch (err: any) {
      this.lastError = sanitizeSensitiveData(err?.message || 'Database initialization error');
      throw err;
    }
  }

  public async save(item: MemoryItemInput): Promise<MemoryItem> {
    this.lastOperation = 'save';
    this.lastOperationTime = new Date().toISOString();

    let content = item.content;
    const lowerContent = content.toLowerCase();
    const sensitiveTokens = ['senha', 'password', 'token', 'secret', 'credencial', 'api_key'];
    const containsSensitive = sensitiveTokens.some((kw) => lowerContent.includes(kw));
    if (containsSensitive) {
      // Strips or sanitizes sensitive data rather than persisting raw secrets
      content = sanitizeSensitiveData(content);
    }

    // 2. Guardrail: SakuraMail Privacy Boundary
    // Never persist private mailbox correspondence into persistent memory
    const lowerSource = (item.source || '').toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const isSakuraMail =
      lowerSource.includes('sakuramail') ||
      tags.some((t) => t.toLowerCase().includes('sakuramail_letter') || t.toLowerCase().includes('mailbox_secret'));

    let safeForTeasing = item.safeForTeasing ?? true;
    if (containsSensitive || isSakuraMail) {
      safeForTeasing = false;
    }

    const importance = typeof item.importance === 'number' ? Math.max(0, Math.min(1, item.importance)) : 0.8;
    const confidence = typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.9;

    // 4. Guardrail: Minimum Confidence Threshold for AI Candidates (Doc 06 & Technical Req)
    const isAiCandidate = tags.includes('deepseek-suggested') || item.source === 'deepseek';
    if (isAiCandidate && confidence < 0.85) {
      throw new Error(`[Memory Policy Violation] Candidate confidence ${confidence} is below required threshold 0.85`);
    }

    const id = item.id || `mem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const createdAt = new Date().toISOString();
    const memory: MemoryItem = {
      id,
      content,
      type: item.type,
      importance,
      confidence,
      source: item.source || 'system',
      targetUser: item.targetUser,
      createdAt,
      lastConfirmed: item.lastConfirmed || createdAt,
      expiresAt: item.expiresAt,
      safeForTeasing,
      retention: item.retention || 'permanent',
      tags,
      scope: item.scope || 'cherry_place',
      metadata: item.metadata || {},
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (
        id, content, type, importance, confidence, source,
        target_user, created_at, last_confirmed, safe_for_teasing,
        retention, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.content,
      memory.type,
      memory.importance,
      memory.confidence,
      memory.source,
      memory.targetUser || null,
      memory.createdAt,
      memory.lastConfirmed || null,
      memory.safeForTeasing ? 1 : 0,
      memory.retention,
      JSON.stringify(memory.tags)
    );

    return memory;
  }

  public async get(id: string): Promise<MemoryItem | null> {
    this.lastOperation = 'get';
    this.lastOperationTime = new Date().toISOString();

    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapRowToMemory(row);
  }

  public async search(query?: string, options?: MemorySearchOptions): Promise<MemoryItem[]> {
    this.lastOperation = 'search';
    this.lastOperationTime = new Date().toISOString();

    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params: any[] = [];

    if (options?.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (options?.targetUser) {
      sql += ' AND target_user = ?';
      params.push(options.targetUser);
    }

    if (options?.safeForTeasingOnly) {
      sql += ' AND safe_for_teasing = 1';
    }

    if (options?.minImportance !== undefined) {
      sql += ' AND importance >= ?';
      params.push(options.minImportance);
    }

    if (query && query.trim()) {
      sql += ' AND (LOWER(content) LIKE ? OR LOWER(tags) LIKE ?)';
      const q = `%${query.toLowerCase().trim()}%`;
      params.push(q, q);
    }

    sql += ' ORDER BY importance DESC, created_at DESC';

    if (options?.limit && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => this.mapRowToMemory(r));
  }

  public async delete(id: string): Promise<boolean> {
    this.lastOperation = 'delete';
    this.lastOperationTime = new Date().toISOString();

    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id) as any;
    return (result.changes ?? 0) > 0;
  }

  public async expire(): Promise<number> {
    this.lastOperation = 'expire';
    this.lastOperationTime = new Date().toISOString();

    // Expire temporary memories older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare(
      "DELETE FROM memories WHERE retention = 'temporary' AND created_at < ?"
    );
    const result = stmt.run(cutoff) as any;
    return result.changes ?? 0;
  }

  public async count(): Promise<number> {
    this.lastOperation = 'count';
    this.lastOperationTime = new Date().toISOString();

    const stmt = this.db.prepare('SELECT COUNT(*) as total FROM memories');
    const result = stmt.get() as any;
    return result?.total ?? 0;
  }

  public async getAll(): Promise<MemoryItem[]> {
    this.lastOperation = 'getAll';
    this.lastOperationTime = new Date().toISOString();

    const stmt = this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((r) => this.mapRowToMemory(r));
  }

  public async clear(): Promise<void> {
    this.lastOperation = 'clear';
    this.lastOperationTime = new Date().toISOString();

    this.db.exec('DELETE FROM memories');
  }

  public async getHealth(): Promise<MemoryHealth> {
    try {
      const ping = this.db.prepare('SELECT 1 as alive').get() as any;
      const countRes = this.db.prepare('SELECT COUNT(*) as total FROM memories').get() as any;
      const recordCount = countRes?.total ?? 0;

      return {
        provider: 'sqlite',
        connected: !!ping?.alive,
        available: true,
        readOk: !!ping?.alive,
        writeOk: !!ping?.alive,
        readWriteOk: true,
        recordCount,
        totalRecords: recordCount,
        lastOperation: this.lastOperation,
        lastOperationTime: this.lastOperationTime,
        lastOperationTimestamp: this.lastOperationTime,
        storagePath: this.dbPath,
        error: this.lastError || null,
      };
    } catch (err: any) {
      return {
        provider: 'sqlite',
        connected: false,
        available: false,
        readOk: false,
        writeOk: false,
        readWriteOk: false,
        recordCount: 0,
        totalRecords: 0,
        lastOperation: this.lastOperation,
        lastOperationTime: this.lastOperationTime,
        lastOperationTimestamp: this.lastOperationTime,
        storagePath: this.dbPath,
        error: sanitizeSensitiveData(err?.message || 'Database health check failed'),
      };
    }
  }

  public close(): void {
    this.db.close();
  }

  private mapRowToMemory(row: any): MemoryItem {
    return {
      id: row.id,
      content: row.content,
      type: row.type as MemoryType,
      importance: Number(row.importance),
      confidence: Number(row.confidence),
      source: row.source,
      targetUser: row.target_user || undefined,
      createdAt: row.created_at,
      lastConfirmed: row.last_confirmed || undefined,
      safeForTeasing: row.safe_for_teasing === 1,
      retention: row.retention as any,
      tags: JSON.parse(row.tags || '[]'),
    };
  }

  private seedInitialMemoriesIfEmpty(): void {
    const existing = this.db.prepare('SELECT COUNT(*) as total FROM memories').get() as any;
    if (existing?.total > 0) {
      return; // Already populated, preserve persistence
    }

    const seeds: Array<Omit<MemoryItem, 'id' | 'createdAt'>> = [
      {
        content: 'Riely tem grande carinho por decorar caminhos com flores e cerejeiras na base de Minecraft.',
        type: 'episodic',
        importance: 0.88,
        confidence: 0.95,
        source: 'cherry-place-history',
        targetUser: 'Riely',
        safeForTeasing: true,
        retention: 'permanent',
        tags: ['minecraft', 'base', 'cerejeira', 'decoracao'],
      },
      {
        content: 'Kris costuma focar em projetos de infraestrutura, escadas e biomas distantes.',
        type: 'episodic',
        importance: 0.82,
        confidence: 0.92,
        source: 'cherry-place-history',
        targetUser: 'Kris',
        safeForTeasing: true,
        retention: 'permanent',
        tags: ['minecraft', 'infraestrutura', 'exploracao'],
      },
      {
        content: 'A base possui uma área protegida dedicada aos Allays e galinhas.',
        type: 'server',
        importance: 0.90,
        confidence: 0.99,
        source: 'server-lore',
        safeForTeasing: true,
        retention: 'permanent',
        tags: ['allay', 'animais', 'base', 'minecraft'],
      },
      {
        content: 'As correspondências na caixa de correio são sagradas e pertencem à ritualística do SakuraMail.',
        type: 'server',
        importance: 0.98,
        confidence: 1.0,
        source: 'boundary-rule',
        safeForTeasing: false,
        retention: 'permanent',
        tags: ['sakuramail', 'privacidade', 'fronteira'],
      },
    ];

    const insertStmt = this.db.prepare(`
      INSERT INTO memories (
        id, content, type, importance, confidence, source,
        target_user, created_at, last_confirmed, safe_for_teasing,
        retention, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    seeds.forEach((seed, index) => {
      const id = `mem-seed-${index + 1}`;
      insertStmt.run(
        id,
        seed.content,
        seed.type,
        seed.importance,
        seed.confidence,
        seed.source,
        seed.targetUser || null,
        now,
        null,
        seed.safeForTeasing ? 1 : 0,
        seed.retention,
        JSON.stringify(seed.tags)
      );
    });
  }
}
