import { z } from 'zod';
import { ActionRequest, ChannelInfo } from '../types.js';
import { isChannelBlocked, isSakuraMailChannel } from '../config/index.js';

export const SendMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  content: z.string().min(1, 'content cannot be empty').max(2000, 'Discord message limit is 2000 chars'),
});

export const SendMultipleMessagesArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  messages: z.array(z.string().min(1).max(2000)).min(1).max(4, 'Burst message limit is 4 messages'),
});

export const ReactArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  message_id: z.string().min(1, 'message_id is required'),
  emoji: z.string().min(1, 'emoji is required').max(32),
});

export const SearchMemoryArgsSchema = z.object({
  query: z.string().min(1, 'query is required'),
  safe_for_teasing_only: z.boolean().default(true),
  category: z.enum(['episodic', 'behavioral', 'server', 'project', 'temporary']).optional(),
});

export const SaveMemoryArgsSchema = z.object({
  content: z.string().min(3, 'content is required'),
  type: z.enum(['episodic', 'behavioral', 'server', 'project', 'temporary']).default('episodic'),
  importance: z.number().min(0).max(1).default(0.7),
  safe_for_teasing: z.boolean().default(false),
  target_user: z.enum(['Kris', 'Riely', 'Other']).optional(),
});

export const GetChannelInfoArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
});

export const GetServerInfoArgsSchema = z.object({}).optional();

export const TriggerEventArgsSchema = z.object({
  event_id: z.string().min(1, 'event_id is required'),
  channel_id: z.string().min(1, 'channel_id is required'),
});

export interface ToolValidationResult {
  valid: boolean;
  error?: string;
  sanitizedArgs?: Record<string, any>;
}

export class ToolRegistry {
  private availableToolNames = [
    'send_message',
    'send_multiple_messages',
    'react',
    'search_memory',
    'save_memory',
    'get_channel_info',
    'get_server_info',
    'trigger_event',
  ];

  public getAvailableTools(): string[] {
    return [...this.availableToolNames];
  }

  public validate(action: ActionRequest, channel: ChannelInfo): ToolValidationResult {
    // 1. Tool name check
    if (!this.availableToolNames.includes(action.tool)) {
      return { valid: false, error: `Unauthorized or unknown tool: ${action.tool}` };
    }

    // 2. Channel policy validation:
    // "Uso Bloqueado = Foxty NÃO pode interagir com este canal. Foxty pode possuir acesso técnico para leitura, MAS não pode produzir nenhuma ação naquele canal. Nem reagir, nem nada."
    const isInteractiveAction = ['send_message', 'send_multiple_messages', 'react'].includes(action.tool);
    if (isInteractiveAction) {
      if (isChannelBlocked(channel.id) || channel.foxtyPolicy === 'Uso Bloqueado') {
        if (isSakuraMailChannel(channel.id)) {
          return {
            valid: false,
            error: `Policy violation: Foxty is forbidden from automated message emission in SakuraMail mailbox channel`,
          };
        }
        return {
          valid: false,
          error: `Policy violation: Channel '${channel.name}' has 'Uso Bloqueado'. Foxty is forbidden from interacting or reacting in this channel`,
        };
      }
    }

    const rawArgs: Record<string, any> = action.arguments && typeof action.arguments === 'object' ? action.arguments : {};

    // 3. Schema & Arguments validation via Zod with normalized inputs
    if (action.tool === 'send_message') {
      const normalized = {
        channel_id: rawArgs.channel_id !== undefined ? rawArgs.channel_id : (rawArgs.channelId !== undefined ? rawArgs.channelId : channel.id),
        content: rawArgs.content !== undefined ? rawArgs.content : (rawArgs.message !== undefined ? rawArgs.message : (rawArgs.text !== undefined ? rawArgs.text : '')),
      };

      const parsed = SendMessageArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'send_multiple_messages') {
      let messagesArr: any[] = [];
      if (Array.isArray(rawArgs.messages)) {
        messagesArr = rawArgs.messages;
      } else if (typeof rawArgs.message === 'string') {
        messagesArr = [rawArgs.message];
      } else if (typeof rawArgs.content === 'string') {
        messagesArr = [rawArgs.content];
      }

      const normalized = {
        channel_id: rawArgs.channel_id !== undefined ? rawArgs.channel_id : (rawArgs.channelId !== undefined ? rawArgs.channelId : channel.id),
        messages: messagesArr,
      };

      const parsed = SendMultipleMessagesArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'react') {
      const normalized = {
        channel_id: rawArgs.channel_id !== undefined ? rawArgs.channel_id : (rawArgs.channelId !== undefined ? rawArgs.channelId : channel.id),
        message_id: rawArgs.message_id !== undefined ? rawArgs.message_id : (rawArgs.messageId !== undefined ? rawArgs.messageId : ''),
        emoji: rawArgs.emoji !== undefined ? rawArgs.emoji : (rawArgs.reaction !== undefined ? rawArgs.reaction : ''),
      };

      const parsed = ReactArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'search_memory') {
      const normalized = {
        query: rawArgs.query !== undefined ? rawArgs.query : (rawArgs.q !== undefined ? rawArgs.q : (rawArgs.search !== undefined ? rawArgs.search : '')),
        safe_for_teasing_only: rawArgs.safe_for_teasing_only !== undefined ? rawArgs.safe_for_teasing_only : (rawArgs.safeForTeasingOnly !== undefined ? rawArgs.safeForTeasingOnly : true),
        category: rawArgs.category || rawArgs.type,
      };

      const parsed = SearchMemoryArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'save_memory') {
      const normalized = {
        content: rawArgs.content !== undefined ? rawArgs.content : (rawArgs.memory !== undefined ? rawArgs.memory : (rawArgs.text !== undefined ? rawArgs.text : '')),
        type: rawArgs.type || 'episodic',
        importance: typeof rawArgs.importance === 'number' ? rawArgs.importance : 0.7,
        safe_for_teasing: rawArgs.safe_for_teasing !== undefined ? rawArgs.safe_for_teasing : (rawArgs.safeForTeasing !== undefined ? rawArgs.safeForTeasing : false),
        target_user: rawArgs.target_user || rawArgs.targetUser,
      };

      const parsed = SaveMemoryArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      // Privacy boundary check (Doc 06 Sec 2C):
      // Non-operational sensitive information must never be flagged safe for teasing
      const lower = parsed.data.content.toLowerCase();
      const sensitiveKeywords = ['senha', 'password', 'token', 'secret', 'credencial', 'intimate', 'sexual', 'privad'];
      if (sensitiveKeywords.some((kw) => lower.includes(kw)) && parsed.data.safe_for_teasing) {
        return {
          valid: false,
          error: `Privacy violation: Sensitive or restricted data cannot be marked safe_for_teasing`,
        };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'get_channel_info') {
      const normalized = {
        channel_id: rawArgs.channel_id !== undefined ? rawArgs.channel_id : (rawArgs.channelId !== undefined ? rawArgs.channelId : channel.id),
      };

      const parsed = GetChannelInfoArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'get_server_info') {
      return { valid: true, sanitizedArgs: {} };
    }

    if (action.tool === 'trigger_event') {
      const normalized = {
        event_id: rawArgs.event_id !== undefined ? rawArgs.event_id : (rawArgs.eventId !== undefined ? rawArgs.eventId : ''),
        channel_id: rawArgs.channel_id !== undefined ? rawArgs.channel_id : (rawArgs.channelId !== undefined ? rawArgs.channelId : channel.id),
      };

      const parsed = TriggerEventArgsSchema.safeParse(normalized);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    return { valid: false, error: 'Unhandled tool validation' };
  }
}

