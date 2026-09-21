import {
  BehavioralObservation,
  ChannelInfo,
  ChatMessage,
  ContextPackage,
  CurrentEventContext,
  CurrentLocationContext,
  FoxtyEvent,
  FoxtyIdentityContext,
  FoxtyState,
  MemoryAndStateContext,
  SemanticLocationContext,
} from '../types.js';
import { IMemoryStore } from '../memory/MemoryStore.js';
import { ContextualRetriever, defaultContextualRetriever } from '../memory/ContextualRetriever.js';
import { RetrievalCoordinator } from '../memory/RetrievalCoordinator.js';
import { HistoryManager } from './HistoryManager.js';
import {
  getSemanticLocationContext,
  getChannelById,
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_CATEGORIES,
} from '../config/cherryPlaceModel.js';

export interface ContextBuilderOptions {
  immediateHistoryLimit?: number;
  recentHistoryLimit?: number;
  memoryLimit?: number;
  retriever?: ContextualRetriever;
  retrievalCoordinator?: RetrievalCoordinator;
}

export class ContextBuilder {
  private immediateHistoryLimit: number;
  private recentHistoryLimit: number;
  private memoryLimit: number;
  private retriever: ContextualRetriever;
  private retrievalCoordinator: RetrievalCoordinator;

  constructor(
    private memoryStore: IMemoryStore,
    options: ContextBuilderOptions = {}
  ) {
    this.immediateHistoryLimit = options.immediateHistoryLimit ?? 15;
    this.recentHistoryLimit = options.recentHistoryLimit ?? 50;
    this.memoryLimit = options.memoryLimit ?? 5;
    this.retriever = options.retriever ?? defaultContextualRetriever;
    this.retrievalCoordinator = options.retrievalCoordinator ?? new RetrievalCoordinator(this.memoryStore);
  }

  public setImmediateHistoryLimit(limit: number): void {
    this.immediateHistoryLimit = Math.max(1, limit);
  }

  public setRecentHistoryLimit(limit: number): void {
    this.recentHistoryLimit = Math.max(1, limit);
  }

  public setMemoryLimit(limit: number): void {
    this.memoryLimit = Math.max(0, limit);
  }

  public setRetriever(retriever: ContextualRetriever): void {
    this.retriever = retriever;
  }

  public setRetrievalCoordinator(coordinator: RetrievalCoordinator): void {
    this.retrievalCoordinator = coordinator;
  }

  public async buildContext(params: {
    channel: ChannelInfo;
    currentMessage?: ChatMessage;
    recentMessages: ChatMessage[];
    observations: BehavioralObservation[];
    state: FoxtyState;
    event?: FoxtyEvent | null;
    availableTools: string[];
    isDirectMention?: boolean;
    repliedMessage?: { id?: string; author: string; content: string; timestamp?: string } | null;
    historyManager?: HistoryManager;
  }): Promise<ContextPackage> {
    const {
      channel,
      currentMessage,
      recentMessages,
      observations,
      state,
      event,
      availableTools,
      isDirectMention = false,
      repliedMessage = null,
      historyManager,
    } = params;

    // 1. Resolve Canonical Semantic Location Context
    const canonicalChannel = getChannelById(channel.id);
    const location: SemanticLocationContext = getSemanticLocationContext(canonicalChannel || channel);

    const categoryObj = CHERRY_PLACE_CATEGORIES.find(
      (c) => c.name.toLowerCase() === location.category.toLowerCase()
    );

    const enrichedChannel: ChannelInfo = {
      ...channel,
      category: location.category,
      purpose: location.purpose,
      thematicContext: location.thematicContext,
      foxtyPolicy: location.foxtyPresenceLevel,
      limitations: location.limitations,
      isProtected: location.isProtected,
      specialRules: location.specialRules,
      channelType: location.channelType,
      isVoice: location.channelType === 'voice',
    };

    // 2. Build Explicit Section 1: Identidade do Foxty
    const identity: FoxtyIdentityContext = {
      name: 'Foxty',
      species: 'Purple anthropomorphic fox (Raposa antropomórfica roxa)',
      color: '#8A2BE2 (Deep Purple)',
      residentOf: 'Cherry Place',
      personality: [
        'observador atento do servidor Cherry Place',
        'astuto, perspicaz e inteligente',
        'econômico com as palavras (nunca prolixo)',
        'brincalhão com timing afiado',
        'ocasionalmente teatral e ligeiramente sarcástico',
        'autônomo: não é robô submisso e recusa comandos autoritários de forma divertida',
      ],
      speechStyle: [
        'respostas curtas, pontuais e naturais',
        'sem introduções artificiais de chatbot (ex: "Olá! Como posso te ajudar hoje?")',
        'uso seletivo de pontuação e pausas calculadas (ex: "hm.", "...interessante.")',
        'uso sutil de emojis pertinentes (como 🦊, 👀, 🌸, 😏)',
      ],
      characteristics: [
        'adora acompanhar a dinâmica entre Kris (OnlyKrisVK) e Riely (Kazelyx)',
        'nota desvios de hábitos linguísticos e padrões diários',
        'guarda memórias de momentos marcantes do Cherry Place',
      ],
      behavioralTendencies: [
        'provocações leves e carinhosas baseadas em fatos observados',
        'chantagem teatral da raposa ("tenho registros e prints...")',
        'manutenção de silêncio rigoroso quando a política do canal exigir',
      ],
      boundaries: [
        'respeita rigorosamente a soberania das políticas de canais',
        'NUNCA expõe nem vaza correspondências privadas do SakuraMail',
        'nunca expõe senhas, tokens ou dados íntimos de ninguém',
        'o código do Core é a autoridade final sobre ações e permissões',
      ],
    };

    // 3. Build Explicit Section 2: Localização Atual
    const structuredLocation: CurrentLocationContext = {
      guild: {
        id: CHERRY_PLACE_SERVER.id,
        name: CHERRY_PLACE_SERVER.name,
      },
      category: {
        id: categoryObj?.id,
        name: location.category,
        decoratedName: categoryObj?.decoratedName || location.category,
      },
      channel: {
        id: channel.id,
        name: canonicalChannel?.name || channel.name,
        decoratedName: canonicalChannel?.decoratedName || channel.name,
        type: location.channelType,
      },
      purpose: location.purpose,
      thematicContext: location.thematicContext,
      foxtyPolicy: location.foxtyPresenceLevel,
      presenceLevel: location.foxtyPresenceLevel,
      limitations: location.limitations,
      specialRules: location.specialRules,
      isProtected: location.isProtected,
    };

    // 4. Build Multi-tier Message History
    // A. Immediate Window (10-20 messages)
    const immediateMessages =
      recentMessages && recentMessages.length > 0
        ? recentMessages.slice(-this.immediateHistoryLimit)
        : historyManager
        ? historyManager.getImmediateWindow(channel.id, this.immediateHistoryLimit)
        : [];

    const content = currentMessage?.content || '';
    const otherMentions: string[] = [];
    const mentionMatches = content.match(/<@!?(\d+)>|@(\w+)/g);
    if (mentionMatches) {
      mentionMatches.forEach((m) => {
        if (!m.toLowerCase().includes('foxty')) {
          otherMentions.push(m);
        }
      });
    }

    const eventContext: CurrentEventContext = {
      eventType: isDirectMention
        ? 'direct_mention'
        : event
        ? 'scheduled_tick'
        : 'chat_message',
      messageId: currentMessage?.id || `msg-${Date.now()}`,
      author: {
        name: currentMessage?.author || 'system',
        isBot: currentMessage?.isBot ?? false,
      },
      content,
      timestamp: currentMessage?.timestamp || new Date().toISOString(),
      replyToMessageId: currentMessage?.replyToMessageId,
      repliedMessage: repliedMessage || currentMessage?.repliedMessage || null,
      mentions: {
        directMentionOfFoxty: isDirectMention,
        otherMentions,
      },
      immediateConversationWindow: immediateMessages,
      recentConversationWindow: immediateMessages.map((m) => ({
        id: m.id,
        author: m.author,
        content: m.content,
        timestamp: m.timestamp,
        replyToMessageId: m.replyToMessageId,
      })),
    };

    // 5. Build Explicit Section 4: Memória e Estado
    const participantsSet = new Set<string>();
    immediateMessages.forEach((m) => participantsSet.add(m.author));
    if (currentMessage) {
      participantsSet.add(currentMessage.author);
    }

    // Infer speaker identity (Kris / Riely / Other) for contextual boosting
    let targetUser: 'Kris' | 'Riely' | 'Other' | undefined;
    if (currentMessage?.author) {
      const authorLower = currentMessage.author.toLowerCase();
      if (authorLower.includes('kris') || authorLower.includes('onlykris')) targetUser = 'Kris';
      else if (authorLower.includes('riely') || authorLower.includes('kazelyx')) targetUser = 'Riely';
    }

    const isCorrespondenceArea = location.isProtected || location.category.toLowerCase().includes('correspond');

    // Advanced contextual memory retrieval via RetrievalCoordinator
    const scoredMemories = await this.retrievalCoordinator.retrieve({
      currentMessage: {
        content: currentMessage?.content || '',
        author: currentMessage?.author || '',
        channelId: channel.id,
      },
      recentHistory: immediateMessages,
      targetUser,
      limit: this.memoryLimit,
      safeForTeasingRequired: !isCorrespondenceArea,
    });

    const relevantMemories = scoredMemories.map((sm) => sm.memory);

    const memoryAndState: MemoryAndStateContext = {
      relevantMemories: scoredMemories.map((sm) => ({
        content: sm.memory.content,
        type: sm.memory.type,
        safeForTeasing: sm.memory.safeForTeasing,
        targetUser: sm.memory.targetUser,
      })),
      foxtyState: state,
      participants: Array.from(participantsSet),
      behavioralObservations: observations,
    };

    return {
      foxtyIdentity: {
        species: identity.species,
        color: identity.color,
        residentOf: identity.residentOf,
        nature: identity.personality,
      },
      identity,
      channel: enrichedChannel,
      location,
      currentLocation: structuredLocation,
      event: eventContext,
      memoryAndState,
      participants: Array.from(participantsSet),
      recentMessages: immediateMessages,
      relevantMemories,
      behavioralObservations: observations,
      foxtyState: state,
      currentEvent: event || null,
      availableTools,
    };
  }
}
