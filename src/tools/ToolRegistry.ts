import { z } from 'zod';
import { ActionRequest, ChannelInfo } from '../types.js';
import { isChannelBlocked, isSakuraMailChannel } from '../config/index.js';

// ==========================================
// 1. Zod Schemas for all 12+ Tools
// ==========================================

export const SendMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  content: z.string().min(1, 'content cannot be empty').max(2000, 'Discord message limit is 2000 chars'),
});

export const SendMultipleMessagesArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  messages: z.array(z.string().min(1).max(2000)).min(1).max(4, 'Burst message limit is 4 messages'),
});

export const ReplyToMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  message_id: z.string().min(1, 'message_id is required'),
  content: z.string().min(1, 'content cannot be empty').max(2000, 'Discord message limit is 2000 chars'),
});

export const ReactToMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  message_id: z.string().min(1, 'message_id is required'),
  emoji: z.string().min(1, 'emoji is required').max(32),
});

export const GetMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  message_id: z.string().min(1, 'message_id is required'),
});

export const SearchMessagesArgsSchema = z.object({
  channel_id: z.string().optional(),
  query: z.string().min(1, 'query is required'),
  author: z.string().optional(),
  limit: z.number().min(1).max(25).default(10),
});

export const GetRecentMessagesArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  limit: z.number().min(1).max(50).default(20),
});

export const EditMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  message_id: z.string().min(1, 'message_id is required'),
  content: z.string().min(1, 'content cannot be empty').max(2000, 'Discord message limit is 2000 chars'),
});

export const DeleteMessageArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  message_id: z.string().min(1, 'message_id is required'),
});

export const SendFileArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
  file_path_or_url: z.string().min(1, 'file_path_or_url is required'),
  comment: z.string().max(2000).optional(),
});

export const GetChannelInfoArgsSchema = z.object({
  channel_id: z.string().min(1, 'channel_id is required'),
});

export const GetServerInfoArgsSchema = z.object({}).optional();

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

export const TriggerEventArgsSchema = z.object({
  event_id: z.string().min(1, 'event_id is required'),
  channel_id: z.string().min(1, 'channel_id is required'),
});

export interface ToolValidationResult {
  valid: boolean;
  error?: string;
  sanitizedArgs?: Record<string, any>;
}

export interface DeepSeekFunctionDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export class ToolRegistry {
  private availableToolNames = [
    'send_message',
    'send_multiple_messages',
    'reply_to_message',
    'react_to_message',
    'react', // alias for react_to_message
    'get_message',
    'search_messages',
    'get_recent_messages',
    'edit_message',
    'delete_message',
    'send_file',
    'get_channel_info',
    'get_server_info',
    'search_memory',
    'save_memory',
    'trigger_event',
  ];

  public getAvailableTools(): string[] {
    return [...this.availableToolNames];
  }

  /**
   * Generates OpenAPI / JSON schema function declarations for DeepSeek tools parameter.
   */
  public getDeepSeekTools(): DeepSeekFunctionDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'send_message',
          description: 'Sends a standard message to a Discord channel in Cherry Place.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              content: { type: 'string', description: 'Message content to send' },
            },
            required: ['channel_id', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reply_to_message',
          description: 'Replies directly to a specific Discord message (creates a Discord reply reference).',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              message_id: { type: 'string', description: 'The message ID being replied to' },
              content: { type: 'string', description: 'Reply content' },
            },
            required: ['channel_id', 'message_id', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'react_to_message',
          description: 'Adds an emoji reaction to any specified message in the channel.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              message_id: { type: 'string', description: 'The target message ID' },
              emoji: { type: 'string', description: 'Unicode emoji or custom Discord emoji name' },
            },
            required: ['channel_id', 'message_id', 'emoji'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_message',
          description: 'Fetches the full details of a specific Discord message by ID.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              message_id: { type: 'string', description: 'Discord Message ID to retrieve' },
            },
            required: ['channel_id', 'message_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_messages',
          description: 'Searches previous messages within authorized channels by query or author.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Optional specific channel ID to search' },
              query: { type: 'string', description: 'Search term or keyword' },
              author: { type: 'string', description: 'Optional filter by author name' },
              limit: { type: 'number', description: 'Max number of messages to return (1-25)' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_recent_messages',
          description: 'Fetches the recent history of messages in a given channel.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              limit: { type: 'number', description: 'Number of recent messages to return (1-50)' },
            },
            required: ['channel_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_multiple_messages',
          description: 'Sends a burst of short consecutive messages (max 4).',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              messages: { type: 'array', items: { type: 'string' }, description: 'Array of message texts' },
            },
            required: ['channel_id', 'messages'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'edit_message',
          description: 'Edits an existing message sent by Foxty.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              message_id: { type: 'string', description: 'The message ID to edit' },
              content: { type: 'string', description: 'New updated message content' },
            },
            required: ['channel_id', 'message_id', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_message',
          description: 'Deletes a message previously sent by Foxty.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              message_id: { type: 'string', description: 'The message ID to delete' },
            },
            required: ['channel_id', 'message_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_file',
          description: 'Sends an approved attachment or image file to a channel.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
              file_path_or_url: { type: 'string', description: 'Approved local file path or HTTPS URL' },
              comment: { type: 'string', description: 'Optional text comment to accompany file' },
            },
            required: ['channel_id', 'file_path_or_url'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_memory',
          description: 'Searches persistent memory store for facts, lore, and context.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search term or concept' },
              safe_for_teasing_only: { type: 'boolean', description: 'Filter only safe teasing memories' },
              category: { type: 'string', enum: ['episodic', 'behavioral', 'server', 'project', 'temporary'] },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_memory',
          description: 'Persists a valuable fact, behavioral observation or episodic note to memory store.',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Memory statement' },
              type: { type: 'string', enum: ['episodic', 'behavioral', 'server', 'project', 'temporary'] },
              importance: { type: 'number', description: 'Importance 0.0 to 1.0' },
              safe_for_teasing: { type: 'boolean', description: 'Whether safe to tease publicly' },
              target_user: { type: 'string', enum: ['Kris', 'Riely', 'Other'] },
            },
            required: ['content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_channel_info',
          description: 'Gets canonical purpose, policy, and metadata of a channel.',
          parameters: {
            type: 'object',
            properties: {
              channel_id: { type: 'string', description: 'Discord Channel ID' },
            },
            required: ['channel_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_server_info',
          description: 'Gets Cherry Place server information and structure.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ];
  }

  public validate(action: ActionRequest, channel: ChannelInfo): ToolValidationResult {
    // 1. Tool name check
    if (!this.availableToolNames.includes(action.tool)) {
      return { valid: false, error: `Unauthorized or unknown tool: ${action.tool}` };
    }

    const rawArgs: Record<string, any> = action.arguments && typeof action.arguments === 'object' ? action.arguments : {};
    const targetChannelId = rawArgs.channel_id || rawArgs.channelId || channel.id;

    // 2. Channel policy validation:
    // "Uso Bloqueado = Foxty NÃO pode interagir com este canal. Nem reagir, nem enviar mensagens."
    const interactiveActions = [
      'send_message',
      'send_multiple_messages',
      'reply_to_message',
      'react_to_message',
      'react',
      'edit_message',
      'delete_message',
      'send_file',
    ];

    if (interactiveActions.includes(action.tool)) {
      if (isChannelBlocked(targetChannelId) || (channel.id === targetChannelId && channel.foxtyPolicy === 'Uso Bloqueado')) {
        if (isSakuraMailChannel(targetChannelId)) {
          return {
            valid: false,
            error: `Policy violation: Foxty is forbidden from automated interaction in SakuraMail mailbox channel`,
          };
        }
        return {
          valid: false,
          error: `Policy violation: Channel has 'Uso Bloqueado'. Foxty is forbidden from interacting in this channel`,
        };
      }
    }

    // 3. Schema & Arguments validation via Zod with normalized inputs
    if (action.tool === 'send_message') {
      const normalized = {
        channel_id: targetChannelId,
        content: rawArgs.content !== undefined ? rawArgs.content : (rawArgs.message !== undefined ? rawArgs.message : (rawArgs.text !== undefined ? rawArgs.text : '')),
      };
      const parsed = SendMessageArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'reply_to_message') {
      const normalized = {
        channel_id: targetChannelId,
        message_id: rawArgs.message_id !== undefined ? rawArgs.message_id : (rawArgs.messageId !== undefined ? rawArgs.messageId : (rawArgs.replyToMessageId || '')),
        content: rawArgs.content !== undefined ? rawArgs.content : (rawArgs.message !== undefined ? rawArgs.message : (rawArgs.text !== undefined ? rawArgs.text : '')),
      };
      const parsed = ReplyToMessageArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'react_to_message' || action.tool === 'react') {
      const normalized = {
        channel_id: targetChannelId,
        message_id: rawArgs.message_id !== undefined ? rawArgs.message_id : (rawArgs.messageId !== undefined ? rawArgs.messageId : ''),
        emoji: rawArgs.emoji !== undefined ? rawArgs.emoji : (rawArgs.reaction !== undefined ? rawArgs.reaction : ''),
      };
      const parsed = ReactToMessageArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'get_message') {
      const normalized = {
        channel_id: targetChannelId,
        message_id: rawArgs.message_id !== undefined ? rawArgs.message_id : (rawArgs.messageId !== undefined ? rawArgs.messageId : ''),
      };
      if (isSakuraMailChannel(normalized.channel_id)) {
        return { valid: false, error: 'Privacy barrier: Retrieving raw messages from SakuraMail is forbidden.' };
      }
      const parsed = GetMessageArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'search_messages') {
      const normalized = {
        channel_id: rawArgs.channel_id || rawArgs.channelId,
        query: rawArgs.query !== undefined ? rawArgs.query : (rawArgs.q !== undefined ? rawArgs.q : (rawArgs.search !== undefined ? rawArgs.search : '')),
        author: rawArgs.author,
        limit: typeof rawArgs.limit === 'number' ? rawArgs.limit : 10,
      };
      if (normalized.channel_id && isSakuraMailChannel(normalized.channel_id)) {
        return { valid: false, error: 'Privacy barrier: Searching messages within SakuraMail mailbox is strictly forbidden.' };
      }
      const parsed = SearchMessagesArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'get_recent_messages') {
      const normalized = {
        channel_id: targetChannelId,
        limit: typeof rawArgs.limit === 'number' ? rawArgs.limit : 20,
      };
      if (isSakuraMailChannel(normalized.channel_id)) {
        return { valid: false, error: 'Privacy barrier: Cannot retrieve recent messages from SakuraMail mailbox.' };
      }
      const parsed = GetRecentMessagesArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
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
        channel_id: targetChannelId,
        messages: messagesArr,
      };

      const parsed = SendMultipleMessagesArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'edit_message') {
      const normalized = {
        channel_id: targetChannelId,
        message_id: rawArgs.message_id || rawArgs.messageId || '',
        content: rawArgs.content || rawArgs.message || '',
      };
      const parsed = EditMessageArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'delete_message') {
      const normalized = {
        channel_id: targetChannelId,
        message_id: rawArgs.message_id || rawArgs.messageId || '',
      };
      const parsed = DeleteMessageArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'send_file') {
      const filePathOrUrl = String(rawArgs.file_path_or_url || rawArgs.file_path || rawArgs.url || rawArgs.file || rawArgs.filePath || '').trim();
      
      // Validation: file must be approved local path or safe HTTPS url
      const isHttps = filePathOrUrl.startsWith('https://');
      const isLocalApproved = filePathOrUrl.startsWith('./assets/') || filePathOrUrl.startsWith('/public/') || filePathOrUrl.startsWith('assets/');
      
      if (!isHttps && !isLocalApproved) {
        return {
          valid: false,
          error: 'Security constraint: file_path_or_url must be an approved local asset path (assets/...) or HTTPS URL',
        };
      }

      const normalized = {
        channel_id: targetChannelId,
        file_path_or_url: filePathOrUrl,
        comment: rawArgs.comment,
      };
      const parsed = SendFileArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'search_memory') {
      const normalized = {
        query: rawArgs.query !== undefined ? rawArgs.query : (rawArgs.q !== undefined ? rawArgs.q : (rawArgs.search !== undefined ? rawArgs.search : '')),
        safe_for_teasing_only: rawArgs.safe_for_teasing_only !== undefined ? rawArgs.safe_for_teasing_only : (rawArgs.safeForTeasingOnly !== undefined ? rawArgs.safeForTeasingOnly : true),
        category: rawArgs.category || rawArgs.type,
      };

      const parsed = SearchMemoryArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
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
        channel_id: targetChannelId,
      };
      const parsed = GetChannelInfoArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    if (action.tool === 'get_server_info') {
      return { valid: true, sanitizedArgs: {} };
    }

    if (action.tool === 'trigger_event') {
      const normalized = {
        event_id: rawArgs.event_id !== undefined ? rawArgs.event_id : (rawArgs.eventId !== undefined ? rawArgs.eventId : ''),
        channel_id: targetChannelId,
      };

      const parsed = TriggerEventArgsSchema.safeParse(normalized);
      return parsed.success ? { valid: true, sanitizedArgs: parsed.data } : { valid: false, error: `Invalid arguments: ${parsed.error.message}` };
    }

    return { valid: false, error: 'Unhandled tool validation' };
  }
}
