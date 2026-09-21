import { logger } from '../core/Logger.js';

export type AutonomyCategory = 'NO_AI' | 'LOW_AI' | 'NORMAL_AI' | 'RARE_AI';

export interface CooldownConfig {
  globalMs: number;
  channelMs: number;
  userMs: number;
  interventionTypeMs: Record<string, number>;
}

export class AutonomyBudgetManager {
  private dailyTokenLimit: number;
  private dailyTokensSpent = 0;
  private dailyAiCallLimit: number;
  private dailyAiCallsCount = 0;
  private lastResetDay = new Date().getUTCDate();

  // Cooldown tracking maps
  private lastGlobalInterventionTime = 0;
  private channelLastIntervention: Map<string, number> = new Map();
  private userLastIntervention: Map<string, number> = new Map();
  private interventionTypeLastTime: Map<string, number> = new Map();

  // Deduplication & Idempotency Cache: key -> expiration timestamp
  private processedFingerprints: Map<string, number> = new Map();

  private cooldownConfig: CooldownConfig = {
    globalMs: 15 * 60 * 1000, // 15 minutes global cooldown for spontaneous interventions
    channelMs: 10 * 60 * 1000, // 10 minutes per channel cooldown
    userMs: 5 * 60 * 1000,     // 5 minutes per user cooldown
    interventionTypeMs: {
      burst: 30 * 60 * 1000,      // 30 min for bursts
      spontaneous_reply: 15 * 60 * 1000, // 15 min for spontaneous replies
      reaction: 3 * 60 * 1000,    // 3 min for reactions
      event: 45 * 60 * 1000,       // 45 min for events
    },
  };

  constructor(dailyTokenLimit = 25000, dailyAiCallLimit = 100) {
    this.dailyTokenLimit = dailyTokenLimit;
    this.dailyAiCallLimit = dailyAiCallLimit;
  }

  private checkDailyReset(): void {
    const currentDay = new Date().getUTCDate();
    if (currentDay !== this.lastResetDay) {
      this.dailyTokensSpent = 0;
      this.dailyAiCallsCount = 0;
      this.lastResetDay = currentDay;
      logger.log({
        event: 'Autonomy Budget Daily Reset',
        actionType: 'AUTONOMY_BUDGET',
        decision: 'RESET',
        success: true,
        aiUsed: false,
        durationMs: 0,
      });
    }
  }

  /**
   * Checks if an AI request of the given category is within daily budget
   */
  public isWithinBudget(category: AutonomyCategory = 'NORMAL_AI'): boolean {
    this.checkDailyReset();

    if (category === 'NO_AI') return true;

    if (this.dailyAiCallsCount >= this.dailyAiCallLimit) {
      return false;
    }

    if (this.dailyTokensSpent >= this.dailyTokenLimit) {
      return false;
    }

    // High cost / rare interventions are throttled if budget is > 75% consumed
    if (category === 'RARE_AI' && this.dailyTokensSpent > this.dailyTokenLimit * 0.75) {
      return false;
    }

    return true;
  }

  /**
   * Records spend of tokens and AI call count
   */
  public recordAiUsage(tokens: number, category: AutonomyCategory = 'NORMAL_AI'): void {
    this.checkDailyReset();
    if (category !== 'NO_AI') {
      this.dailyTokensSpent += tokens;
      this.dailyAiCallsCount += 1;
    }
  }

  /**
   * Multi-level Cooldown Check for Spontaneous Interventions
   */
  public checkCooldowns(params: {
    channelId: string;
    userId?: string;
    interventionType?: string;
    now?: number;
  }): { allowed: boolean; reason?: string; remainingMs?: number } {
    const now = params.now ?? Date.now();

    // 1. Global Cooldown
    const timeSinceGlobal = now - this.lastGlobalInterventionTime;
    if (timeSinceGlobal < this.cooldownConfig.globalMs) {
      const remaining = this.cooldownConfig.globalMs - timeSinceGlobal;
      return {
        allowed: false,
        reason: `Global autonomy cooldown active (${Math.ceil(remaining / 1000)}s remaining)`,
        remainingMs: remaining,
      };
    }

    // 2. Channel Cooldown
    const lastChanTime = this.channelLastIntervention.get(params.channelId) || 0;
    const timeSinceChan = now - lastChanTime;
    if (timeSinceChan < this.cooldownConfig.channelMs) {
      const remaining = this.cooldownConfig.channelMs - timeSinceChan;
      return {
        allowed: false,
        reason: `Channel cooldown active (${Math.ceil(remaining / 1000)}s remaining)`,
        remainingMs: remaining,
      };
    }

    // 3. User Cooldown
    if (params.userId) {
      const lastUserTime = this.userLastIntervention.get(params.userId) || 0;
      const timeSinceUser = now - lastUserTime;
      if (timeSinceUser < this.cooldownConfig.userMs) {
        const remaining = this.cooldownConfig.userMs - timeSinceUser;
        return {
          allowed: false,
          reason: `User intervention cooldown active (${Math.ceil(remaining / 1000)}s remaining)`,
          remainingMs: remaining,
        };
      }
    }

    // 4. Intervention Type Cooldown
    if (params.interventionType) {
      const typeMs = this.cooldownConfig.interventionTypeMs[params.interventionType] || 5 * 60 * 1000;
      const lastTypeTime = this.interventionTypeLastTime.get(params.interventionType) || 0;
      const timeSinceType = now - lastTypeTime;
      if (timeSinceType < typeMs) {
        const remaining = typeMs - timeSinceType;
        return {
          allowed: false,
          reason: `Intervention type '${params.interventionType}' cooldown active (${Math.ceil(remaining / 1000)}s remaining)`,
          remainingMs: remaining,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records successful execution of a spontaneous intervention across cooldown tracking
   */
  public recordIntervention(params: {
    channelId: string;
    userId?: string;
    interventionType?: string;
    timestamp?: number;
  }): void {
    const now = params.timestamp ?? Date.now();
    this.lastGlobalInterventionTime = now;
    this.channelLastIntervention.set(params.channelId, now);

    if (params.userId) {
      this.userLastIntervention.set(params.userId, now);
    }

    if (params.interventionType) {
      this.interventionTypeLastTime.set(params.interventionType, now);
    }
  }

  /**
   * Idempotency & Deduplication Check
   * Computes an action fingerprint to prevent double processing or duplicate messages/reactions.
   */
  public isDuplicate(incomingMessageId: string, actionFingerprint: string, ttlMs = 10 * 60 * 1000): boolean {
    this.purgeDuplicateCache();
    const key = `${incomingMessageId}::${actionFingerprint}`;
    const exp = this.processedFingerprints.get(key);
    if (exp && exp > Date.now()) {
      return true;
    }
    return false;
  }

  /**
   * Registers an action fingerprint to enforce deduplication
   */
  public recordActionFingerprint(incomingMessageId: string, actionFingerprint: string, ttlMs = 10 * 60 * 1000): void {
    const key = `${incomingMessageId}::${actionFingerprint}`;
    this.processedFingerprints.set(key, Date.now() + ttlMs);
  }

  private purgeDuplicateCache(): void {
    const now = Date.now();
    for (const [key, exp] of this.processedFingerprints.entries()) {
      if (exp <= now) {
        this.processedFingerprints.delete(key);
      }
    }
  }

  /**
   * Returns current budget status metrics
   */
  public getBudgetStatus() {
    this.checkDailyReset();
    return {
      dailyTokensSpent: this.dailyTokensSpent,
      dailyTokenLimit: this.dailyTokenLimit,
      dailyAiCallsCount: this.dailyAiCallsCount,
      dailyAiCallLimit: this.dailyAiCallLimit,
      remainingTokens: Math.max(0, this.dailyTokenLimit - this.dailyTokensSpent),
      remainingCalls: Math.max(0, this.dailyAiCallLimit - this.dailyAiCallsCount),
    };
  }

  public setCooldownConfig(config: Partial<CooldownConfig>): void {
    this.cooldownConfig = {
      ...this.cooldownConfig,
      ...config,
      interventionTypeMs: {
        ...this.cooldownConfig.interventionTypeMs,
        ...(config.interventionTypeMs || {}),
      },
    };
  }
}
