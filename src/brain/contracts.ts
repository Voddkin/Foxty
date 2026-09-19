import { z } from 'zod';
import { ActionRequest, BrainDecision, MemoryCandidate, ToneType, ToolCall } from '../types.js';

export const DecisionActionEnum = z.enum([
  'respond',
  'ignore',
  'react',
  'react_only',
  'tool_call',
  'respond_and_tool',
  'custom',
  'do_nothing',
]);

export const ToneTypeEnum = z.enum([
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
]);

export const ToolCallSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  arguments: z.record(z.any()).default({}),
});

export const ActionRequestSchema = z.object({
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
  arguments: z.record(z.any()).default({}),
});

export const MemoryCandidateSchema = z.object({
  content: z.string().min(1, 'Memory content cannot be empty'),
  type: z.enum(['episodic', 'behavioral', 'server', 'project', 'temporary']).default('episodic'),
  confidence: z.number().min(0).max(1).default(0.8),
  safeForTeasing: z.boolean().default(false),
  targetUser: z.enum(['Kris', 'Riely', 'Other']).optional(),
});

export const BrainResponseSchema = z.object({
  action: DecisionActionEnum.optional(),
  decision: z.enum(['respond', 'ignore', 'react_only']).optional(),
  tone: ToneTypeEnum.default('casual'),
  message: z.string().optional(),
  messages: z.array(z.string()).optional(),
  reaction: z.string().nullable().optional(),
  reactions: z.array(z.string()).optional(),
  mode: z.enum(['single', 'burst']).optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  actionRequests: z.array(ActionRequestSchema).optional(),
  memoryCandidates: z.array(MemoryCandidateSchema).optional(),
  memory_candidates: z.array(MemoryCandidateSchema).optional(),
  reason: z.string().optional(),
  reasoning: z.string().optional(),
});

export type RawBrainOutput = z.infer<typeof BrainResponseSchema>;

/**
 * Normalizes validated brain raw output into a canonical BrainDecision structure.
 */
export function normalizeBrainDecision(raw: RawBrainOutput): BrainDecision {
  const reason = raw.reason || raw.reasoning;
  const tone = (raw.tone || 'casual') as ToneType;

  // 1. Resolve Messages
  const messages: string[] = [];
  if (Array.isArray(raw.messages)) {
    for (const m of raw.messages) {
      if (typeof m === 'string' && m.trim().length > 0) {
        messages.push(m.trim());
      }
    }
  } else if (typeof raw.message === 'string' && raw.message.trim().length > 0) {
    messages.push(raw.message.trim());
  }

  // 2. Resolve Reactions
  const reactions: string[] = [];
  if (Array.isArray(raw.reactions)) {
    for (const r of raw.reactions) {
      if (typeof r === 'string' && r.trim().length > 0) {
        reactions.push(r.trim());
      }
    }
  }
  if (typeof raw.reaction === 'string' && raw.reaction.trim().length > 0) {
    if (!reactions.includes(raw.reaction.trim())) {
      reactions.push(raw.reaction.trim());
    }
  }

  // 3. Resolve Tool Calls / Action Requests
  const toolCalls: ToolCall[] = [];
  const actionRequests: ActionRequest[] = [];

  if (Array.isArray(raw.tool_calls)) {
    for (const tc of raw.tool_calls) {
      toolCalls.push(tc);
      actionRequests.push({
        tool: tc.name as any,
        arguments: tc.arguments || {},
      });
    }
  }

  if (Array.isArray(raw.actionRequests)) {
    for (const ar of raw.actionRequests) {
      actionRequests.push(ar as ActionRequest);
      toolCalls.push({
        name: ar.tool,
        arguments: ar.arguments || {},
      });
    }
  }

  // 4. Resolve Memory Candidates
  const memoryCandidates: MemoryCandidate[] = [];
  const rawCandidates = raw.memoryCandidates || raw.memory_candidates || [];
  for (const mc of rawCandidates) {
    memoryCandidates.push({
      content: mc.content,
      type: mc.type,
      confidence: mc.confidence,
      safeForTeasing: mc.safeForTeasing,
      targetUser: mc.targetUser,
    });
  }

  // 5. Resolve Canonical Decision Enum
  let canonicalDecision: 'respond' | 'ignore' | 'react_only' = 'respond';
  const action = raw.action;

  if (action === 'ignore' || action === 'do_nothing' || raw.decision === 'ignore') {
    canonicalDecision = 'ignore';
  } else if (action === 'react' || action === 'react_only' || raw.decision === 'react_only') {
    canonicalDecision = 'react_only';
  } else if (action === 'respond' || action === 'respond_and_tool' || raw.decision === 'respond') {
    canonicalDecision = 'respond';
  } else if (action === 'tool_call') {
    canonicalDecision = messages.length > 0 ? 'respond' : 'ignore';
  } else if (messages.length === 0 && reactions.length > 0) {
    canonicalDecision = 'react_only';
  } else if (messages.length === 0 && actionRequests.length === 0) {
    canonicalDecision = 'ignore';
  }

  const mode = raw.mode || (messages.length > 1 ? 'burst' : 'single');

  return {
    decision: canonicalDecision,
    action: action || (canonicalDecision === 'respond' ? 'respond' : canonicalDecision === 'react_only' ? 'react' : 'ignore'),
    tone,
    messages,
    message: messages[0],
    mode,
    reactions,
    reaction: reactions[0] || null,
    tool_calls: toolCalls,
    actionRequests,
    memoryCandidates,
    reason,
    reasoning: reason,
  };
}

export function parseBrainOutput(rawText: string): { success: boolean; data?: BrainDecision; error?: string } {
  try {
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

    const normalized = normalizeBrainDecision(parsed.data);
    return {
      success: true,
      data: normalized,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Malformed JSON string: ${err.message}`,
    };
  }
}

