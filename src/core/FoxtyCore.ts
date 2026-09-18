import {
  ActionRequest,
  BrainDecision,
  ChannelInfo,
  ChatMessage,
  FoxtyState,
  MemoryItem,
  SakuraMailAbstractEvent,
} from '../types.js';
import { FoxtyConfig } from '../config/index.js';
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
  private recentMessagesBuffer: Map<string, ChatMessage[]> = new Map();

  constructor(private config: FoxtyConfig) {
    this.memoryStore = new InMemoryStore(true);
    this.stateManager = new StateManager(config.defaultState);
    this.behavioralAnalyzer = new BehavioralAnalyzer();
    this.personalityEngine = new PersonalityEngine();
    this.eventEngine = new EventEngine(config.globalEventCooldownMinutes);
    this.contextBuilder = new ContextBuilder(this.memoryStore);
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
    this.toolExecutor.setDiscordHandler(handler);
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

    // 2. Personality decision: check if Foxty should stay silent (if not directly mentioned)
    const currentState = this.stateManager.getState();
    const shouldSilence = this.personalityEngine.shouldStaySilent(currentState, isDirectMention);

    if (shouldSilence && !isDirectMention) {
      logger.log({
        event: 'Foxty Chose Silence (Economical Persona)',
        channelId,
        author,
        actionType: 'PERSONA_DECISION',
        decision: 'SILENCE',
        success: true,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        details: `Author: ${author}, Content: "${content.substring(0, 40)}"`,
      });

      return {
        decision: { decision: 'ignore', tone: 'neutral', messages: [], reasoning: 'Economical silence' },
        toolResults: [],
        state: currentState,
        observations: [observation],
        memoriesRetrieved: [],
        aiUsed: false,
        tokensUsed: 0,
      };
    }

    // 3. Build Context Package
    const context = await this.contextBuilder.buildContext({
      channel,
      currentMessage,
      recentMessages: buffer,
      observations: [observation],
      state: currentState,
      availableTools: this.toolRegistry.getAvailableTools(),
    });

    // 4. DeepSeek Brain Evaluation
    const brainResult = await this.deepSeekAdapter.evaluate(
      context,
      isDirectMention ? `User ${author} is directly addressing you: "${content}"` : undefined
    );

    // 5. Tool Validation & Execution Pipeline
    const toolResults: ToolExecutionResult[] = [];

    // If decision is to respond, format send_message actions
    if (brainResult.decision.decision === 'respond' && brainResult.decision.messages.length > 0) {
      // Respect max burst limits
      const messagesToSend = brainResult.decision.messages.slice(0, this.config.maxBurstMessages);

      for (const msg of messagesToSend) {
        const sendResult = await this.toolExecutor.execute(
          {
            tool: 'send_message',
            arguments: { channel_id: channel.id, content: msg },
          },
          channel
        );
        toolResults.push(sendResult);
      }
    }

    // Execute any reactions proposed
    if (brainResult.decision.reactions && brainResult.decision.reactions.length > 0 && params.messageId) {
      for (const emoji of brainResult.decision.reactions) {
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

    // Execute any explicit tool actions proposed by model
    if (brainResult.decision.actionRequests && brainResult.decision.actionRequests.length > 0) {
      for (const req of brainResult.decision.actionRequests) {
        const actionResult = await this.toolExecutor.execute(req as ActionRequest, channel);
        toolResults.push(actionResult);
      }
    }

    // Save any suggested memories (with confidence threshold)
    if (brainResult.decision.memoryCandidates) {
      for (const candidate of brainResult.decision.memoryCandidates) {
        if (candidate.confidence >= 0.85) {
          await this.memoryStore.save({
            content: candidate.content,
            type: candidate.type,
            importance: candidate.confidence,
            confidence: candidate.confidence,
            source: author,
            targetUser: candidate.targetUser,
            safeForTeasing: candidate.safeForTeasing,
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
