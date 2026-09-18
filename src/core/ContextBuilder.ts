import {
  BehavioralObservation,
  ChannelInfo,
  ChatMessage,
  ContextPackage,
  FoxtyEvent,
  FoxtyState,
  MemoryItem,
} from '../types.js';
import { IMemoryStore } from '../memory/MemoryStore.js';

export class ContextBuilder {
  constructor(private memoryStore: IMemoryStore) {}

  public async buildContext(params: {
    channel: ChannelInfo;
    currentMessage?: ChatMessage;
    recentMessages: ChatMessage[];
    observations: BehavioralObservation[];
    state: FoxtyState;
    event?: FoxtyEvent | null;
    availableTools: string[];
  }): Promise<ContextPackage> {
    const { channel, currentMessage, recentMessages, observations, state, event, availableTools } = params;

    // Collect all participants in recent window
    const participantsSet = new Set<string>();
    recentMessages.forEach((m) => participantsSet.add(m.author));
    if (currentMessage) {
      participantsSet.add(currentMessage.author);
    }

    // Retrieve relevant memories based on message content and channel
    const query = currentMessage ? currentMessage.content : channel.name;
    const relevantMemories = await this.memoryStore.search(query, {
      safeForTeasingOnly: !channel.isProtected,
      limit: 4,
    });

    return {
      foxtyIdentity: {
        species: 'Purple anthropomorphic fox',
        color: '#8A2BE2 (Deep Purple)',
        residentOf: 'Cherry Place',
        nature: [
          'observant',
          'astute',
          'economical with words',
          'clever and playful',
          'never directly executes unauthorized discord actions',
        ],
      },
      channel,
      participants: Array.from(participantsSet),
      recentMessages: recentMessages.slice(-6), // economical window: max 6 recent messages
      relevantMemories,
      behavioralObservations: observations,
      foxtyState: state,
      currentEvent: event || null,
      availableTools,
    };
  }
}
