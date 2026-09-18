import { MemoryItem } from '../types.js';
import { IMemoryStore, MemorySearchOptions } from './MemoryStore.js';

export class InMemoryStore implements IMemoryStore {
  private store: Map<string, MemoryItem> = new Map();

  constructor(seedWithDefaults = true) {
    if (seedWithDefaults) {
      this.seedInitialMemories();
    }
  }

  public async save(item: Omit<MemoryItem, 'id' | 'createdAt'> & { id?: string }): Promise<MemoryItem> {
    const id = item.id || `mem-${Math.random().toString(36).substring(2, 9)}`;
    const createdAt = new Date().toISOString();
    const memory: MemoryItem = {
      ...item,
      id,
      createdAt,
    };
    this.store.set(id, memory);
    return memory;
  }

  public async get(id: string): Promise<MemoryItem | null> {
    return this.store.get(id) ?? null;
  }

  public async search(query?: string, options?: MemorySearchOptions): Promise<MemoryItem[]> {
    let items = Array.from(this.store.values());

    if (options?.type) {
      items = items.filter((m) => m.type === options.type);
    }

    if (options?.targetUser) {
      items = items.filter((m) => m.targetUser === options.targetUser);
    }

    if (options?.safeForTeasingOnly) {
      items = items.filter((m) => m.safeForTeasing);
    }

    if (options?.minImportance !== undefined) {
      items = items.filter((m) => m.importance >= options.minImportance!);
    }

    if (query && query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    // Sort by importance descending
    items.sort((a, b) => b.importance - a.importance);

    if (options?.limit && options.limit > 0) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  public async expire(): Promise<number> {
    let expiredCount = 0;
    const now = Date.now();
    for (const [id, item] of this.store.entries()) {
      if (item.retention === 'temporary') {
        const ageHours = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          this.store.delete(id);
          expiredCount++;
        }
      }
    }
    return expiredCount;
  }

  public async count(): Promise<number> {
    return this.store.size;
  }

  public async getAll(): Promise<MemoryItem[]> {
    return Array.from(this.store.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private seedInitialMemories(): void {
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

    seeds.forEach((seed, index) => {
      const id = `mem-seed-${index + 1}`;
      this.store.set(id, {
        ...seed,
        id,
        createdAt: new Date().toISOString(),
      });
    });
  }
}
