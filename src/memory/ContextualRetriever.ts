import {
  MemoryItem,
  MemoryType,
  ContextualScoredMemory,
} from '../types.js';
import { IMemoryStore, MemorySearchOptions } from './MemoryStore.js';
import { isSakuraMailChannel } from '../config/index.js';

export interface RetrievalContext {
  queryText?: string;
  currentSpeaker?: string;
  targetUser?: 'Kris' | 'Riely' | 'Other';
  channelId?: string;
  channelCategory?: string;
  activeTopics?: string[];
  safeForTeasingRequired?: boolean;
  minImportance?: number;
  allowedTypes?: MemoryType[];
  limit?: number;
}

export interface ISemanticEmbeddingProvider {
  computeSimilarity(queryText: string, memoryContent: string): Promise<number>;
}

export interface IMemoryRetriever {
  retrieve(
    store: IMemoryStore,
    context: RetrievalContext
  ): Promise<ContextualScoredMemory[]>;
  scoreMemory(memory: MemoryItem, context: RetrievalContext): ContextualScoredMemory;
}

export class ContextualRetriever implements IMemoryRetriever {
  private semanticProvider?: ISemanticEmbeddingProvider;

  constructor(semanticProvider?: ISemanticEmbeddingProvider) {
    this.semanticProvider = semanticProvider;
  }

  public setSemanticProvider(provider: ISemanticEmbeddingProvider): void {
    this.semanticProvider = provider;
  }

  /**
   * Retrieves, filters, and ranks candidate memories using multi-factor contextual scoring.
   */
  public async retrieve(
    store: IMemoryStore,
    context: RetrievalContext
  ): Promise<ContextualScoredMemory[]> {
    // 1. If channel is SakuraMail, return empty immediately to protect privacy
    if (context.channelId && isSakuraMailChannel(context.channelId)) {
      return [];
    }

    // 2. Fetch candidates from store
    const searchOptions: MemorySearchOptions = {
      type: context.allowedTypes && context.allowedTypes.length === 1 ? context.allowedTypes[0] : undefined,
      targetUser: context.targetUser,
      safeForTeasingOnly: context.safeForTeasingRequired,
      minImportance: context.minImportance,
      tags: context.activeTopics,
      limit: context.limit ? Math.max(context.limit * 3, 30) : 50,
    };

    const rawMemories = await store.search(context.queryText, searchOptions);

    // 3. Score every candidate
    const scored: ContextualScoredMemory[] = [];

    for (const memory of rawMemories) {
      // Hard filter on safeForTeasing if required
      if (context.safeForTeasingRequired && !memory.safeForTeasing) {
        continue;
      }

      // Hard filter on allowedTypes if multiple types specified
      if (context.allowedTypes && context.allowedTypes.length > 0 && !context.allowedTypes.includes(memory.type)) {
        continue;
      }

      const item = this.scoreMemory(memory, context);
      if (item.score > 0.05) {
        scored.push(item);
      }
    }

    // 4. Sort descending by total score
    scored.sort((a, b) => b.score - a.score);

    // 5. Apply final limit
    const limit = context.limit || 10;
    return scored.slice(0, limit);
  }

  /**
   * Computes a multi-factor mathematical score for a memory in relation to the conversational context.
   */
  public scoreMemory(memory: MemoryItem, context: RetrievalContext): ContextualScoredMemory {
    // Factor 1: Textual / Keyword relevance
    const textMatchScore = this.computeTextMatchScore(memory.content, context.queryText, memory.tags);

    // Factor 2: Recency Decay (exponential half-life)
    const recencyScore = this.computeRecencyScore(memory.createdAt, memory.type);

    // Factor 3: Intrinsic Importance & Confidence
    const importance = typeof memory.importance === 'number' ? Math.max(0, Math.min(1, memory.importance)) : 0.5;
    const confidence = typeof memory.confidence === 'number' ? Math.max(0, Math.min(1, memory.confidence)) : 0.8;
    const importanceScore = importance * 0.7 + confidence * 0.3;

    // Factor 4: Target User Contextual Alignment
    let targetUserBonus = 0;
    if (context.targetUser && memory.targetUser) {
      if (context.targetUser === memory.targetUser) {
        targetUserBonus = 0.2;
      }
    } else if (context.currentSpeaker && memory.targetUser) {
      const speakerLower = context.currentSpeaker.toLowerCase();
      if (
        (memory.targetUser === 'Kris' && (speakerLower.includes('kris') || speakerLower.includes('onlykris'))) ||
        (memory.targetUser === 'Riely' && (speakerLower.includes('riely') || speakerLower.includes('kazelyx')))
      ) {
        targetUserBonus = 0.2;
      }
    }

    // Factor 5: Topic / Tag alignment
    let tagBonus = 0;
    if (context.activeTopics && context.activeTopics.length > 0 && memory.tags && memory.tags.length > 0) {
      const topicMatches = context.activeTopics.filter((topic) =>
        memory.tags.some((tag) => tag.toLowerCase() === topic.toLowerCase() || memory.content.toLowerCase().includes(topic.toLowerCase()))
      );
      tagBonus = Math.min(0.2, (topicMatches.length / context.activeTopics.length) * 0.2);
    }

    // Weight composition
    const wText = context.queryText ? 0.45 : 0.15;
    const wRecency = context.queryText ? 0.20 : 0.35;
    const wImportance = context.queryText ? 0.35 : 0.50;

    let totalScore =
      textMatchScore * wText +
      recencyScore * wRecency +
      importanceScore * wImportance +
      targetUserBonus +
      tagBonus;

    totalScore = Math.min(1.0, Math.max(0.0, totalScore));

    return {
      memory,
      score: totalScore,
      breakdown: {
        textMatchScore,
        recencyScore,
        importanceScore,
        targetUserBonus,
        tagBonus,
      },
    };
  }

  /**
   * Tokenized multi-word matching & keyword presence.
   */
  private computeTextMatchScore(content: string, query?: string, tags?: string[]): number {
    if (!query || query.trim().length === 0) {
      return 0.5; // Neutral baseline when no explicit query text
    }

    const cleanContent = content.toLowerCase();
    const cleanQuery = query.toLowerCase();

    // Exact full query match
    if (cleanContent.includes(cleanQuery)) {
      return 1.0;
    }

    // Tokenized word overlap
    const queryTokens = cleanQuery
      .split(/[\s,.;:!?\-+*/()[\]{}'"]+/)
      .filter((t) => t.length > 2);

    if (queryTokens.length === 0) {
      return 0.3;
    }

    let matches = 0;
    for (const token of queryTokens) {
      if (cleanContent.includes(token)) {
        matches++;
      } else if (tags && tags.some((tag) => tag.toLowerCase().includes(token))) {
        matches += 0.8;
      }
    }

    return Math.min(1.0, matches / queryTokens.length);
  }

  /**
   * Calculates recency decay based on timestamp and memory type.
   */
  private computeRecencyScore(createdAt: string, type: MemoryType): number {
    try {
      const createdTime = new Date(createdAt).getTime();
      const ageMs = Math.max(0, Date.now() - createdTime);
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Half-life varies by memory type:
      // temporary: 2 days
      // episodic: 14 days
      // behavioral: 60 days
      // server/project: 180 days
      let halfLifeDays = 14;
      switch (type) {
        case 'temporary':
          halfLifeDays = 2;
          break;
        case 'episodic':
          halfLifeDays = 14;
          break;
        case 'behavioral':
          halfLifeDays = 60;
          break;
        case 'server':
        case 'project':
          halfLifeDays = 180;
          break;
      }

      // Exponential decay formula: N(t) = e^(-lambda * t) where lambda = ln(2) / halfLife
      const lambda = Math.LN2 / halfLifeDays;
      const decay = Math.exp(-lambda * ageDays);
      return Math.max(0.05, Math.min(1.0, decay));
    } catch {
      return 0.5;
    }
  }
}

export const defaultContextualRetriever = new ContextualRetriever();
