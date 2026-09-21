import { ObservationCandidate } from './ObservationQueue.js';
import { ChannelInfo } from '../types.js';
import { AutonomyBudgetManager } from './AutonomyBudgetManager.js';

export interface EvaluationResult {
  shouldIntervene: boolean;
  candidate: ObservationCandidate;
  proposedAction: 'MESSAGE' | 'REPLY_TO_MESSAGE' | 'REACTION' | 'BURST' | 'SILENCE';
  reason: string;
  messagesPassed: number;
  burstCount?: number;
  targetMessageId?: string;
}

export class ObservationEvaluator {
  constructor(private budgetManager?: AutonomyBudgetManager) {}

  /**
   * Evaluates an observation candidate in context of current conversation history.
   */
  public evaluateCandidate(params: {
    candidate: ObservationCandidate;
    channel: ChannelInfo;
    recentMessagesInChannel: Array<{ id: string; author: string; content: string; timestamp: string }>;
    currentTime?: number;
  }): EvaluationResult {
    const { candidate, channel, recentMessagesInChannel } = params;
    const now = params.currentTime ?? Date.now();

    // 1. Check if candidate has expired
    if (candidate.expiresAt <= now) {
      return {
        shouldIntervene: false,
        candidate,
        proposedAction: 'SILENCE',
        reason: 'Candidate expired',
        messagesPassed: 0,
      };
    }

    // 2. Count messages that passed since candidate message
    const candidateIdx = recentMessagesInChannel.findIndex((m) => m.id === candidate.messageId);
    let messagesPassed = 0;
    if (candidateIdx !== -1) {
      messagesPassed = recentMessagesInChannel.length - 1 - candidateIdx;
    }

    // 3. If too many messages passed (> 12), conversation moved on
    if (messagesPassed > 12) {
      return {
        shouldIntervene: false,
        candidate,
        proposedAction: 'SILENCE',
        reason: `Too many messages passed (${messagesPassed} > 12), conversation topic drifted`,
        messagesPassed,
      };
    }

    // 4. Check if Foxty spoke in the last 3 messages (prevent back-to-back chatter)
    const recentBotMsgs = recentMessagesInChannel.slice(-3).filter((m) => m.author.toLowerCase().includes('foxty'));
    if (recentBotMsgs.length > 0) {
      return {
        shouldIntervene: false,
        candidate,
        proposedAction: 'SILENCE',
        reason: 'Foxty spoke recently in this channel within the last 3 messages',
        messagesPassed,
      };
    }

    // 5. Check multi-level cooldowns & budget
    if (this.budgetManager) {
      const cd = this.budgetManager.checkCooldowns({
        channelId: channel.id,
        userId: candidate.author,
        now,
      });
      if (!cd.allowed) {
        return {
          shouldIntervene: false,
          candidate,
          proposedAction: 'SILENCE',
          reason: cd.reason || 'Cooldown active',
          messagesPassed,
        };
      }

      if (!this.budgetManager.isWithinBudget('RARE_AI')) {
        return {
          shouldIntervene: false,
          candidate,
          proposedAction: 'SILENCE',
          reason: 'Daily autonomy budget insufficient for spontaneous intervention',
          messagesPassed,
        };
      }
    }

    // 6. Select appropriate intervention mode:
    // - If candidate is 3-10 messages old -> REPLY_TO_MESSAGE (revives older idea)
    // - If candidate was a short comment -> REACTION
    // - If candidate has high relevance (>0.85) -> BURST (1-3 msgs max) or MESSAGE
    let proposedAction: 'MESSAGE' | 'REPLY_TO_MESSAGE' | 'REACTION' | 'BURST' = 'MESSAGE';
    let burstCount = 1;

    if (messagesPassed >= 3) {
      // Replying to older idea
      proposedAction = 'REPLY_TO_MESSAGE';
    } else if (candidate.relevance >= 0.85 && Math.random() < 0.25) {
      proposedAction = 'BURST';
      burstCount = Math.min(3, Math.floor(Math.random() * 2) + 2); // 2 or 3 messages max
    } else if (candidate.content.length < 15 && Math.random() < 0.40) {
      proposedAction = 'REACTION';
    }

    return {
      shouldIntervene: true,
      candidate,
      proposedAction,
      reason: `Intervention justified (${proposedAction}, ${messagesPassed} msgs lag, rel: ${candidate.relevance.toFixed(2)})`,
      messagesPassed,
      burstCount,
      targetMessageId: candidate.messageId,
    };
  }
}
