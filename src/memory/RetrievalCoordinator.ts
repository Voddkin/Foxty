import { MemoryItem, ChatMessage, ContextualScoredMemory } from '../types.js';
import { IMemoryStore } from './MemoryStore.js';
import { logger } from '../core/Logger.js';

export type ScoredMemory = ContextualScoredMemory;

export interface RetrievalContext {
  currentMessage: {
    content: string;
    author: string;
    channelId: string;
  };
  recentHistory?: ChatMessage[];
  targetUser?: 'Kris' | 'Riely' | 'Other';
  limit?: number;
  safeForTeasingRequired?: boolean;
}

export class RetrievalCoordinator {
  constructor(private memoryStore: IMemoryStore) {}

  /**
   * Retrieves highly relevant memories by combining lexical search, entity extraction,
   * conversational topic expansion, user profiling, and multi-factor scoring.
   */
  public async retrieve(context: RetrievalContext): Promise<ScoredMemory[]> {
    const {
      currentMessage,
      recentHistory = [],
      targetUser,
      limit = 5,
      safeForTeasingRequired = true,
    } = context;

    const queryTerms = this.expandQuery(currentMessage.content, recentHistory, currentMessage.author);
    const candidateMap = new Map<string, MemoryItem>();

    // 1. Multi-query retrieval from MemoryStore
    for (const term of queryTerms) {
      if (!term || term.length < 2) continue;
      try {
        const results = await this.memoryStore.search(term, {
          safeForTeasingOnly: safeForTeasingRequired,
          limit: 10,
          targetUser,
        });
        for (const item of results) {
          candidateMap.set(item.id, item);
        }
      } catch (err: any) {
        logger.warn('RETRIEVAL_COORDINATOR', `Search failed for term "${term}": ${err.message}`);
      }
    }

    // 2. Fallback: If few candidates, fetch top memories by importance
    if (candidateMap.size < limit) {
      try {
        const topMemories = await this.memoryStore.search('', {
          safeForTeasingOnly: safeForTeasingRequired,
          limit: 15,
          targetUser,
        });
        for (const item of topMemories) {
          candidateMap.set(item.id, item);
        }
      } catch (err: any) {
        // Safe ignore
      }
    }

    const candidates = Array.from(candidateMap.values());

    // 3. Multi-factor Scoring
    const scoredMemories: ScoredMemory[] = [];
    const now = Date.now();
    const activeTokens = this.extractTokens(
      [currentMessage.content, ...recentHistory.slice(-5).map((m) => m.content)].join(' ')
    );

    for (const item of candidates) {
      if (safeForTeasingRequired && !item.safeForTeasing) {
        continue;
      }

      // A. Text and Topic Overlap Score (0.0 - 1.0)
      const memoryTokens = this.extractTokens(item.content);
      const tagTokens = (item.tags || []).map((t) => t.toLowerCase());
      const allItemTokens = new Set([...memoryTokens, ...tagTokens]);

      let matchCount = 0;
      for (const token of activeTokens) {
        if (allItemTokens.has(token)) {
          matchCount++;
        }
      }
      const textMatchScore = activeTokens.length > 0 ? Math.min(1.0, matchCount / Math.max(2, activeTokens.length * 0.3)) : 0.2;

      // B. Recency Score (0.0 - 1.0) with exponential decay
      const createdTime = new Date(item.createdAt || now).getTime();
      const ageHours = Math.max(0, (now - createdTime) / (1000 * 60 * 60));
      const recencyScore = Math.exp(-ageHours / 168); // 7-day half-life

      // C. Importance & Confidence
      const importanceScore = item.importance || 0.5;
      const confidenceScore = item.confidence || 0.8;

      // D. User Targeting Bonus
      let userBonus = 0.0;
      const inferredUser = targetUser || (currentMessage.author.toLowerCase().includes('kris') ? 'Kris' : currentMessage.author.toLowerCase().includes('riely') || currentMessage.author.toLowerCase().includes('riri') ? 'Riely' : undefined);
      if (item.targetUser && inferredUser && item.targetUser === inferredUser) {
        userBonus = 0.2;
      }

      // E. Composite Final Score
      const finalScore =
        textMatchScore * 0.40 +
        importanceScore * 0.25 +
        recencyScore * 0.15 +
        confidenceScore * 0.10 +
        userBonus;

      const breakdown = {
        textMatchScore,
        recencyScore,
        importanceScore,
        targetUserBonus: userBonus,
        tagBonus: 0,
      };

      scoredMemories.push({
        memory: item,
        score: Math.min(1.0, finalScore),
        breakdown,
        scoreBreakdown: breakdown,
      });
    }

    // Sort descending by score and cap
    return scoredMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Expands the query using anaphora resolution, entity extraction, and conversational context.
   */
  private expandQuery(currentContent: string, history: ChatMessage[], author: string): string[] {
    const terms = new Set<string>();

    // 1. Raw content tokens
    const rawTokens = this.extractTokens(currentContent);
    for (const t of rawTokens) {
      terms.add(t);
    }

    // 2. Full phrase search if reasonable length
    if (currentContent.trim().length >= 3 && currentContent.trim().length <= 40) {
      terms.add(currentContent.trim().toLowerCase());
    }

    // 3. User identification
    if (author.toLowerCase().includes('kris')) terms.add('kris');
    if (author.toLowerCase().includes('riely') || author.toLowerCase().includes('riri')) terms.add('riely');

    // 4. Anaphora and referential question detection:
    // e.g. "qual era aquela frase?", "lembra daquele projeto?", "o que ele disse sobre aquilo?"
    const referentialPatterns = [
      /(?:qual|onde|como|o que)\s+(?:era|foi|é)\s+(?:aquela|aquele|o|a)\s+([a-zA-ZÀ-ÿ0-9_-]+)/i,
      /(?:lembra|lembras)\s+(?:de|do|da|daquele|daquela)\s+([a-zA-ZÀ-ÿ0-9_-]+)/i,
      /(?:aquela|aquele)\s+([a-zA-ZÀ-ÿ0-9_-]+)/i,
    ];

    for (const pattern of referentialPatterns) {
      const match = currentContent.match(pattern);
      if (match && match[1]) {
        terms.add(match[1].toLowerCase());
      }
    }

    // 5. Expand using recent conversation topics (last 5 messages)
    const recentWindow = history.slice(-5);
    for (const msg of recentWindow) {
      const tokens = this.extractTokens(msg.content);
      for (const t of tokens) {
        if (t.length >= 4) {
          terms.add(t);
        }
      }
    }

    return Array.from(terms);
  }

  /**
   * Tokenizes text into meaningful semantic tokens, filtering Portuguese stop words.
   */
  private extractTokens(text: string): string[] {
    const stopWords = new Set([
      'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
      'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'pra',
      'e', 'ou', 'mas', 'que', 'se', 'com', 'sem', 'como', 'quando', 'onde', 'qual', 'quais',
      'eu', 'tu', 'ele', 'ela', 'nós', 'eles', 'elas', 'me', 'te', 'se', 'lhe', 'isso', 'isto',
      'aquilo', 'aquele', 'aquela', 'foi', 'era', 'ser', 'estar', 'está', 'estava', 'muito',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));
  }
}
