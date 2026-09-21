import { ChatMessage } from '../types.js';
import { isSakuraMailChannel, isChannelBlocked } from '../config/index.js';

export interface HistorySearchOptions {
  channelId?: string;
  author?: string;
  limit?: number;
  allowedChannelIds?: string[];
  includeSakuraMail?: boolean;
}

export class HistoryManager {
  private channelHistories: Map<string, ChatMessage[]> = new Map();
  private maxHistoryPerChannel: number;

  constructor(maxHistoryPerChannel = 200) {
    this.maxHistoryPerChannel = maxHistoryPerChannel;
  }

  /**
   * Adds a message to the channel history, preserving message IDs, references, and timestamps.
   */
  public addMessage(message: ChatMessage): void {
    if (!message || !message.channelId || !message.id) return;

    const history = this.channelHistories.get(message.channelId) || [];

    // Avoid duplicate message IDs
    const existingIndex = history.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      history[existingIndex] = message;
    } else {
      history.push(message);
    }

    if (history.length > this.maxHistoryPerChannel) {
      history.shift();
    }

    this.channelHistories.set(message.channelId, history);
  }

  /**
   * Retrieves the immediate conversation window (typically 10-20 messages).
   */
  public getImmediateWindow(channelId: string, limit = 15): ChatMessage[] {
    const history = this.channelHistories.get(channelId) || [];
    const safeLimit = Math.max(1, Math.min(limit, 30));
    return history.slice(-safeLimit);
  }

  /**
   * Retrieves the expanded recent window (up to ~50 messages).
   */
  public getRecentWindow(channelId: string, limit = 50): ChatMessage[] {
    const history = this.channelHistories.get(channelId) || [];
    const safeLimit = Math.max(1, Math.min(limit, 100));
    return history.slice(-safeLimit);
  }

  /**
   * Retrieves a specific message by its Discord Message ID within a channel.
   */
  public getMessageById(channelId: string, messageId: string): ChatMessage | undefined {
    const history = this.channelHistories.get(channelId) || [];
    return history.find((m) => m.id === messageId);
  }

  /**
   * Alias for getMessageById
   */
  public getMessage(channelId: string, messageId: string): ChatMessage | undefined {
    return this.getMessageById(channelId, messageId);
  }

  /**
   * Searches for a message across all tracked channels by ID.
   */
  public getMessageByIdGlobal(messageId: string): { message: ChatMessage; channelId: string } | undefined {
    for (const [channelId, messages] of this.channelHistories.entries()) {
      const found = messages.find((m) => m.id === messageId);
      if (found) {
        return { message: found, channelId };
      }
    }
    return undefined;
  }

  /**
   * Searches message history with privacy and channel boundaries.
   * Supports both (query, options) and (channelId, query, options).
   * SakuraMail messages are NEVER returned in general history searches.
   */
  public searchMessages(
    channelIdOrQuery: string,
    queryOrOptions?: string | HistorySearchOptions,
    extraOptions?: HistorySearchOptions
  ): ChatMessage[] {
    let targetChannelId: string | undefined;
    let queryText = '';
    let options: HistorySearchOptions = {};

    if (typeof queryOrOptions === 'string') {
      targetChannelId = channelIdOrQuery;
      queryText = queryOrOptions;
      options = extraOptions || {};
    } else {
      queryText = channelIdOrQuery;
      options = queryOrOptions || {};
      targetChannelId = options.channelId;
    }

    const {
      author,
      limit = 10,
      allowedChannelIds,
      includeSakuraMail = false,
    } = options;

    const normalizedQuery = (queryText || '').toLowerCase().trim();
    const normalizedAuthor = (author || '').toLowerCase().trim();
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const results: ChatMessage[] = [];

    const targetChannelIds = targetChannelId
      ? [targetChannelId]
      : Array.from(this.channelHistories.keys());

    for (const chId of targetChannelIds) {
      // Privacy Guardrail: SakuraMail is isolated
      if (isSakuraMailChannel(chId) && !includeSakuraMail) {
        continue;
      }

      // Channel restriction filter
      if (allowedChannelIds && allowedChannelIds.length > 0 && !allowedChannelIds.includes(chId)) {
        continue;
      }

      const messages = this.channelHistories.get(chId) || [];
      for (const msg of messages) {
        if (author && !msg.author.toLowerCase().includes(normalizedAuthor)) {
          continue;
        }

        if (normalizedQuery && !msg.content.toLowerCase().includes(normalizedQuery)) {
          continue;
        }

        results.push(msg);
      }
    }

    // Sort by timestamp descending (most recent first) and cap
    return results
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, safeLimit);
  }

  /**
   * Clears history for one or all channels.
   */
  public clear(channelId?: string): void {
    if (channelId) {
      this.channelHistories.delete(channelId);
    } else {
      this.channelHistories.clear();
    }
  }

  public getStats(): { totalChannels: number; totalMessages: number } {
    let totalMessages = 0;
    for (const msgs of this.channelHistories.values()) {
      totalMessages += msgs.length;
    }
    return {
      totalChannels: this.channelHistories.size,
      totalMessages,
    };
  }
}
