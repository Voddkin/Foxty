import { z } from 'zod';
import { ActionRequest, ChannelInfo } from '../types.js';

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

    // 2. Channel policy validation (Crucial security barrier: never speak in restricted channels without explicit permission)
    if (channel.isProtected && (action.tool === 'send_message' || action.tool === 'send_multiple_messages')) {
      if (channel.id === 'ch-sakura-mail') {
        return {
          valid: false,
          error: `Policy violation: Foxty is forbidden from automated message emission in SakuraMail mailbox channel`,
        };
      }
    }

    // 3. Schema & Arguments validation via Zod
    if (action.tool === 'send_message') {
      const parsed = SendMessageArgsSchema.safeParse(action.arguments);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'send_multiple_messages') {
      const parsed = SendMultipleMessagesArgsSchema.safeParse(action.arguments);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'react') {
      const parsed = ReactArgsSchema.safeParse(action.arguments);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'search_memory') {
      const parsed = SearchMemoryArgsSchema.safeParse(action.arguments);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'save_memory') {
      const parsed = SaveMemoryArgsSchema.safeParse(action.arguments);
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
      const parsed = GetChannelInfoArgsSchema.safeParse(action.arguments);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    if (action.tool === 'get_server_info') {
      return { valid: true, sanitizedArgs: {} };
    }

    if (action.tool === 'trigger_event') {
      const parsed = TriggerEventArgsSchema.safeParse(action.arguments);
      if (!parsed.success) {
        return { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
      }
      return { valid: true, sanitizedArgs: parsed.data };
    }

    return { valid: false, error: 'Unhandled tool validation' };
  }
}

