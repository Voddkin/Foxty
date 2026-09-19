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
import {
  getSemanticLocationContext,
  getChannelById,
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_CATEGORIES,
} from '../config/cherryPlaceModel.js';

export interface ContextBuilderOptions {
  recentHistoryLimit?: number;
  memoryLimit?: number;
}

export class ContextBuilder {
  private recentHistoryLimit: number;
  private memoryLimit: number;

  constructor(
    private memoryStore: IMemoryStore,
    options: ContextBuilderOptions = {}
  ) {
    this.recentHistoryLimit = options.recentHistoryLimit ?? 6;
    this.memoryLimit = options.memoryLimit ?? 4;
  }

  public setRecentHistoryLimit(limit: number): void {
    this.recentHistoryLimit = Math.max(1, limit);
  }

  public setMemoryLimit(limit: number): void {
    this.memoryLimit = Math.max(0, limit);
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
    repliedMessage?: { author: string; content: string } | null;
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

    // 4. Build Explicit Section 3: Evento Atual
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

    const conversationWindow = recentMessages
      .slice(-this.recentHistoryLimit)
      .map((m) => ({
        author: m.author,
        content: m.content,
        timestamp: m.timestamp,
      }));

    const eventContext: CurrentEventContext = {
      eventType: isDirectMention
        ? 'direct_mention'
        : event
        ? 'scheduled_tick'
        : 'chat_message',
      author: {
        name: currentMessage?.author || 'system',
        isBot: currentMessage?.isBot ?? false,
      },
      content,
      repliedMessage,
      mentions: {
        directMentionOfFoxty: isDirectMention,
        otherMentions,
      },
      recentConversationWindow: conversationWindow,
    };

    // 5. Build Explicit Section 4: Memória e Estado
    const participantsSet = new Set<string>();
    recentMessages.forEach((m) => participantsSet.add(m.author));
    if (currentMessage) {
      participantsSet.add(currentMessage.author);
    }

    // Retrieve relevant memories adhering strictly to privacy (no private SakuraMail data)
    const query = currentMessage ? currentMessage.content : channel.name;
    const isCorrespondenceArea = location.isProtected || location.category.toLowerCase().includes('correspond');
    const relevantMemories = await this.memoryStore.search(query, {
      safeForTeasingOnly: !isCorrespondenceArea,
      limit: this.memoryLimit,
    });

    const memoryAndState: MemoryAndStateContext = {
      relevantMemories: relevantMemories.map((m) => ({
        content: m.content,
        type: m.type,
        safeForTeasing: m.safeForTeasing,
        targetUser: m.targetUser,
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
      recentMessages: recentMessages.slice(-this.recentHistoryLimit),
      relevantMemories,
      behavioralObservations: observations,
      foxtyState: state,
      currentEvent: event || null,
      availableTools,
    };
  }
}


