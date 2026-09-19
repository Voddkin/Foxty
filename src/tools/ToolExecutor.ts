import { ActionRequest, ChannelInfo } from '../types.js';
import { ToolRegistry } from './ToolRegistry.js';
import { logger } from '../core/Logger.js';
import { IMemoryStore } from '../memory/MemoryStore.js';
import { EventEngine } from '../events/EventEngine.js';

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
  getServerSnapshot?(guildId?: string): Promise<any>;
}

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private discordHandler?: DiscordActionHandler,
    private memoryStore?: IMemoryStore,
    private eventEngine?: EventEngine,
    private channelsProvider?: () => readonly ChannelInfo[] | ChannelInfo[]
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

    // 2. Execute via handler, internal subsystem, or simulation
    try {
      if (action.tool === 'send_message') {
        const { channel_id, content } = validation.sanitizedArgs as { channel_id: string; content: string };
        let result: any;
        if (this.discordHandler) {
          result = await this.discordHandler.sendMessage(channel_id, content);
        } else {
          result = { id: `sim-${Date.now()}`, channel_id, content, simulated: true };
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

      if (action.tool === 'send_multiple_messages') {
        const { channel_id, messages } = validation.sanitizedArgs as { channel_id: string; messages: string[] };
        let result: any;
        if (this.discordHandler && this.discordHandler.sendMultipleMessages) {
          result = await this.discordHandler.sendMultipleMessages(channel_id, messages);
        } else if (this.discordHandler) {
          const ids: string[] = [];
          for (const msg of messages) {
            const res = await this.discordHandler.sendMessage(channel_id, msg);
            ids.push(res.id);
          }
          result = { count: messages.length, ids, simulated: false };
        } else {
          result = {
            count: messages.length,
            ids: messages.map((_, i) => `sim-burst-${Date.now()}-${i}`),
            simulated: true,
          };
        }

        logger.log({
          event: `Tool Executed: send_multiple_messages`,
          channelId: channel_id,
          actionType: 'TOOL_EXECUTION',
          decision: 'EXECUTED',
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          details: `Burst sent ${messages.length} messages`,
        });

        return { tool: 'send_multiple_messages', success: true, result };
      }

      if (action.tool === 'react') {
        const { channel_id, message_id, emoji } = validation.sanitizedArgs as {
          channel_id: string;
          message_id: string;
          emoji: string;
        };
        let result: any;
        if (this.discordHandler) {
          result = await this.discordHandler.react(channel_id, message_id, emoji);
        } else {
          result = { success: true, simulated: true, emoji };
        }

        logger.log({
          event: `Tool Executed: react`,
          channelId: channel_id,
          actionType: 'TOOL_EXECUTION',
          decision: 'EXECUTED',
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          details: `Reacted with ${emoji} on message ${message_id}`,
        });

        return { tool: 'react', success: true, result };
      }

      if (action.tool === 'search_memory') {
        const { query, safe_for_teasing_only, category } = validation.sanitizedArgs as {
          query: string;
          safe_for_teasing_only: boolean;
          category?: any;
        };
        let memories: any[] = [];
        if (this.memoryStore) {
          memories = await this.memoryStore.search(query, {
            type: category,
            safeForTeasingOnly: safe_for_teasing_only,
          });
        }
        return { tool: 'search_memory', success: true, result: memories };
      }

      if (action.tool === 'save_memory') {
        const args = validation.sanitizedArgs as {
          content: string;
          type: any;
          importance: number;
          safe_for_teasing: boolean;
          target_user?: any;
        };
        let savedItem: any;
        if (this.memoryStore) {
          savedItem = await this.memoryStore.save({
            content: args.content,
            type: args.type,
            importance: args.importance,
            confidence: 0.90,
            source: 'foxty_tool_call',
            safeForTeasing: args.safe_for_teasing,
            targetUser: args.target_user,
            retention: 'permanent',
            tags: ['agent-saved'],
          });
        }
        return { tool: 'save_memory', success: true, result: savedItem };
      }

      if (action.tool === 'get_channel_info') {
        const { channel_id } = validation.sanitizedArgs as { channel_id: string };
        const channels = this.channelsProvider ? this.channelsProvider() : [channel];
        const found = channels.find((c) => c.id === channel_id);
        return { tool: 'get_channel_info', success: !!found, result: found };
      }

      if (action.tool === 'get_server_info') {
        const channels = this.channelsProvider ? this.channelsProvider() : [channel];
        return {
          tool: 'get_server_info',
          success: true,
          result: {
            serverName: 'Cherry Place',
            channelCount: channels.length,
            categories: Array.from(new Set(channels.map((c) => c.category))),
          },
        };
      }

      if (action.tool === 'trigger_event') {
        const { event_id, channel_id } = validation.sanitizedArgs as { event_id: string; channel_id: string };
        const channels = this.channelsProvider ? this.channelsProvider() : [channel];
        const targetChannel = channels.find((c) => c.id === channel_id) || channel;
        if (this.eventEngine) {
          const outcome = this.eventEngine.triggerTestEvent(event_id, targetChannel);
          return { tool: 'trigger_event', success: outcome.triggered, result: outcome };
        }
        return { tool: 'trigger_event', success: false, error: 'Event engine not connected' };
      }

      return { tool: action.tool, success: false, error: 'Unhandled tool execution' };
    } catch (err: any) {
      logger.log({
        event: `Tool Execution Error: ${action.tool}`,
        channelId: channel.id,
        actionType: 'TOOL_EXECUTION',
        decision: 'FAILED',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      });

      return { tool: action.tool, success: false, error: err.message };
    }
  }
}

