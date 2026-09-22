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
  RuntimeKnowledgeStatus,
} from '../types.js';
import {
  FoxtyConfig,
  isSakuraMailChannel,
  isChannelBlocked,
  getChannelById,
} from '../config/index.js';
import { ContextBuilder } from './ContextBuilder.js';
import { HistoryManager } from './HistoryManager.js';
import { StateManager } from './StateManager.js';
import { Logger, logger } from './Logger.js';
import { IMemoryStore, createDefaultMemoryStore, MemoryHealth } from '../memory/index.js';
import { RetrievalCoordinator } from '../memory/RetrievalCoordinator.js';
import { BehavioralAnalyzer } from '../behavior/BehavioralAnalyzer.js';
import { PersonalityEngine } from '../personality/PersonalityEngine.js';
import { EventEngine } from '../events/EventEngine.js';
import { DeepSeekAdapter, DeepSeekDiagnostic } from '../brain/DeepSeekAdapter.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { DiscordActionHandler, ToolExecutionResult, ToolExecutor } from '../tools/ToolExecutor.js';
import { SakuraMailBridge, SakuraMailRawInput } from '../integrations/SakuraMailBridge.js';
import { ServerMapValidator } from '../validator/ServerMapValidator.js';
import {
  ChannelBehaviorPolicy,
  ChannelPolicyLevel,
  PreConsultationDecision,
} from '../policy/ChannelBehaviorPolicy.js';
import { coreMetrics, CoreMetrics } from './FoxtyMetrics.js';
import { ObservationQueue, ObservationCandidate } from '../behavior/ObservationQueue.js';
import { AutonomyBudgetManager } from '../behavior/AutonomyBudgetManager.js';
import { ObservationPreFilter } from '../behavior/ObservationPreFilter.js';
import { ObservationEvaluator } from '../behavior/ObservationEvaluator.js';
import { ReactionDiversityPolicy } from '../behavior/ReactionDiversityPolicy.js';

export interface GeneralHealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  discord: 'connected' | 'disconnected' | 'simulated';
  deepseek: 'connected' | 'standby' | 'disabled' | 'error';
  memory: 'connected' | 'degraded' | 'error';
  sakuramail: 'connected' | 'disabled';
  metrics: CoreMetrics;
  knowledge?: RuntimeKnowledgeStatus;
}

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
  private historyManager: HistoryManager;
  private retrievalCoordinator: RetrievalCoordinator;
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
  private startTime: number = Date.now();

  // Phase 4: Observation & Autonomy Loop
  private observationQueue: ObservationQueue;
  private budgetManager: AutonomyBudgetManager;
  private observationPreFilter: ObservationPreFilter;
  private observationEvaluator: ObservationEvaluator;
  private reactionDiversityPolicy: ReactionDiversityPolicy;

  constructor(private config: FoxtyConfig, customMemoryStore?: IMemoryStore) {
    this.memoryStore =
      customMemoryStore ||
      config.memoryStore ||
      createDefaultMemoryStore({
        provider: config.memoryProvider,
      });
    this.historyManager = new HistoryManager(200);
    this.retrievalCoordinator = new RetrievalCoordinator(this.memoryStore);
    this.stateManager = new StateManager(config.defaultState);
    this.behavioralAnalyzer = new BehavioralAnalyzer();
    this.personalityEngine = new PersonalityEngine();
    this.channelBehaviorPolicy = new ChannelBehaviorPolicy();
    this.eventEngine = new EventEngine(config.globalEventCooldownMinutes);

    // Initialize Phase 4 Autonomy Stack
    this.observationQueue = new ObservationQueue();
    this.budgetManager = new AutonomyBudgetManager();
    this.observationPreFilter = new ObservationPreFilter(this.budgetManager);
    this.observationEvaluator = new ObservationEvaluator(this.budgetManager);
    this.reactionDiversityPolicy = new ReactionDiversityPolicy();
    this.contextBuilder = new ContextBuilder(this.memoryStore, {
      retrievalCoordinator: this.retrievalCoordinator,
    });
    this.serverMapValidator = new ServerMapValidator();
    this.deepSeekAdapter = new DeepSeekAdapter(
      config.deepSeek || {
        apiKey: config.deepSeekApiKey,
        baseUrl: config.deepSeekBaseUrl,
        model: config.deepSeekModel,
      }
    );
    this.toolRegistry = new ToolRegistry();
    this.toolExecutor = new ToolExecutor(
      this.toolRegistry,
      undefined,
      this.memoryStore,
      this.eventEngine,
      () => this.config.channels,
      this.historyManager
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

  public getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  public getRetrievalCoordinator(): RetrievalCoordinator {
    return this.retrievalCoordinator;
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

    return this.serverMapValidator.validate(actualSnapshot);
  }

  public getDeepSeekAdapter(): DeepSeekAdapter {
    return this.deepSeekAdapter;
  }

  public getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  public getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  public getMemoryStore(): IMemoryStore {
    return this.memoryStore;
  }

  public getStateManager(): StateManager {
    return this.stateManager;
  }

  public getSakuraMailBridge(): SakuraMailBridge {
    return this.sakuraMailBridge;
  }

  public getContextBuilder(): ContextBuilder {
    return this.contextBuilder;
  }

  public getBehavioralAnalyzer(): BehavioralAnalyzer {
    return this.behavioralAnalyzer;
  }

  public getEventEngine(): EventEngine {
    return this.eventEngine;
  }

  public getChannelBehaviorPolicy(): ChannelBehaviorPolicy {
    return this.channelBehaviorPolicy;
  }

  public getConfig(): FoxtyConfig {
    return this.config;
  }

  public getChannelById(channelId: string): ChannelInfo | undefined {
    return this.config.channels.find((c) => c.id === channelId) || (getChannelById(channelId) as ChannelInfo | undefined);
  }

  public async getGeneralHealth(): Promise<GeneralHealthStatus> {
    const memoryHealth: MemoryHealth = await this.memoryStore.getHealth();
    const deepseekDiag = this.deepSeekAdapter.getDiagnostics();
    const isDiscordConnected = this.discordHandler ? (this.discordHandler as any).isReady?.() ?? true : false;
    const knowledgeStatus = this.deepSeekAdapter.getKnowledgeStatus();

    let deepseekStatus: GeneralHealthStatus['deepseek'] = 'connected';
    if (!deepseekDiag.configured) {
      deepseekStatus = 'disabled';
    } else if (deepseekDiag.status === 'standby_insufficient_balance') {
      deepseekStatus = 'standby';
    } else if (deepseekDiag.status === 'error' || deepseekDiag.circuitBreaker === 'OPEN') {
      deepseekStatus = 'error';
    }

    const discordStatus: GeneralHealthStatus['discord'] =
      this.config.discordToken && isDiscordConnected
        ? 'connected'
        : this.config.discordToken
        ? 'disconnected'
        : 'simulated';

    const memoryStatus: GeneralHealthStatus['memory'] =
      memoryHealth.connected && memoryHealth.readWriteOk
        ? 'connected'
        : memoryHealth.connected
        ? 'degraded'
        : 'error';

    let overallStatus: GeneralHealthStatus['status'] = 'ok';
    if (memoryStatus === 'error' || (this.config.discordToken && discordStatus === 'disconnected')) {
      overallStatus = 'unhealthy';
    } else if (
      deepseekStatus === 'standby' ||
      deepseekStatus === 'error' ||
      memoryStatus === 'degraded' ||
      !knowledgeStatus.isComplete ||
      knowledgeStatus.missingDocuments.length > 0
    ) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      discord: discordStatus,
      deepseek: deepseekStatus,
      memory: memoryStatus,
      sakuramail: 'connected',
      metrics: coreMetrics.getSnapshot(),
      knowledge: knowledgeStatus,
    };
  }

  public async getDeepSeekHealth(): Promise<any> {
    return this.deepSeekAdapter.getDiagnostics();
  }

  public async getMemoryHealth(): Promise<MemoryHealth> {
    return this.memoryStore.getHealth();
  }

  public getRuntimeKnowledgeStatus(): RuntimeKnowledgeStatus {
    return this.deepSeekAdapter.getKnowledgeStatus();
  }

  public reloadRuntimeKnowledge(): RuntimeKnowledgeStatus {
    return this.deepSeekAdapter.reloadRuntimeKnowledge();
  }

  public getInjectedConstitutionSummary(): string {
    return this.deepSeekAdapter.getInjectedConstitutionSummary();
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
    replyToMessageId?: string;
    repliedMessage?: { id?: string; author: string; content: string; timestamp?: string } | null;
    dispatchToDiscord?: boolean;
  }): Promise<InteractionResult> {
    const startTime = Date.now();
    const {
      channelId,
      author,
      content,
      isBot = false,
      isDirectMention = false,
      replyToMessageId,
      repliedMessage = null,
      dispatchToDiscord = true,
    } = params;

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
      replyToMessageId,
      repliedMessage: repliedMessage
        ? {
            id: repliedMessage.id || replyToMessageId,
            author: repliedMessage.author,
            content: repliedMessage.content,
            timestamp: repliedMessage.timestamp,
          }
        : undefined,
    };

    // Maintain channel history via HistoryManager
    coreMetrics.recordMessageObserved();
    this.historyManager.addMessage(currentMessage);

    const immediateMessages = this.historyManager.getImmediateWindow(channelId, 20);

    // 1. Behavioral Analysis with previous channel history
    const previousHistory = immediateMessages.slice(0, -1);
    const observation = this.behavioralAnalyzer.analyze(author, content, previousHistory);
    const currentState = this.stateManager.getState();

    // 2. Authoritative Channel Behavior Policy Pre-Consultation Gate
    const policyEvaluation = this.channelBehaviorPolicy.evaluatePreConsultation({
      channel,
      isDirectMention,
      currentTime: startTime,
    });

    if (!policyEvaluation.shouldProceedToBrain) {
      coreMetrics.recordBrainSkipped();
      coreMetrics.recordSilence();
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
      coreMetrics.recordBrainSkipped();
      coreMetrics.recordSilence();
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
      recentMessages: immediateMessages,
      observations: [observation],
      state: currentState,
      availableTools: this.toolRegistry.getAvailableTools(),
      isDirectMention,
      repliedMessage: currentMessage.repliedMessage || repliedMessage,
      historyManager: this.historyManager,
    });

    if (context.relevantMemories && context.relevantMemories.length > 0) {
      coreMetrics.recordMemoryRead(context.relevantMemories.length);
    }

    // 5. DeepSeek Brain Evaluation (Supports interactive tool calling loop)
    coreMetrics.recordBrainConsultation();
    const brainResult = await this.deepSeekAdapter.evaluate(
      context,
      isDirectMention ? `User ${author} is directly addressing you: "${content}"` : undefined,
      {
        toolExecutor: this.toolExecutor,
        toolRegistry: this.toolRegistry,
      }
    );

    if (brainResult.decision.decision === 'respond') {
      if (brainResult.aiUsed) {
        coreMetrics.recordAiResponse(brainResult.tokensUsed);
      } else {
        coreMetrics.recordFallbackResponse();
      }
    } else {
      coreMetrics.recordSilence();
    }

    // 6. Post-Evaluation Core Guardrails: DeepSeek only suggests; the Core enforces
    const toolResults: ToolExecutionResult[] = [];

    // Check if the brain already requested an explicit message action (e.g. reply_to_message, send_message)
    const hasExplicitMessageAction = brainResult.decision.actionRequests?.some(
      (ar) => ar.tool === 'send_message' || ar.tool === 'reply_to_message' || ar.tool === 'send_multiple_messages'
    );

    // If explicit message tool was used but messages array is empty, mirror content for response consumers
    if (hasExplicitMessageAction && (!brainResult.decision.messages || brainResult.decision.messages.length === 0)) {
      const explicitMsg = brainResult.decision.actionRequests?.find(
        (ar) => (ar.tool === 'reply_to_message' || ar.tool === 'send_message') && ar.arguments?.content
      );
      if (explicitMsg?.arguments?.content) {
        brainResult.decision.messages = [explicitMsg.arguments.content];
      }
    }

    // 6a. Filter and execute messages according to channel policy burst and permissions
    if (dispatchToDiscord && !hasExplicitMessageAction && brainResult.decision.decision === 'respond' && brainResult.decision.messages.length > 0) {
      const allowedMessages = this.channelBehaviorPolicy.filterProposedMessages(
        brainResult.decision.messages,
        channel
      );

      let isFirstMessage = true;
      for (const msg of allowedMessages) {
        coreMetrics.recordToolExecution();
        let sendResult;
        if (isFirstMessage && params.messageId) {
          sendResult = await this.toolExecutor.execute(
            {
              tool: 'reply_to_message',
              arguments: { channel_id: channel.id, message_id: params.messageId, content: msg },
            },
            channel
          );
          isFirstMessage = false;
        } else {
          sendResult = await this.toolExecutor.execute(
            {
              tool: 'send_message',
              arguments: { channel_id: channel.id, content: msg },
            },
            channel
          );
        }
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
        channel,
        isDirectMention ? () => 0 : undefined
      );

      for (const emoji of allowedReactions) {
        coreMetrics.recordToolExecution();
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
        if (!dispatchToDiscord && (req.tool === 'send_message' || req.tool === 'reply_to_message' || req.tool === 'send_multiple_messages')) {
          // Message delivery is handled directly by caller (e.g. Slash Command editReply)
          continue;
        }

        coreMetrics.recordToolExecution();
        const actionResult = await this.toolExecutor.execute(req, channel);
        toolResults.push(actionResult);

        if (actionResult.success && (req.tool === 'send_message' || req.tool === 'reply_to_message' || req.tool === 'send_multiple_messages')) {
          this.channelBehaviorPolicy.recordResponse(channel.id, Date.now());
        }
      }
    }

    // 6d. Save memories ONLY if channel policy allows memory accumulation
    if (
      brainResult.decision.memoryCandidates &&
      policyEvaluation.policy.canSaveMemories &&
      !isSakuraMailChannel(channel.id)
    ) {
      for (const candidate of brainResult.decision.memoryCandidates) {
        if (candidate.confidence >= 0.70 && candidate.content && candidate.content.trim().length >= 3) {
          const lower = candidate.content.toLowerCase();
          const sensitiveKeywords = ['senha', 'password', 'token', 'secret', 'credencial', 'intimate', 'sexual', 'privad'];
          const containsSensitive = sensitiveKeywords.some((kw) => lower.includes(kw));

          // Core policy: never allow sensitive keywords to be marked safe_for_teasing
          const safeForTeasing = containsSensitive ? false : candidate.safeForTeasing;

          coreMetrics.recordMemoryWrite();
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

    // Update state based on interaction
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

    if (isChannelBlocked(channelId)) {
      return {
        reply: '🦊 *Foxty permanece em silêncio e não intervém neste canal.*',
        decision: { decision: 'ignore', tone: 'pseudo_serious', messages: [] },
        toolResults: [],
      };
    }

    if (
      subcommand === 'conexao' ||
      subcommand === 'connection' ||
      subcommand === 'ping' ||
      (prompt && (prompt.toLowerCase() === 'conexao' || prompt.toLowerCase() === 'connection'))
    ) {
      if (this.discordHandler && typeof (this.discordHandler as any).auditConnection === 'function') {
        const audit = await (this.discordHandler as any).auditConnection();
        return {
          reply: audit.summaryMarkdown,
          decision: {
            decision: 'respond',
            tone: 'pseudo_serious',
            messages: [audit.summaryMarkdown],
          },
          toolResults: [],
        };
      } else {
        const msg = '🦊 **Diagnóstico de Conexão Discord**\n• Status: `STANDALONE / DESCONECTADO`\n• O cliente do Discord não está ativo ou não foi vinculado.';
        return {
          reply: msg,
          decision: {
            decision: 'respond',
            tone: 'pseudo_serious',
            messages: [msg],
          },
          toolResults: [],
        };
      }
    }

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
        `• **Canais Canônicos**: ${report.metrics.matchedChannels} correspondências exatas\n` +
        `• **Canais Faltantes**: ${report.metrics.missingChannels} | **Canais Inesperados**: ${report.metrics.unexpectedChannelsCount}\n` +
        `• **Categorias Faltantes**: ${report.metrics.missingCategories} | **Inesperadas**: ${report.metrics.unexpectedCategoriesCount}`;

      return {
        reply: shortSummary,
        decision: {
          decision: 'respond',
          tone: 'clever',
          messages: [shortSummary],
        },
        toolResults: [],
      };
    }

    if (subcommand === 'status') {
      const health = await this.getGeneralHealth();
      const statusText =
        `🦊 **Foxty Status — Core Diagnostic**\n` +
        `• Saúde Geral: \`${health.status.toUpperCase()}\` | Uptime: \`${health.uptime}s\`\n` +
        `• DeepSeek Brain: \`${health.deepseek.toUpperCase()}\`\n` +
        `• Memória: \`${health.memory.toUpperCase()}\` (${health.metrics.memoryReads} leituras, ${health.metrics.memoryWrites} gravações)\n` +
        `• Discord: \`${health.discord.toUpperCase()}\`\n` +
        `• Mensagens Observadas: \`${health.metrics.messagesObserved}\``;

      return {
        reply: statusText,
        decision: {
          decision: 'respond',
          tone: 'clever',
          messages: [statusText],
        },
        toolResults: [],
      };
    }

    const content = prompt || 'Olá Foxty!';
    const result = await this.handleMessage({
      channelId,
      author,
      content,
      isDirectMention: true,
    });

    const reply =
      result.decision.messages && result.decision.messages.length > 0
        ? result.decision.messages.join('\n\n')
        : '*(Foxty observa silenciosamente com um olhar curioso)* 🦊';

    return {
      reply,
      decision: result.decision,
      toolResults: result.toolResults,
    };
  }

  // ==========================================
  // SakuraMail Handling (Strict Privacy Enforcement)
  // ==========================================
  public handleSakuraMailEvent(rawInput: any): {
    accepted: boolean;
    success: boolean;
    abstractEvent?: SakuraMailAbstractEvent;
    privacyWarning?: string;
    reason?: string;
  } {
    const processResult = this.sakuraMailBridge.processEvent(rawInput);

    if (!processResult.success || !processResult.event) {
      return {
        accepted: false,
        success: false,
        reason: processResult.privacyWarning || 'Failed to abstract SakuraMail event',
      };
    }

    const event = processResult.event;

    // Strict boundary: Only save sanitized abstract counters, never personal text
    this.memoryStore.save({
      content: `[SakuraMail Log] Evento de correspondência processado: ${event.type} para o usuário ${event.user}.`,
      type: 'temporary',
      importance: 0.3,
      confidence: 1.0,
      source: 'SakuraMailBridge',
      safeForTeasing: false,
      retention: 'session',
      tags: ['sakuramail', 'abstract', 'privacy-safe'],
    }).catch?.(() => {});

    return {
      accepted: true,
      success: true,
      abstractEvent: event,
      privacyWarning: 'Letter body stripped to enforce privacy boundary (SakuraMail isolation).',
    };
  }

  // ==========================================
  // Phase 4: Autonomous Observation Loop Methods
  // ==========================================

  /**
   * Passive message observation. Records state & updates history, evaluates pre-filter,
   * and queues candidates without invoking DeepSeek directly.
   */
  public async observeMessage(params: {
    channelId: string;
    author: string;
    content: string;
    messageId?: string;
    isBot?: boolean;
    isDirectMention?: boolean;
    replyToMessageId?: string;
    repliedMessage?: { id?: string; author: string; content: string; timestamp?: string } | null;
  }): Promise<{
    queued: boolean;
    relevance: number;
    reason: string;
    candidate?: ObservationCandidate;
  }> {
    const { channelId, author, content, isBot = false, isDirectMention = false } = params;
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
      replyToMessageId: params.replyToMessageId,
      repliedMessage: params.repliedMessage
        ? {
            id: params.repliedMessage.id || params.replyToMessageId,
            author: params.repliedMessage.author,
            content: params.repliedMessage.content,
            timestamp: params.repliedMessage.timestamp,
          }
        : undefined,
    };

    // 1. Maintain channel history & update behavioral analyzer
    coreMetrics.recordMessageObserved();
    this.historyManager.addMessage(currentMessage);
    const immediate = this.historyManager.getImmediateWindow(channelId, 20);
    this.behavioralAnalyzer.analyze(author, content, immediate.slice(0, -1));

    // 2. Run cheap, synchronous pre-filter check
    const filterResult = this.observationPreFilter.evaluateMessage({
      messageId: currentMessage.id,
      channel,
      author,
      content,
      timestamp: Date.now(),
      isBot,
      isDirectMention,
      replyToMessageId: params.replyToMessageId,
    });

    if (filterResult.shouldQueue && filterResult.candidate) {
      const candidate = this.observationQueue.addCandidate(filterResult.candidate);
      return {
        queued: true,
        relevance: filterResult.relevance,
        reason: filterResult.reason,
        candidate,
      };
    }

    return {
      queued: false,
      relevance: filterResult.relevance,
      reason: filterResult.reason,
    };
  }

  /**
   * Executes a periodic observation evaluation cycle on pending candidates.
   */
  public async runObservationCycle(channelId?: string): Promise<InteractionResult | null> {
    const pending = this.observationQueue.getPendingCandidates(channelId);
    if (pending.length === 0) {
      // Fallback: evaluate EventEngine for spontaneous events
      return this.evaluateSpontaneousEventEngine(channelId);
    }

    const candidate = pending[0]; // Highest relevance
    this.observationQueue.markProcessed(candidate.id);

    const channel = this.getChannelById(candidate.channelId) || {
      id: candidate.channelId,
      name: candidate.channelId,
      category: 'General',
      type: 'social',
      isProtected: false,
      allowSpontaneousEvents: true,
      toneGuidance: 'Default context',
    };

    const recentMessages = this.historyManager.getImmediateWindow(candidate.channelId, 25);

    // Contextual candidate evaluation
    const evalResult = this.observationEvaluator.evaluateCandidate({
      candidate,
      channel,
      recentMessagesInChannel: recentMessages,
    });

    if (!evalResult.shouldIntervene) {
      logger.log({
        event: 'Observation Candidate Rejected (Silence)',
        channelId: candidate.channelId,
        actionType: 'OBSERVATION_EVAL',
        decision: 'SILENCE',
        success: true,
        aiUsed: false,
        durationMs: 0,
        details: evalResult.reason,
      });
      return null;
    }

    // Deduplication / Idempotency check
    const actionFingerprint = `${evalResult.proposedAction}::${candidate.messageId}`;
    if (this.budgetManager.isDuplicate(candidate.messageId, actionFingerprint)) {
      logger.log({
        event: 'Observation Candidate Suppressed (Duplicate Idempotency)',
        channelId: candidate.channelId,
        actionType: 'IDEMPOTENCY_SUPPRESSION',
        decision: 'SILENCE',
        success: true,
        aiUsed: false,
        durationMs: 0,
      });
      return null;
    }

    // Build context with Observer Prompt
    const currentState = this.stateManager.getState();
    const currentMessage: ChatMessage = {
      id: candidate.messageId,
      author: candidate.author,
      channelId: candidate.channelId,
      content: candidate.content,
      timestamp: new Date(candidate.timestamp).toISOString(),
      isBot: false,
    };

    const contextPackage = await this.contextBuilder.buildContext({
      channel,
      currentMessage,
      recentMessages,
      observations: [],
      state: currentState,
      availableTools: this.toolRegistry.getAvailableTools(),
      isDirectMention: false,
      historyManager: this.historyManager,
    });

    const observerPromptInstruction =
      'Você está observando esta conversa em segundo plano. Você NÃO foi mencionado diretamente. ' +
      'Analise o contexto recente e decida se existe um motivo REAL e de alto valor para intervir agora, ou se deve permanecer em silêncio.\n' +
      'Instruções de Decisão:\n' +
      '- Se optar por não intervir, retorne a decisão "ignore" (esta deve ser a escolha mais comum e natural).\n' +
      '- Se optar por intervir, escolha o modo apropriado: "respond" (mensagem simples), "reply_to_message" (para responder a uma mensagem anterior específica), "react" (usar um emoji pertinente), ou "burst" (2 a 3 mensagens curtas sequenciais).\n' +
      '- Não seja chato ou hiperativo. Mantenha a postura de um residente observador em Cherry Place.';

    coreMetrics.recordBrainConsultation();
    const brainResult = await this.deepSeekAdapter.evaluate(
      contextPackage,
      observerPromptInstruction
    );

    this.budgetManager.recordAiUsage(brainResult.tokensUsed, 'RARE_AI');

    // Silence decision
    if (brainResult.decision.decision === 'ignore' || (!brainResult.decision.messages || brainResult.decision.messages.length === 0)) {
      coreMetrics.recordSilence();
      logger.log({
        event: 'Foxty Observer Brain Chose Silence',
        channelId: candidate.channelId,
        actionType: 'OBSERVER_DECISION',
        decision: 'SILENCE',
        success: true,
        aiUsed: brainResult.aiUsed,
        durationMs: 0,
        details: brainResult.decision.reasoning,
      });

      return {
        decision: brainResult.decision,
        toolResults: [],
        state: currentState,
        observations: [],
        memoriesRetrieved: contextPackage.relevantMemories || [],
        aiUsed: brainResult.aiUsed,
        tokensUsed: brainResult.tokensUsed,
      };
    }

    // Intervene decision
    const toolResults: ToolExecutionResult[] = [];

    // Reaction diversity
    if (brainResult.decision.reactions && brainResult.decision.reactions.length > 0) {
      const diverseEmoji = this.reactionDiversityPolicy.selectEmoji(
        candidate.content,
        brainResult.decision.tone,
        candidate.channelId
      );
      brainResult.decision.reactions = [diverseEmoji];
    }

    // Burst cap (max 3 messages)
    if (brainResult.decision.messages && brainResult.decision.messages.length > 3) {
      brainResult.decision.messages = brainResult.decision.messages.slice(0, 3);
    }

    // Record action fingerprint & intervention cooldowns
    this.budgetManager.recordActionFingerprint(candidate.messageId, actionFingerprint);
    this.budgetManager.recordIntervention({
      channelId: candidate.channelId,
      userId: candidate.author,
      interventionType: evalResult.proposedAction,
    });
    this.channelBehaviorPolicy.recordResponse(candidate.channelId, Date.now());

    // Execute actions via ToolExecutor
    if (evalResult.proposedAction === 'REPLY_TO_MESSAGE' || brainResult.decision.actionRequests?.some((a) => a.tool === 'reply_to_message')) {
      const replyContent = brainResult.decision.messages[0] || 'Interessante observação...';
      const execRes = await this.toolExecutor.execute(
        {
          tool: 'reply_to_message',
          arguments: {
            channel_id: candidate.channelId,
            message_id: candidate.messageId,
            content: replyContent,
          },
        },
        channel
      );
      toolResults.push(execRes);
    } else if (brainResult.decision.messages && brainResult.decision.messages.length > 0) {
      for (const msg of brainResult.decision.messages) {
        const execRes = await this.toolExecutor.execute(
          {
            tool: 'send_message',
            arguments: {
              channel_id: candidate.channelId,
              content: msg,
            },
          },
          channel
        );
        toolResults.push(execRes);
      }
    }

    return {
      decision: brainResult.decision,
      toolResults,
      state: currentState,
      observations: [],
      memoriesRetrieved: contextPackage.relevantMemories || [],
      aiUsed: brainResult.aiUsed,
      tokensUsed: brainResult.tokensUsed,
    };
  }

  /**
   * Spontaneous EventEngine evaluation integrated into the observation cycle.
   */
  public evaluateSpontaneousEventEngine(channelId?: string, now?: number): InteractionResult | null {
    const channel = channelId
      ? this.getChannelById(channelId)
      : this.config.channels.find((c) => !c.isProtected && c.allowSpontaneousEvents);

    if (!channel || !channel.allowSpontaneousEvents) return null;

    const cdCheck = this.budgetManager.checkCooldowns({
      channelId: channel.id,
      interventionType: 'event',
      now: now ?? Date.now(),
    });
    if (!cdCheck.allowed) return null;

    const eventResult = this.eventEngine.triggerTestEvent(undefined, channel);
    if (!eventResult.triggered || !eventResult.event) return null;

    this.budgetManager.recordIntervention({
      channelId: channel.id,
      interventionType: 'event',
    });

    const messages = eventResult.event.payload?.quips || eventResult.event.payload?.burst || ['🦊 *Foxty observa silenciosamente.*'];

    return {
      decision: {
        decision: 'respond',
        tone: 'curious',
        messages,
        reasoning: `Spontaneous Event Engine triggered: ${eventResult.event.name}`,
      },
      toolResults: [],
      state: this.stateManager.getState(),
      observations: [],
      memoriesRetrieved: [],
      aiUsed: false,
      tokensUsed: 0,
    };
  }

  // Getters for Phase 4 components
  public getObservationQueue(): ObservationQueue {
    return this.observationQueue;
  }

  public getAutonomyBudgetManager(): AutonomyBudgetManager {
    return this.budgetManager;
  }

  public getReactionDiversityPolicy(): ReactionDiversityPolicy {
    return this.reactionDiversityPolicy;
  }

  public getObservationPreFilter(): ObservationPreFilter {
    return this.observationPreFilter;
  }

  public getObservationEvaluator(): ObservationEvaluator {
    return this.observationEvaluator;
  }
}
