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
  safe_for_teasing: z.boolean().optional(),
  targetUser: z.enum(['Kris', 'Riely', 'Other']).optional(),
  target_user: z.enum(['Kris', 'Riely', 'Other']).optional(),
});

export const BrainResponseSchema = z.object({
  action: DecisionActionEnum.optional(),
  decision: z.enum(['respond', 'ignore', 'react_only']).optional(),
  tone: ToneTypeEnum.optional(),
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
  thought: z.string().optional(),
  pensamento: z.string().optional(),
  raciocinio: z.string().optional(),
  resposta: z.string().optional(),
  respostas: z.array(z.string()).optional(),
  mensagem: z.string().optional(),
  mensagens: z.array(z.string()).optional(),
  texto: z.string().optional(),
  reacao: z.string().optional(),
  reacoes: z.array(z.string()).optional(),
});

export type RawBrainOutput = z.infer<typeof BrainResponseSchema>;

/**
 * Normalizes validated brain raw output into a canonical BrainDecision structure.
 */
export function normalizeBrainDecision(raw: RawBrainOutput): BrainDecision {
  const reason =
    raw.reason ||
    raw.reasoning ||
    raw.thought ||
    raw.pensamento ||
    raw.raciocinio ||
    'Decisão cognitiva estruturada';

  // Tone normalization
  let tone: ToneType = 'casual';
  const rawTone = (raw.tone || '').toLowerCase().trim();
  const validTones: ToneType[] = [
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
  ];
  if (validTones.includes(rawTone as ToneType)) {
    tone = rawTone as ToneType;
  } else if (rawTone.includes('teas') || rawTone.includes('provoc') || rawTone.includes('deboch')) {
    tone = 'teasing';
  } else if (rawTone.includes('clever') || rawTone.includes('esperto') || rawTone.includes('astut')) {
    tone = 'clever';
  } else if (rawTone.includes('dramat')) {
    tone = 'dramatic';
  } else if (rawTone.includes('chao') || rawTone.includes('caot')) {
    tone = 'chaotic';
  } else if (rawTone.includes('sweet') || rawTone.includes('doce') || rawTone.includes('gentil')) {
    tone = 'sweet';
  } else if (rawTone.includes('deadpan') || rawTone.includes('seco')) {
    tone = 'deadpan';
  } else if (rawTone.includes('curio')) {
    tone = 'curious';
  }

  // 1. Resolve Messages
  const messages: string[] = [];
  const rawMessagesArr = raw.messages || raw.mensagens || raw.respostas;
  if (Array.isArray(rawMessagesArr)) {
    for (const m of rawMessagesArr) {
      if (typeof m === 'string' && m.trim().length > 0) {
        messages.push(m.trim());
      }
    }
  } else {
    const singleMsg = raw.message || raw.mensagem || raw.resposta || raw.texto;
    if (typeof singleMsg === 'string' && singleMsg.trim().length > 0) {
      messages.push(singleMsg.trim());
    }
  }

  // 2. Resolve Reactions
  const reactions: string[] = [];
  const rawReactionsArr = raw.reactions || raw.reacoes;
  if (Array.isArray(rawReactionsArr)) {
    for (const r of rawReactionsArr) {
      if (typeof r === 'string' && r.trim().length > 0) {
        reactions.push(r.trim());
      }
    }
  }
  const singleReaction = raw.reaction || raw.reacao;
  if (typeof singleReaction === 'string' && singleReaction.trim().length > 0) {
    if (!reactions.includes(singleReaction.trim())) {
      reactions.push(singleReaction.trim());
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
      safeForTeasing: mc.safeForTeasing ?? mc.safe_for_teasing ?? false,
      targetUser: mc.targetUser ?? mc.target_user,
    });
  }

  // 5. Resolve Canonical Decision Enum
  let canonicalDecision: 'respond' | 'ignore' | 'react_only' = 'respond';
  const rawAction = (raw.action || '').toLowerCase().trim();
  const rawDecision = (raw.decision || '').toLowerCase().trim();

  if (
    rawAction === 'ignore' ||
    rawAction === 'do_nothing' ||
    rawAction === 'silence' ||
    rawAction === 'ignorar' ||
    rawDecision === 'ignore' ||
    rawDecision === 'silence'
  ) {
    canonicalDecision = 'ignore';
  } else if (
    rawAction === 'react' ||
    rawAction === 'react_only' ||
    rawAction === 'reagir' ||
    rawDecision === 'react_only'
  ) {
    canonicalDecision = 'react_only';
  } else if (
    rawAction === 'respond' ||
    rawAction === 'respond_and_tool' ||
    rawAction === 'responder' ||
    rawAction === 'send_message' ||
    rawDecision === 'respond'
  ) {
    canonicalDecision = 'respond';
  } else if (rawAction === 'tool_call') {
    canonicalDecision = messages.length > 0 ? 'respond' : 'ignore';
  } else if (messages.length === 0 && reactions.length > 0) {
    canonicalDecision = 'react_only';
  } else if (messages.length === 0 && actionRequests.length === 0) {
    canonicalDecision = 'ignore';
  }

  const mode = (raw.mode === 'burst' || messages.length > 1) ? 'burst' : 'single';

  return {
    decision: canonicalDecision,
    action: (raw.action as any) || (canonicalDecision === 'respond' ? 'respond' : canonicalDecision === 'react_only' ? 'react' : 'ignore'),
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

export function extractAndCleanJsonString(rawText: string): string {
  let cleaned = rawText.trim();

  // 1. Strip reasoning / thinking tokens (e.g. <think>...</think>) from DeepSeek-R1 / Reasoner models
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Extract content from markdown code block if present
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // Try to find the outermost JSON object { ... }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  // 3. Remove single line comments and multi-line comments
  cleaned = cleaned.replace(/\/\/.*$/gm, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 4. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned.trim();
}

/**
 * Robust JSON repair for common LLM syntax irregularities
 */
function attemptRepairJson(str: string): any {
  // First try direct parse
  try {
    return JSON.parse(str);
  } catch {
    // continue
  }

  let repaired = str;
  // Replace python-style booleans / none
  repaired = repaired.replace(/:\s*True\b/g, ': true');
  repaired = repaired.replace(/:\s*False\b/g, ': false');
  repaired = repaired.replace(/:\s*None\b/g, ': null');

  // Fix unquoted keys { key: "value" } -> { "key": "value" }
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

  // Fix single quotes around strings
  repaired = repaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

  // Remove trailing commas
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(repaired);
  } catch {
    // Try collapsing unescaped newlines
    const noNewlines = repaired.replace(/[\r\n]+/g, ' ');
    return JSON.parse(noNewlines);
  }
}

export function parseBrainOutput(rawText: string): { success: boolean; data?: BrainDecision; error?: string } {
  try {
    const cleaned = extractAndCleanJsonString(rawText);

    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      return {
        success: false,
        error: `Malformed JSON string: No valid JSON structure found in brain output`,
      };
    }

    let json: any;
    try {
      json = attemptRepairJson(cleaned);
    } catch (parseErr: any) {
      return {
        success: false,
        error: `Malformed JSON string: ${parseErr.message}`,
      };
    }

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

