import { ActionRequest, ChannelInfo, ChatMessage } from '../types.js';
import { ToolRegistry } from './ToolRegistry.js';
import { logger } from '../core/Logger.js';
import { IMemoryStore } from '../memory/MemoryStore.js';
import { EventEngine } from '../events/EventEngine.js';
import { HistoryManager } from '../core/HistoryManager.js';
import { CHERRY_PLACE_SERVER, CHERRY_PLACE_CATEGORIES, CHERRY_PLACE_CHANNELS } from '../config/cherryPlaceModel.js';

export interface ToolExecutionResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface DiscordActionHandler {
  sendMessage(channelId: string, content: string): Promise<{ id: string; content: string }>;
  react(channelId: string, messageId: string, emoji: string): Promise<{ success: boolean }>;
  sendMultipleMessages?(channelId: string, messages: string[]): Promise<{ count: number; ids: string[] }>;
  replyToMessage?(channelId: string, messageId: string, content: string): Promise<{ id: string; replyToId?: string; replyToMessageId?: string; content: string }>;
  getMessage?(channelId: string, messageId: string): Promise<ChatMessage | null>;
  getRecentMessages?(channelId: string, limit?: number): Promise<ChatMessage[]>;
  searchMessages?(channelId: string, query: string, author?: string, limit?: number): Promise<ChatMessage[]>;
  editMessage?(channelId: string, messageId: string, content: string): Promise<{ success: boolean; id: string }>;
  deleteMessage?(channelId: string, messageId: string): Promise<{ success: boolean }>;
  sendFile?(channelId: string, filePathOrUrl: string, comment?: string): Promise<{ success: boolean; file?: string; filePath?: string; id: string }>;
  getServerSnapshot?(guildId?: string): Promise<any>;
}

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private discordHandler?: DiscordActionHandler,
    private memoryStore?: IMemoryStore,
    private eventEngine?: EventEngine,
    private channelsProvider?: () => readonly ChannelInfo[] | ChannelInfo[],
    private historyManager?: HistoryManager
  ) {}

  public setDiscordHandler(handler: DiscordActionHandler): void {
    this.discordHandler = handler;
  }

  public setMemoryStore(store: IMemoryStore): void {
    this.memoryStore = store;
  }

  public setEventEngine(engine: EventEngine): void {
    this.eventEngine = engine;
  }

  public setChannelsProvider(provider: () => readonly ChannelInfo[] | ChannelInfo[]): void {
    this.channelsProvider = provider;
  }

  public setHistoryManager(manager: HistoryManager): void {
    this.historyManager = manager;
  }

  public async execute(action: ActionRequest, channel: ChannelInfo): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    // 1. Validate against Registry (Schemas, channel policy, bounds)
    const validation = this.registry.validate(action, channel);
    if (!validation.valid) {
      logger.log({
        event: `Tool Validation Failed: ${action.tool}`,
        channelId: channel.id,
        actionType: 'TOOL_VALIDATION',
        decision: 'DENIED',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: validation.error,
      });

      return {
        tool: action.tool,
        success: false,
        error: validation.error,
      };
    }

    const args = validation.sanitizedArgs || {};

    // 2. Execute via handler, internal subsystem, or simulation
    try {
      if (action.tool === 'send_message') {
        const { channel_id, content } = args as { channel_id: string; content: string };
        let result: any;
        if (this.discordHandler) {
          result = await this.discordHandler.sendMessage(channel_id, content);
        } else {
          result = { id: `sim-${Date.now()}`, channel_id, content, simulated: true };
        }

        if (this.historyManager) {
          this.historyManager.addMessage({
            id: result.id || `sim-bot-${Date.now()}`,
            author: 'Foxty',
            channelId: channel_id,
            content,
            timestamp: new Date().toISOString(),
            isBot: true,
          });
        }

        logger.log({
          event: `Tool Executed: send_message`,
          channelId: channel_id,
          actionType: 'TOOL_EXECUTION',
          decision: 'EXECUTED',
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          details: `Sent message (${content.length} chars)`,
        });

        return { tool: 'send_message', success: true, result };
      }

      if (action.tool === 'reply_to_message') {
        const { channel_id, message_id, content } = args as { channel_id: string; message_id: string; content: string };
        let result: any;
        if (this.discordHandler && this.discordHandler.replyToMessage) {
          result = await this.discordHandler.replyToMessage(channel_id, message_id, content);
        } else if (this.discordHandler) {
          result = await this.discordHandler.sendMessage(channel_id, content);
          result.replyToMessageId = message_id;
        } else {
          result = {
            id: `sim-reply-${Date.now()}`,
            replyToId: message_id,
            replyToMessageId: message_id,
            channel_id,
            content,
            simulated: true,
          };
        }
        if (!result.replyToMessageId) {
          result.replyToMessageId = message_id;
        }

        if (this.historyManager) {
          this.historyManager.addMessage({
            id: result.id || `sim-reply-${Date.now()}`,
            author: 'Foxty',
            channelId: channel_id,
            content,
            timestamp: new Date().toISOString(),
            isBot: true,
            replyToMessageId: message_id,
          });
        }

        logger.log({
          event: `Tool Executed: reply_to_message`,
          channelId: channel_id,
          actionType: 'TOOL_EXECUTION',
          decision: 'EXECUTED',
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          details: `Replied to ${message_id}: "${content.substring(0, 30)}..."`,
        });

        return { tool: 'reply_to_message', success: true, result };
      }

      if (action.tool === 'react_to_message' || action.tool === 'react') {
        const { channel_id, message_id, emoji } = args as { channel_id: string; message_id: string; emoji: string };
        let result: any;
        if (this.discordHandler) {
          result = await this.discordHandler.react(channel_id, message_id, emoji);
        } else {
          result = { success: true, channel_id, message_id, emoji, simulated: true };
        }

        logger.log({
          event: `Tool Executed: react_to_message`,
          channelId: channel_id,
          actionType: 'TOOL_EXECUTION',
          decision: 'EXECUTED',
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          details: `Reacted with ${emoji} on message ${message_id}`,
        });

        return { tool: 'react_to_message', success: true, result };
      }

      if (action.tool === 'get_message') {
        const { channel_id, message_id } = args as { channel_id: string; message_id: string };
        let message: any = null;

        if (this.discordHandler && this.discordHandler.getMessage) {
          message = await this.discordHandler.getMessage(channel_id, message_id);
        }

        if (!message && this.historyManager) {
          message = this.historyManager.getMessageById(channel_id, message_id);
        }

        if (!message) {
          return { tool: 'get_message', success: false, error: `Message with ID ${message_id} not found in channel ${channel_id}` };
        }

        return { tool: 'get_message', success: true, result: message };
      }

      if (action.tool === 'search_messages') {
        const { channel_id, query, author, limit = 10 } = args as { channel_id?: string; query: string; author?: string; limit: number };
        let messages: ChatMessage[] = [];

        if (this.discordHandler && this.discordHandler.searchMessages && channel_id) {
          messages = await this.discordHandler.searchMessages(channel_id, query, author, limit);
        }

        if (messages.length === 0 && this.historyManager) {
          messages = this.historyManager.searchMessages(query, {
            channelId: channel_id,
            author,
            limit,
          });
        }

        return { tool: 'search_messages', success: true, result: { count: messages.length, messages } };
      }

      if (action.tool === 'get_recent_messages') {
        const { channel_id, limit = 20 } = args as { channel_id: string; limit: number };
        let messages: ChatMessage[] = [];

        if (this.discordHandler && this.discordHandler.getRecentMessages) {
          messages = await this.discordHandler.getRecentMessages(channel_id, limit);
        }

        if (messages.length === 0 && this.historyManager) {
          messages = this.historyManager.getImmediateWindow(channel_id, limit);
        }

        return { tool: 'get_recent_messages', success: true, result: { count: messages.length, messages } };
      }

      if (action.tool === 'send_multiple_messages') {
        const { channel_id, messages } = args as { channel_id: string; messages: string[] };
        let result: any;
        if (this.discordHandler && this.discordHandler.sendMultipleMessages) {
          result = await this.discordHandler.sendMultipleMessages(channel_id, messages);
        } else if (this.discordHandler) {
          const ids: string[] = [];
          for (const msg of messages) {
            const sent = await this.discordHandler.sendMessage(channel_id, msg);
            ids.push(sent.id);
          }
          result = { count: messages.length, ids };
        } else {
          result = { count: messages.length, ids: messages.map((_, i) => `sim-burst-${Date.now()}-${i}`), simulated: true };
        }

        if (this.historyManager) {
          for (const msg of messages) {
            this.historyManager.addMessage({
              id: `sim-burst-${Date.now()}`,
              author: 'Foxty',
              channelId: channel_id,
              content: msg,
              timestamp: new Date().toISOString(),
              isBot: true,
            });
          }
        }

        return { tool: 'send_multiple_messages', success: true, result };
      }

      if (action.tool === 'edit_message') {
        const { channel_id, message_id, content } = args as { channel_id: string; message_id: string; content: string };
        let result: any;
        if (this.discordHandler && this.discordHandler.editMessage) {
          result = await this.discordHandler.editMessage(channel_id, message_id, content);
        } else {
          result = { success: true, id: message_id, content, simulated: true };
        }
        return { tool: 'edit_message', success: true, result };
      }

      if (action.tool === 'delete_message') {
        const { channel_id, message_id } = args as { channel_id: string; message_id: string };
        let result: any;
        if (this.discordHandler && this.discordHandler.deleteMessage) {
          result = await this.discordHandler.deleteMessage(channel_id, message_id);
        } else {
          result = { success: true, id: message_id, simulated: true };
        }
        return { tool: 'delete_message', success: true, result };
      }

      if (action.tool === 'send_file') {
        const { channel_id, file_path_or_url, comment } = args as { channel_id: string; file_path_or_url: string; comment?: string };
        let result: any;
        if (this.discordHandler && this.discordHandler.sendFile) {
          result = await this.discordHandler.sendFile(channel_id, file_path_or_url, comment);
        } else {
          result = { success: true, id: `sim-file-${Date.now()}`, file: file_path_or_url, comment, simulated: true };
        }
        return { tool: 'send_file', success: true, result };
      }

      if (action.tool === 'search_memory') {
        const { query, safe_for_teasing_only, category } = args as {
          query: string;
          safe_for_teasing_only?: boolean;
          category?: any;
        };

        if (!this.memoryStore) {
          return { tool: 'search_memory', success: false, error: 'Memory store not configured' };
        }

        const results = await this.memoryStore.search(query, {
          safeForTeasingOnly: safe_for_teasing_only ?? true,
          type: category,
          limit: 10,
        });

        return {
          tool: 'search_memory',
          success: true,
          result: { count: results.length, memories: results },
        };
      }

      if (action.tool === 'save_memory') {
        const { content, type, importance, safe_for_teasing, target_user } = args as {
          content: string;
          type: any;
          importance: number;
          safe_for_teasing: boolean;
          target_user?: any;
        };

        if (!this.memoryStore) {
          return { tool: 'save_memory', success: false, error: 'Memory store not configured' };
        }

        const saved = await this.memoryStore.save({
          content,
          type: type || 'episodic',
          importance: importance ?? 0.7,
          safeForTeasing: safe_for_teasing ?? false,
          targetUser: target_user,
          tags: ['tool_saved'],
          source: 'core_tool',
          metadata: { channelId: channel.id },
        });

        return { tool: 'save_memory', success: true, result: saved };
      }

      if (action.tool === 'get_channel_info') {
        const { channel_id } = args as { channel_id: string };
        const allChannels = this.channelsProvider ? this.channelsProvider() : [];
        const ch = (allChannels as ChannelInfo[]).find((c) => c.id === channel_id);

        if (!ch) {
          return { tool: 'get_channel_info', success: false, error: `Channel ${channel_id} not found in Cherry Place server map` };
        }

        return {
          tool: 'get_channel_info',
          success: true,
          result: {
            id: ch.id,
            name: ch.name,
            decoratedName: ch.decoratedName,
            category: ch.category,
            type: ch.type,
            purpose: ch.purpose,
            foxtyPolicy: ch.foxtyPolicy,
            presenceLevel: ch.foxtyPolicy || (ch as any).presenceLevel,
            limitations: ch.limitations,
            specialRules: ch.specialRules,
          },
        };
      }

      if (action.tool === 'get_server_info') {
        return {
          tool: 'get_server_info',
          success: true,
          result: {
            name: CHERRY_PLACE_SERVER.name,
            decoratedName: CHERRY_PLACE_SERVER.decoratedName,
            categoriesCount: CHERRY_PLACE_CATEGORIES.length,
            channelsCount: CHERRY_PLACE_CHANNELS.length,
            categories: CHERRY_PLACE_CATEGORIES.map((cat) => ({
              id: cat.id,
              name: cat.name,
              decoratedName: cat.decoratedName,
              channelsCount: CHERRY_PLACE_CHANNELS.filter((c) => c.categoryId === cat.id).length,
            })),
          },
        };
      }

      if (action.tool === 'trigger_event') {
        const { event_id, channel_id } = args as { event_id: string; channel_id: string };
        if (!this.eventEngine) {
          return { tool: 'trigger_event', success: false, error: 'Event engine not configured' };
        }

        const triggered = this.eventEngine.triggerEvent(event_id, channel_id);
        return {
          tool: 'trigger_event',
          success: triggered !== null,
          result: triggered ? { eventId: triggered.id, name: triggered.name } : null,
          error: triggered ? undefined : `Event ${event_id} not found or could not trigger`,
        };
      }

      return { tool: action.tool, success: false, error: 'Unhandled tool execution' };
    } catch (err: any) {
      logger.log({
        event: `Tool Execution Error: ${action.tool}`,
        channelId: channel.id,
        actionType: 'TOOL_EXECUTION',
        decision: 'ERROR',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      });

      return {
        tool: action.tool,
        success: false,
        error: `Tool execution failed: ${err.message}`,
      };
    }
  }
}
