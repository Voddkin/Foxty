import { z } from 'zod';
import { BrainDecision } from '../types.js';

export const BrainResponseSchema = z.object({
  decision: z.enum(['respond', 'ignore', 'react_only']).default('respond'),
  tone: z
    .enum([
      'neutral',
      'casual',
      'curious',
      'teasing',
      'clever',
      'dramatic',
      'chaotic',
      'sweet',
      'deadpan',
      'pseudo_serious',
    ])
    .default('casual'),
  messages: z.array(z.string()).default([]),
  mode: z.enum(['single', 'burst']).optional().default('single'),
  reactions: z.array(z.string()).optional().default([]),
  memoryCandidates: z
    .array(
      z.object({
        content: z.string().min(1),
        type: z.enum(['episodic', 'behavioral', 'server', 'project', 'temporary']),
        confidence: z.number().min(0).max(1),
        safeForTeasing: z.boolean().default(false),
        targetUser: z.enum(['Kris', 'Riely', 'Other']).optional(),
      })
    )
    .optional()
    .default([]),
  actionRequests: z
    .array(
      z.object({
        tool: z.enum([
          'send_message',
          'react',
          'send_multiple_messages',
          'save_memory',
          'search_memory',
          'get_channel_info',
          'get_server_info',
          'trigger_event',
        ]),
        arguments: z.record(z.any()),
      })
    )
    .optional()
    .default([]),
  reasoning: z.string().optional(),
});

export function parseBrainOutput(rawText: string): { success: boolean; data?: BrainDecision; error?: string } {
  try {
    // Attempt cleaning if model wrapped in markdown code blocks ```json ... ```
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    const json = JSON.parse(cleaned);
    const parsed = BrainResponseSchema.safeParse(json);

    if (!parsed.success) {
      return {
        success: false,
        error: `JSON schema validation failed: ${parsed.error.message}`,
      };
    }

    return {
      success: true,
      data: parsed.data as BrainDecision,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Malformed JSON string: ${err.message}`,
    };
  }
}
