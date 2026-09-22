import { ChannelInfo } from '../types.js';
import { isChannelBlocked, isSakuraMailChannel } from '../config/index.js';
import { ObservationCandidate } from './ObservationQueue.js';
import { AutonomyBudgetManager } from './AutonomyBudgetManager.js';

export interface PreFilterResult {
  shouldQueue: boolean;
  relevance: number;
  reason: string;
  candidate?: Omit<ObservationCandidate, 'id' | 'processed'>;
}

export class ObservationPreFilter {
  constructor(private budgetManager?: AutonomyBudgetManager) {}

  /**
   * Deterministic pre-filter to evaluate if an observed message is worth queuing for potential intervention.
   * Cheap and synchronous. NEVER calls DeepSeek.
   */
  public evaluateMessage(params: {
    messageId: string;
    channel: ChannelInfo;
    author: string;
    content: string;
    timestamp?: number;
    isBot?: boolean;
    isDirectMention?: boolean;
    replyToMessageId?: string;
  }): PreFilterResult {
    const { messageId, channel, author, content, isBot, isDirectMention, replyToMessageId } = params;
    const timestamp = params.timestamp ?? Date.now();

    // 1. REJECT: Bot messages
    if (isBot && !author.toLowerCase().includes('foxty-test')) {
      return { shouldQueue: false, relevance: 0, reason: 'Message authored by bot' };
    }

    // 2. REJECT: Blocked channels & SakuraMail
    if (isChannelBlocked(channel.id) || isSakuraMailChannel(channel.id) || channel.foxtyPolicy === 'Uso Bloqueado') {
      return { shouldQueue: false, relevance: 0, reason: 'Channel is BLOCKED or private SakuraMail' };
    }

    // 3. REJECT: Channel does not allow spontaneous events unless directly mentioned
    if (!channel.allowSpontaneousEvents && !isDirectMention) {
      return { shouldQueue: false, relevance: 0, reason: 'Channel does not allow spontaneous interventions' };
    }

    // 4. REJECT: Too short or empty
    const trimmed = content.trim();
    if (trimmed.length < 2) {
      return { shouldQueue: false, relevance: 0, reason: 'Message too short' };
    }

    // 5. REJECT: Autonomy budget exhausted
    if (this.budgetManager && !this.budgetManager.isWithinBudget('NORMAL_AI')) {
      return { shouldQueue: false, relevance: 0, reason: 'Daily autonomy budget depleted' };
    }

    // 6. REJECT: Cooldown active
    if (this.budgetManager) {
      const cdCheck = this.budgetManager.checkCooldowns({
        channelId: channel.id,
        userId: author,
        now: timestamp,
      });
      if (!cdCheck.allowed) {
        return { shouldQueue: false, relevance: 0, reason: cdCheck.reason || 'Cooldown active' };
      }
    }

    // 7. Heuristic Relevance Scoring
    let relevance = 0.2; // Baseline
    const lower = trimmed.toLowerCase();

    // Key interest topics for Cherry Place & Foxty
    const HighValueKeywords = [
      'ideia', 'constru', 'base', 'cherry', 'place', 'minério', 'bau', 'fazenda',
      'vila', 'explora', 'coordenada', 'projeto', 'mapa', 'portal', 'nether',
      'dúvida', 'ajuda', 'planeja', 'kris', 'riely', 'foxty', 'raposa', 'jardim'
    ];

    for (const kw of HighValueKeywords) {
      if (lower.includes(kw)) {
        relevance += 0.15;
      }
    }

    // Question mark bonus
    if (lower.includes('?')) {
      relevance += 0.15;
    }

    // Key authors (Kris / Riely) priority bonus
    if (author.toLowerCase().includes('kris') || author.toLowerCase().includes('riely')) {
      relevance += 0.2;
    }

    // Direct mention or frequent channel override
    if (isDirectMention || channel.foxtyPolicy === 'Uso Frequente') {
      relevance = 1.0;
    }

    relevance = Math.min(1.0, relevance);

    // Threshold for queuing candidate (0.40)
    const threshold = 0.40;
    if (relevance < threshold) {
      return {
        shouldQueue: false,
        relevance,
        reason: `Relevance score (${relevance.toFixed(2)}) below threshold (${threshold})`,
      };
    }

    const expiresAt = timestamp + 15 * 60 * 1000; // 15 min expiration window

    return {
      shouldQueue: true,
      relevance,
      reason: `Queued as observation candidate (relevance: ${relevance.toFixed(2)})`,
      candidate: {
        messageId,
        channelId: channel.id,
        author,
        content: trimmed,
        timestamp,
        relevance,
        reason: `High context relevance (${relevance.toFixed(2)})`,
        expiresAt,
        replyToMessageId,
      },
    };
  }
}
