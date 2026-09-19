import { ChannelInfo, ActionRequest } from '../types.js';
import {
  FoxtyChannelPolicy,
  CHERRY_PLACE_CHANNELS,
  getChannelById,
} from '../config/cherryPlaceModel.js';
import { logger } from '../core/Logger.js';

/**
 * Formal Channel Policy Levels
 */
export enum ChannelPolicyLevel {
  BLOCKED = 'BLOCKED',
  LIMITED = 'LIMITED',
  MODERATE = 'MODERATE',
  ACTIVE = 'ACTIVE',
  FREQUENT = 'FREQUENT',
}

/**
 * Full structural definition of behaviors enforced for a given policy level
 */
export interface ChannelPolicyRules {
  readonly level: ChannelPolicyLevel;
  readonly canonicalName: FoxtyChannelPolicy;
  
  // 1. Response Permission
  readonly canRespond: boolean;

  // 2. Appearance Probability (0.0 to 1.0) when not directly mentioned
  readonly appearanceProbability: number;

  // 3. Frequency & Rate Control
  readonly minCooldownSeconds: number;
  readonly maxBurstMessages: number;

  // 4. Reactions Permission & Probability
  readonly canReact: boolean;
  readonly reactionProbability: number;
  readonly maxReactionsPerMessage: number;

  // 5. Tool Usage
  readonly allowedTools: readonly string[]; // tool names or '*' for unrestricted
  readonly maxToolsPerTurn: number;
  readonly canSaveMemories: boolean;

  // 6. Spontaneous Behavior (unprompted events)
  readonly allowSpontaneous: boolean;
  readonly spontaneousProbability: number;

  // 7. Mention Priority & Rules
  readonly mentionPriority: number; // 0 = ignored, 100 = highest priority
  readonly canBypassWithMention: boolean; // false for BLOCKED, true for others
}

/**
 * Canonical rules table for each level based on DISCORD_SERVER_CATEGORIES_AND_CHANNELS_RULES.md
 */
export const CHANNEL_POLICY_RULES: Record<ChannelPolicyLevel, ChannelPolicyRules> = {
  [ChannelPolicyLevel.BLOCKED]: {
    level: ChannelPolicyLevel.BLOCKED,
    canonicalName: 'Uso Bloqueado',
    canRespond: false,
    appearanceProbability: 0.0,
    minCooldownSeconds: Infinity,
    maxBurstMessages: 0,
    canReact: false,
    reactionProbability: 0.0,
    maxReactionsPerMessage: 0,
    allowedTools: [],
    maxToolsPerTurn: 0,
    canSaveMemories: false,
    allowSpontaneous: false,
    spontaneousProbability: 0.0,
    mentionPriority: 0, // Mentions are ignored in BLOCKED channels
    canBypassWithMention: false,
  },

  [ChannelPolicyLevel.LIMITED]: {
    level: ChannelPolicyLevel.LIMITED,
    canonicalName: 'Uso Limitado',
    canRespond: true, // Only when mentioned or through very rare spontaneous appearance
    appearanceProbability: 0.08, // Very rare unprompted appearance
    minCooldownSeconds: 180, // 3 minutes cooldown
    maxBurstMessages: 1,
    canReact: true,
    reactionProbability: 0.05, // Extremely rare reactions
    maxReactionsPerMessage: 1,
    allowedTools: ['send_message', 'search_memory', 'get_channel_info'], // Reading and minimal communication only
    maxToolsPerTurn: 1,
    canSaveMemories: false, // Do not pollute memory in serious/organized channels
    allowSpontaneous: false, // Very rare, disabled by default
    spontaneousProbability: 0.01,
    mentionPriority: 100, // Direct mentions force response
    canBypassWithMention: true,
  },

  [ChannelPolicyLevel.MODERATE]: {
    level: ChannelPolicyLevel.MODERATE,
    canonicalName: 'Uso Moderado',
    canRespond: true,
    appearanceProbability: 0.35, // Moderate chance when users chat
    minCooldownSeconds: 45,
    maxBurstMessages: 2,
    canReact: true,
    reactionProbability: 0.30,
    maxReactionsPerMessage: 1,
    allowedTools: ['send_message', 'react', 'search_memory', 'get_channel_info', 'get_server_info'],
    maxToolsPerTurn: 2,
    canSaveMemories: true,
    allowSpontaneous: true,
    spontaneousProbability: 0.15,
    mentionPriority: 100,
    canBypassWithMention: true,
  },

  [ChannelPolicyLevel.ACTIVE]: {
    level: ChannelPolicyLevel.ACTIVE,
    canonicalName: 'Uso Ativo',
    canRespond: true,
    appearanceProbability: 0.75, // Noticeably present and free to converse
    minCooldownSeconds: 15,
    maxBurstMessages: 3,
    canReact: true,
    reactionProbability: 0.65,
    maxReactionsPerMessage: 2,
    allowedTools: [
      'send_message',
      'send_multiple_messages',
      'react',
      'search_memory',
      'save_memory',
      'get_channel_info',
      'get_server_info',
    ],
    maxToolsPerTurn: 4,
    canSaveMemories: true,
    allowSpontaneous: true,
    spontaneousProbability: 0.40,
    mentionPriority: 100,
    canBypassWithMention: true,
  },

  [ChannelPolicyLevel.FREQUENT]: {
    level: ChannelPolicyLevel.FREQUENT,
    canonicalName: 'Uso Frequente',
    canRespond: true,
    appearanceProbability: 1.0, // Obligatory and deliberately present; any message calls Foxty
    minCooldownSeconds: 0,
    maxBurstMessages: 4,
    canReact: true,
    reactionProbability: 0.85,
    maxReactionsPerMessage: 3,
    allowedTools: ['*'], // All powers, games and resources
    maxToolsPerTurn: 6,
    canSaveMemories: true,
    allowSpontaneous: true,
    spontaneousProbability: 0.75,
    mentionPriority: 100,
    canBypassWithMention: true,
  },
};

/**
 * Result of the pre-consultation policy evaluation
 */
export interface PreConsultationDecision {
  readonly shouldProceedToBrain: boolean;
  readonly policy: ChannelPolicyRules;
  readonly reason: string;
  readonly isDirectMention: boolean;
  readonly passedProbabilityRoll: boolean;
  readonly cooldownRemainingSeconds: number;
}

/**
 * ChannelBehaviorPolicy enforces server rules before and after DeepSeek evaluation.
 * DeepSeek only suggests behavior; this policy is the authoritative security boundary.
 */
export class ChannelBehaviorPolicy {
  private channelLastResponse = new Map<string, number>();

  /**
   * Translates string policy or channel into a formal ChannelPolicyLevel
   */
  public resolvePolicyLevel(input?: string | ChannelInfo): ChannelPolicyLevel {
    if (!input) return ChannelPolicyLevel.ACTIVE;

    const rawPolicy = typeof input === 'string' ? input : input.foxtyPolicy;
    if (!rawPolicy) return ChannelPolicyLevel.ACTIVE;

    const normalized = rawPolicy.trim().toUpperCase();

    if (normalized.includes('BLOQUEADO') || normalized === 'BLOCKED') {
      return ChannelPolicyLevel.BLOCKED;
    }
    if (normalized.includes('LIMITADO') || normalized === 'LIMITED') {
      return ChannelPolicyLevel.LIMITED;
    }
    if (normalized.includes('MODERADO') || normalized === 'MODERATE') {
      return ChannelPolicyLevel.MODERATE;
    }
    if (normalized.includes('FREQUENTE') || normalized === 'FREQUENT') {
      return ChannelPolicyLevel.FREQUENT;
    }
    return ChannelPolicyLevel.ACTIVE;
  }

  /**
   * Returns the rules object for a given channel or policy level
   */
  public getRules(input?: string | ChannelInfo): ChannelPolicyRules {
    const level = this.resolvePolicyLevel(input);
    return CHANNEL_POLICY_RULES[level];
  }

  /**
   * STEP 1: PRE-CONSULTATION EVALUATION (Authoritative Core Check)
   * Must be called by FoxtyCore BEFORE calling DeepSeek.
   * Never calls the model if policy dictates silence.
   */
  public evaluatePreConsultation(params: {
    channel: ChannelInfo;
    isDirectMention: boolean;
    currentTime?: number;
    randomRoll?: () => number;
  }): PreConsultationDecision {
    const { channel, isDirectMention } = params;
    const now = params.currentTime ?? Date.now();
    const roll = params.randomRoll ? params.randomRoll() : Math.random();

    const rules = this.getRules(channel);

    // RULE 1: BLOCKED channels are absolute. Mentions CANNOT bypass BLOCKED.
    if (rules.level === ChannelPolicyLevel.BLOCKED) {
      return {
        shouldProceedToBrain: false,
        policy: rules,
        reason: 'Channel is BLOCKED. All Foxty interactions are strictly prohibited.',
        isDirectMention,
        passedProbabilityRoll: false,
        cooldownRemainingSeconds: Infinity,
      };
    }

    // RULE 2: Direct mentions force a response on any non-BLOCKED channel (mentionPriority = 100)
    if (isDirectMention && rules.canBypassWithMention) {
      return {
        shouldProceedToBrain: true,
        policy: rules,
        reason: 'Direct mention override: Foxty is obligated to respond.',
        isDirectMention: true,
        passedProbabilityRoll: true,
        cooldownRemainingSeconds: 0,
      };
    }

    // RULE 3: FREQUENT channels have 100% presence without needing mentions
    if (rules.level === ChannelPolicyLevel.FREQUENT) {
      return {
        shouldProceedToBrain: true,
        policy: rules,
        reason: 'FREQUENT channel policy: Foxty has obligatory presence here.',
        isDirectMention,
        passedProbabilityRoll: true,
        cooldownRemainingSeconds: 0,
      };
    }

    // RULE 4: Cooldown check for unmentioned interactions
    const lastResponse = this.channelLastResponse.get(channel.id) || 0;
    const elapsedSeconds = (now - lastResponse) / 1000;
    const cooldownRemaining = Math.max(0, rules.minCooldownSeconds - elapsedSeconds);

    if (cooldownRemaining > 0) {
      return {
        shouldProceedToBrain: false,
        policy: rules,
        reason: `Channel cooldown active (${Math.ceil(cooldownRemaining)}s remaining).`,
        isDirectMention: false,
        passedProbabilityRoll: false,
        cooldownRemainingSeconds: cooldownRemaining,
      };
    }

    // RULE 5: Appearance Probability roll for unmentioned messages
    const passedRoll = roll <= rules.appearanceProbability;

    if (!passedRoll) {
      return {
        shouldProceedToBrain: false,
        policy: rules,
        reason: `Appearance roll failed (roll: ${roll.toFixed(3)} > threshold: ${rules.appearanceProbability}).`,
        isDirectMention: false,
        passedProbabilityRoll: false,
        cooldownRemainingSeconds: 0,
      };
    }

    return {
      shouldProceedToBrain: true,
      policy: rules,
      reason: `Channel policy ${rules.level} approved unprompted appearance.`,
      isDirectMention: false,
      passedProbabilityRoll: true,
      cooldownRemainingSeconds: 0,
    };
  }

  /**
   * STEP 2: POST-DEEPSEEK ACTIONS FILTER (Authoritative Guardrail)
   * Verifies that actions suggested by DeepSeek comply with the channel policy.
   * DeepSeek only suggests; the Core rejects unauthorized suggestions.
   */
  public filterProposedMessages(messages: string[], channel: ChannelInfo): string[] {
    const rules = this.getRules(channel);
    if (!rules.canRespond || rules.maxBurstMessages === 0) {
      return [];
    }
    return messages.slice(0, rules.maxBurstMessages);
  }

  public filterProposedReactions(
    reactions: string[],
    channel: ChannelInfo,
    randomRoll?: () => number
  ): string[] {
    const rules = this.getRules(channel);
    if (!rules.canReact || rules.maxReactionsPerMessage === 0) {
      return [];
    }

    const roll = randomRoll ? randomRoll() : Math.random();
    if (roll > rules.reactionProbability) {
      return [];
    }

    return reactions.slice(0, rules.maxReactionsPerMessage);
  }

  public filterProposedTools(tools: ActionRequest[], channel: ChannelInfo): {
    approved: ActionRequest[];
    rejected: { action: ActionRequest; reason: string }[];
  } {
    const rules = this.getRules(channel);
    const approved: ActionRequest[] = [];
    const rejected: { action: ActionRequest; reason: string }[] = [];

    for (const tool of tools) {
      if (approved.length >= rules.maxToolsPerTurn) {
        rejected.push({
          action: tool,
          reason: `Exceeded max tools limit (${rules.maxToolsPerTurn}) for ${rules.level} channel.`,
        });
        continue;
      }

      if (rules.allowedTools.includes('*')) {
        approved.push(tool);
        continue;
      }

      if (rules.allowedTools.includes(tool.tool)) {
        approved.push(tool);
      } else {
        rejected.push({
          action: tool,
          reason: `Tool '${tool.tool}' is forbidden by ${rules.level} channel policy.`,
        });
      }
    }

    return { approved, rejected };
  }

  public recordResponse(channelId: string, timestamp: number = Date.now()): void {
    this.channelLastResponse.set(channelId, timestamp);
  }

  public resetCooldowns(): void {
    this.channelLastResponse.clear();
  }
}
