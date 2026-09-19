import {
  ActionRequest,
  BrainDecision,
  ChannelInfo,
  ChatMessage,
  DiscordServerSnapshot,
  FoxtyState,
  MemoryItem,
  SakuraMailAbstractEvent,
  ServerMapValidationReport,
} from '../types.js';
import {
  FoxtyConfig,
  isSakuraMailChannel,
  isChannelBlocked,
  getChannelById,
} from '../config/index.js';
import { ContextBuilder } from './ContextBuilder.js';
import { StateManager } from './StateManager.js';
import { Logger, logger } from './Logger.js';
import { IMemoryStore } from '../memory/MemoryStore.js';
import { InMemoryStore } from '../memory/InMemoryStore.js';
import { BehavioralAnalyzer } from '../behavior/BehavioralAnalyzer.js';
import { PersonalityEngine } from '../personality/PersonalityEngine.js';
import { EventEngine } from '../events/EventEngine.js';
import { DeepSeekAdapter } from '../brain/DeepSeekAdapter.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { DiscordActionHandler, ToolExecutionResult, ToolExecutor } from '../tools/ToolExecutor.js';
import { SakuraMailBridge, SakuraMailRawInput } from '../integrations/SakuraMailBridge.js';
import { ServerMapValidator } from '../validator/ServerMapValidator.js';
import {
  ChannelBehaviorPolicy,
  ChannelPolicyLevel,
  PreConsultationDecision,
} from '../policy/ChannelBehaviorPolicy.js';

export interface InteractionResult {
  decision: BrainDecision;
  toolResults: ToolExecutionResult[];
  state: FoxtyState;
  observations: any[];
  memoriesRetrieved: MemoryItem[];
  aiUsed: boolean;
  tokensUsed: number;
}

export class FoxtyCore {
  private memoryStore: IMemoryStore;
  private stateManager: StateManager;
  private behavioralAnalyzer: BehavioralAnalyzer;
  private personalityEngine: PersonalityEngine;
  private eventEngine: EventEngine;
  private contextBuilder: ContextBuilder;
  private deepSeekAdapter: DeepSeekAdapter;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private sakuraMailBridge: SakuraMailBridge;
  private channelBehaviorPolicy: ChannelBehaviorPolicy;
  private serverMapValidator: ServerMapValidator;
  private discordHandler?: DiscordActionHandler;
  private recentMessagesBuffer: Map<string, ChatMessage[]> = new Map();

  constructor(private config: FoxtyConfig) {
    this.memoryStore = new InMemoryStore(true);
    this.stateManager = new StateManager(config.defaultState);
    this.behavioralAnalyzer = new BehavioralAnalyzer();
    this.personalityEngine = new PersonalityEngine();
    this.channelBehaviorPolicy = new ChannelBehaviorPolicy();
    this.eventEngine = new EventEngine(config.globalEventCooldownMinutes);
    this.contextBuilder = new ContextBuilder(this.memoryStore);
    this.serverMapValidator = new ServerMapValidator();
    this.deepSeekAdapter = new DeepSeekAdapter({
      apiKey: config.deepSeekApiKey,
      baseUrl: config.deepSeekBaseUrl,
      model: config.deepSeekModel,
    });
    this.toolRegistry = new ToolRegistry();
    this.toolExecutor = new ToolExecutor(
      this.toolRegistry,
      undefined,
      this.memoryStore,
      this.eventEngine,
      () => this.config.channels
    );
    this.sakuraMailBridge = new SakuraMailBridge();

    logger.log({
      event: 'Foxty Core Initialized',
      actionType: 'CORE_LIFECYCLE',
      decision: 'READY',
      success: true,
      aiUsed: !!config.deepSeekApiKey,
      durationMs: 0,
      details: `Test Mode: ${config.testMode}, Channels configured: ${config.channels.length}`,
    });
  }

  public setDiscordActionHandler(handler: DiscordActionHandler): void {
    this.discordHandler = handler;
    this.toolExecutor.setDiscordHandler(handler);
  }

  public getServerMapValidator(): ServerMapValidator {
    return this.serverMapValidator;
  }

  /**
   * Validates the server map against the connected Discord server or provided snapshot.
   */
  public async validateServerMap(snapshot?: DiscordServerSnapshot): Promise<ServerMapValidationReport> {
    let actualSnapshot: DiscordServerSnapshot | undefined = snapshot;

    if (!actualSnapshot) {
      if (this.discordHandler && typeof this.discordHandler.getServerSnapshot === 'function') {
        actualSnapshot = await this.discordHandler.getServerSnapshot();
      }
    }

    const snapshotToValidate = actualSnapshot || ServerMapValidator.getCanonicalSnapshot();
    const report = this.serverMapValidator.validate(snapshotToValidate);

    logger.log({
      event: `Server Map Audit Executed: ${report.status}`,
      actionType: 'SERVER_MAP_AUDIT',
      decision: report.status,
      success: report.status !== 'CRITICAL_DIVERGENCES',
      aiUsed: false,
      durationMs: 0,
      details: `Compliance Score: ${report.metrics.complianceScore}%, Matched Channels: ${report.metrics.matchedChannels}/${report.metrics.totalExpectedChannels}, Findings: ${report.allFindings.length}`,
    });

    return report;
  }

  public getMemoryStore(): IMemoryStore {
    return this.memoryStore;
  }

  public getStateManager(): StateManager {
    return this.stateManager;
  }

  public getEventEngine(): EventEngine {
    return this.eventEngine;
  }

  public getSakuraMailBridge(): SakuraMailBridge {
    return this.sakuraMailBridge;
  }

  public getChannelBehaviorPolicy(): ChannelBehaviorPolicy {
    return this.channelBehaviorPolicy;
  }

  public handleSakuraMailEvent(raw: SakuraMailRawInput): {
    accepted: boolean;
    abstractEvent?: SakuraMailAbstractEvent;
    privacyWarning?: string;
  } {
    return this.sakuraMailBridge.ingestEvent(raw);
  }

  public getConfig(): FoxtyConfig {
    return this.config;
  }

  public getChannelById(id: string): ChannelInfo | undefined {
    return this.config.channels.find((c: ChannelInfo) => c.id === id);
  }

  public getDefaultChannel(): ChannelInfo {
    return this.config.channels[0];
  }

  // ==========================================
  // Core Pipeline Execution
  // ==========================================
  public async handleMessage(params: {
    channelId: string;
    author: string;
    content: string;
    messageId?: string;
    isBot?: boolean;
    isDirectMention?: boolean;
  }): Promise<InteractionResult> {
    const startTime = Date.now();
    const { channelId, author, content, isBot = false, isDirectMention = false } = params;

    // Ignore bot messages by default to prevent feedback loops
    if (isBot && !author.toLowerCase().includes('foxty-test')) {
      return {
        decision: { decision: 'ignore', tone: 'neutral', messages: [] },
        toolResults: [],
        state: this.stateManager.getState(),
        observations: [],
        memoriesRetrieved: [],
        aiUsed: false,
        tokensUsed: 0,
      };
    }

    const channel = this.getChannelById(channelId) || {
      id: channelId,
      name: channelId,
      category: 'General',
      type: 'social',
      isProtected: false,
      allowSpontaneousEvents: true,
      toneGuidance: 'Default context',
    };

    const currentMessage: ChatMessage = {
      id: params.messageId || `msg-${Date.now()}`,
      author,
      channelId,
      content,
      timestamp: new Date().toISOString(),
      isBot,
    };

    // Maintain recent messages buffer for channel
    const buffer = this.recentMessagesBuffer.get(channelId) || [];
    buffer.push(currentMessage);
    if (buffer.length > 20) buffer.shift();
    this.recentMessagesBuffer.set(channelId, buffer);

    // 1. Behavioral Analysis with previous channel history
    const previousHistory = buffer.slice(0, -1);
    const observation = this.behavioralAnalyzer.analyze(author, content, previousHistory);
    const currentState = this.stateManager.getState();

    // 2. Authoritative Channel Behavior Policy Pre-Consultation Gate
    // The Core MUST determine the policy before consulting DeepSeek.
    const policyEvaluation = this.channelBehaviorPolicy.evaluatePreConsultation({
      channel,
      isDirectMention,
      currentTime: startTime,
    });

    if (!policyEvaluation.shouldProceedToBrain) {
      logger.log({
        event: 'Foxty Channel Policy Gate: Skipped Brain Consultation',
        channelId,
        author,
        actionType: 'POLICY_GATE',
        decision: 'SILENCE',
        success: true,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        details: `Level: ${policyEvaluation.policy.level}, Reason: ${policyEvaluation.reason}, Mention: ${isDirectMention}`,
      });

      return {
        decision: {
          decision: 'ignore',
          tone: 'neutral',
          messages: [],
          reasoning: policyEvaluation.reason,
        },
        toolResults: [],
        state: currentState,
        observations: [observation],
        memoriesRetrieved: [],
        aiUsed: false,
        tokensUsed: 0,
      };
    }

    // 3. Personality engine secondary economy check (for non-mentions)
    const shouldSilence = this.personalityEngine.shouldStaySilent(currentState, isDirectMention, channel);

    if (shouldSilence) {
      logger.log({
        event: 'Foxty Chose Silence (Personality Economy)',
        channelId,
        author,
        actionType: 'PERSONA_DECISION',
        decision: 'SILENCE',
        success: true,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        details: `Policy: ${channel.foxtyPolicy || 'default'}, Mention: ${isDirectMention}, Author: ${author}`,
      });

      return {
        decision: { decision: 'ignore', tone: 'neutral', messages: [], reasoning: 'Silence enforced by persona economy' },
        toolResults: [],
        state: currentState,
        observations: [observation],
        memoriesRetrieved: [],
        aiUsed: false,
        tokensUsed: 0,
      };
    }

    // 4. Build Context Package
    const context = await this.contextBuilder.buildContext({
      channel,
      currentMessage,
      recentMessages: buffer,
      observations: [observation],
      state: currentState,
      availableTools: this.toolRegistry.getAvailableTools(),
    });

    // 5. DeepSeek Brain Evaluation (Only suggests behavior; does NOT authorize)
    const brainResult = await this.deepSeekAdapter.evaluate(
      context,
      isDirectMention ? `User ${author} is directly addressing you: "${content}"` : undefined
    );

    // 6. Post-Evaluation Core Guardrails: DeepSeek only suggests; the Core enforces
    const toolResults: ToolExecutionResult[] = [];

    // 6a. Filter and execute messages according to channel policy burst and permissions
    if (brainResult.decision.decision === 'respond' && brainResult.decision.messages.length > 0) {
      const allowedMessages = this.channelBehaviorPolicy.filterProposedMessages(
        brainResult.decision.messages,
        channel
      );

      for (const msg of allowedMessages) {
        const sendResult = await this.toolExecutor.execute(
          {
            tool: 'send_message',
            arguments: { channel_id: channel.id, content: msg },
          },
          channel
        );
        toolResults.push(sendResult);
      }

      if (allowedMessages.length > 0) {
        this.channelBehaviorPolicy.recordResponse(channel.id, Date.now());
      }
    }

    // 6b. Filter and execute reactions strictly according to channel policy
    if (brainResult.decision.reactions && brainResult.decision.reactions.length > 0 && params.messageId) {
      const allowedReactions = this.channelBehaviorPolicy.filterProposedReactions(
        brainResult.decision.reactions,
        channel
      );

      for (const emoji of allowedReactions) {
        const reactResult = await this.toolExecutor.execute(
          {
            tool: 'react',
            arguments: {
              channel_id: channel.id,
              message_id: params.messageId,
              emoji,
            },
          },
          channel
        );
        toolResults.push(reactResult);
      }
    }

    // 6c. Filter and execute action requests strictly according to channel policy
    if (brainResult.decision.actionRequests && brainResult.decision.actionRequests.length > 0) {
      const { approved, rejected } = this.channelBehaviorPolicy.filterProposedTools(
        brainResult.decision.actionRequests as ActionRequest[],
        channel
      );

      // Log any rejected unauthorized suggestions from DeepSeek
      for (const rej of rejected) {
        toolResults.push({
          tool: rej.action.tool,
          success: false,
          error: `[Core Policy Violation] ${rej.reason}`,
        });
      }

      for (const req of approved) {
        const actionResult = await this.toolExecutor.execute(req, channel);
        toolResults.push(actionResult);
      }
    }

    // 6d. Save memories ONLY if channel policy allows memory accumulation
    if (
      brainResult.decision.memoryCandidates &&
      policyEvaluation.policy.canSaveMemories &&
      !isSakuraMailChannel(channel.id)
    ) {
      for (const candidate of brainResult.decision.memoryCandidates) {
        if (candidate.confidence >= 0.85 && candidate.content && candidate.content.trim().length >= 3) {
          const lower = candidate.content.toLowerCase();
          const sensitiveKeywords = ['senha', 'password', 'token', 'secret', 'credencial', 'intimate', 'sexual', 'privad'];
          const containsSensitive = sensitiveKeywords.some((kw) => lower.includes(kw));

          // Core policy: never allow sensitive keywords to be marked safe_for_teasing
          const safeForTeasing = containsSensitive ? false : candidate.safeForTeasing;

          await this.memoryStore.save({
            content: candidate.content,
            type: candidate.type,
            importance: candidate.confidence,
            confidence: candidate.confidence,
            source: author,
            targetUser: candidate.targetUser,
            safeForTeasing,
            retention: 'permanent',
            tags: ['deepseek-suggested'],
          });
        }
      }
    }

    // Update state based on interaction (e.g. slight curiosity bump)
    this.stateManager.adjust({ curiosity: 0.02, energy: 0.01 });

    return {
      decision: brainResult.decision,
      toolResults,
      state: this.stateManager.getState(),
      observations: [observation],
      memoriesRetrieved: context.relevantMemories,
      aiUsed: brainResult.aiUsed,
      tokensUsed: brainResult.tokensUsed,
    };
  }

  // ==========================================
  // /foxty Slash Command Handler
  // ==========================================
  public async handleSlashCommand(params: {
    commandName: string;
    subcommand?: string;
    prompt?: string;
    author: string;
    channelId: string;
  }): Promise<{ reply: string; decision: BrainDecision; toolResults: ToolExecutionResult[] }> {
    const { subcommand, prompt, author, channelId } = params;

    // Strict boundary: blocked channels prohibit any interactive presence
    if (isChannelBlocked(channelId)) {
      return {
        reply: '🦊 *Foxty permanece em silêncio e não intervém neste canal.*',
        decision: { decision: 'ignore', tone: 'pseudo_serious', messages: [] },
        toolResults: [],
      };
    }

    // Subcommand: diagnostico / mapa / audit
    if (
      subcommand === 'diagnostico' ||
      subcommand === 'mapa' ||
      subcommand === 'audit' ||
      (prompt && (prompt.toLowerCase() === 'diagnostico' || prompt.toLowerCase() === 'mapa' || prompt.toLowerCase() === 'audit'))
    ) {
      const report = await this.validateServerMap();
      const statusEmoji =
        report.status === 'PERFECT_MATCH' ? '✅' : report.status === 'COMPLIANT_WITH_WARNINGS' ? '⚠️' : '❌';

      const shortSummary =
        `🦊 **Diagnóstico do Mapa — Cherry Place** ${statusEmoji}\n` +
        `• **Status**: \`${report.status}\` | **Score**: **${report.metrics.complianceScore}%**\n` +
        `• **Guild ID**: ${report.guildValidation.isGuildIdMatch ? '✅ Conforme' : '❌ Divergente'}\n` +
        `• **Categorias**: ${report.metrics.matchedCategories}/${report.metrics.totalExpectedCategories} OK\n` +
        `• **Canais**: ${report.metrics.matchedChannels}/${report.metrics.totalExpectedChannels} OK (Ausentes: ${report.metrics.missingChannels} | Inesperados: ${report.metrics.unexpectedChannelsCount})\n` +
        `• **Achados**: ${report.allFindings.length} (${report.metrics.criticalErrorsCount} erros, ${report.metrics.warningsCount} alertas)\n` +
        `\n*Dica: Abra o Dashboard Web para ver a árvore visual completa e exportar o relatório completo.*`;

      return {
        reply: shortSummary,
        decision: {
          decision: 'respond',
          tone: 'pseudo_serious',
          messages: [shortSummary],
        },
        toolResults: [],
      };
    }

    // Subcommand: status
    if (subcommand === 'status' || (!prompt && !subcommand)) {
      const state = this.stateManager.getState();
      const statusText =
        `🦊 **Foxty Status** [Cherry Place]\n` +
        `• **Humor**: ${(state.mood * 100).toFixed(0)}% | **Energia**: ${(state.energy * 100).toFixed(0)}%\n` +
        `• **Curiosidade**: ${(state.curiosity * 100).toFixed(0)}% | **Caos**: ${(state.chaos * 100).toFixed(0)}%\n` +
        `• **Teatralidade**: ${(state.drama * 100).toFixed(0)}% | **Economia**: ${((1 - state.talkativeness) * 100).toFixed(0)}%\n` +
        `• *Observando silenciosamente o servidor...*`;

      return {
        reply: statusText,
        decision: { decision: 'respond', tone: 'clever', messages: [statusText] },
        toolResults: [],
      };
    }

    // Direct invocation via prompt
    const interaction = await this.handleMessage({
      channelId,
      author,
      content: prompt || 'olá foxty',
      isDirectMention: true,
    });

    const reply =
      interaction.decision.messages.length > 0
        ? interaction.decision.messages.join('\n')
        : '🦊 *Foxty apenas observa com os olhos semicerrados.*';

    return {
      reply,
      decision: interaction.decision,
      toolResults: interaction.toolResults,
    };
  }
}
