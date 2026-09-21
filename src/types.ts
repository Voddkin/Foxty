// ==========================================
// FOxty System Types & Contracts
// Based on FOxty Architecture Specification v0.1
// ==========================================

export interface FoxtyState {
  mood: number;          // 0.0 - 1.0 (melancholic -> ecstatic)
  energy: number;        // 0.0 - 1.0 (lethargic -> hyperactive)
  curiosity: number;     // 0.0 - 1.0 (indifferent -> intensely inquisitive)
  chaos: number;         // 0.0 - 1.0 (orderly -> unpredictable)
  drama: number;         // 0.0 - 1.0 (stoic -> theatrical)
  talkativeness: number; // 0.0 - 1.0 (silent/terse -> talkative)
  suspicion: number;     // 0.0 - 1.0 (trusting -> highly suspicious)
}

export type ChannelType = 'text' | 'voice';

export type FoxtyChannelPolicy =
  | 'Uso Bloqueado'
  | 'Uso Limitado'
  | 'Uso Moderado'
  | 'Uso Ativo'
  | 'Uso Frequente';

export type ChannelCategory = 'social' | 'planning' | 'correspondence' | 'system' | 'restricted';

export type ThematicContext =
  | 'conversa casual'
  | 'Minecraft'
  | 'exploração'
  | 'coordenadas'
  | 'metas'
  | 'planejamento de calls'
  | 'minigames'
  | 'correspondência protegida'
  | 'canais importantes';

export interface SemanticLocationContext {
  channelId: string;
  channelName: string;
  category: string;
  purpose: string;
  thematicContext: ThematicContext;
  foxtyPresenceLevel: FoxtyChannelPolicy;
  limitations: string;
  isProtected: boolean;
  specialRules: string;
  channelType: ChannelType;
}

export interface ChannelInfo {
  id: string;
  name: string;
  category: string;
  type: ChannelCategory | ChannelType;
  isProtected: boolean;
  allowSpontaneousEvents: boolean;
  toneGuidance: string;
  // Canonical fields from DISCORD_SERVER_CATEGORIES_AND_CHANNELS_RULES.md
  technicalName?: string;
  decoratedName?: string;
  categoryId?: string;
  channelType?: ChannelType;
  order?: number;
  purpose?: string;
  foxtyPolicy?: FoxtyChannelPolicy;
  isVoice?: boolean;
  allowsMentionsResponse?: boolean;
  thematicContext?: ThematicContext;
  limitations?: string;
  specialRules?: string;
}

export type MemoryType = 'episodic' | 'behavioral' | 'server' | 'project' | 'temporary';

export interface MemoryItem {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;      // 0.0 - 1.0
  confidence: number;      // 0.0 - 1.0
  source: string;          // discord user or system
  targetUser?: 'Kris' | 'Riely' | 'Other';
  createdAt: string;
  lastConfirmed?: string;
  expiresAt?: string;      // ISO string for temporary/expirable retention
  safeForTeasing: boolean; // Privacy constraint: never tease with private context
  retention: 'permanent' | 'temporary' | 'session';
  tags: string[];
  scope?: string;
  metadata?: Record<string, any>;
}

export interface MigrationReport {
  totalRead: number;
  migratedCount: number;
  skippedCount: number;
  duplicateCount: number;
  privacyFilteredCount: number;
  errors: string[];
  timestamp: string;
  durationMs: number;
  sourceProvider: string;
  targetProvider: string;
}

export interface ContextualScoredMemory {
  memory: MemoryItem;
  score: number;
  breakdown: {
    textMatchScore: number;
    recencyScore: number;
    importanceScore: number;
    targetUserBonus: number;
    tagBonus: number;
    semanticScore?: number;
  };
  scoreBreakdown?: {
    textMatchScore: number;
    recencyScore: number;
    importanceScore: number;
    targetUserBonus: number;
    tagBonus?: number;
    semanticScore?: number;
  };
}

export interface PatternDeviation {
  type: 'pattern_deviation';
  subject: string;
  baseline: string;
  observed: string;
  confidence: number;
}

export interface ConversationCycle {
  cycleType: 'microdetail_expansion' | 'playful_provocation' | 'closing_ritual' | 'discovery_share';
  initiator: string;
  stages: string[];
  confidence: number;
}

export interface BehavioralObservation {
  speaker: string;
  inferredSpeaker?: 'Kris' | 'Riely' | 'Unknown';
  signals: string[];
  confidence: number;
  detectedHabit?: string;
  patternDeviation?: PatternDeviation;
  conversationCycle?: ConversationCycle;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  author: string;
  channelId: string;
  content: string;
  timestamp: string;
  isBot: boolean;
  replyToMessageId?: string;
  repliedMessage?: {
    id?: string;
    author: string;
    content: string;
    timestamp?: string;
  } | null;
}

export type ToneType =
  | 'neutral'
  | 'casual'
  | 'curious'
  | 'teasing'
  | 'clever'
  | 'dramatic'
  | 'chaotic'
  | 'sweet'
  | 'deadpan'
  | 'pseudo_serious';

export type ToolName =
  | 'send_message'
  | 'send_multiple_messages'
  | 'reply_to_message'
  | 'react_to_message'
  | 'react'
  | 'get_message'
  | 'search_messages'
  | 'get_recent_messages'
  | 'edit_message'
  | 'delete_message'
  | 'send_file'
  | 'get_channel_info'
  | 'get_server_info'
  | 'save_memory'
  | 'search_memory'
  | 'trigger_event';

export interface ActionRequest {
  tool: ToolName;
  arguments: Record<string, any>;
  callId?: string;
}

export interface MemoryCandidate {
  content: string;
  type: MemoryType;
  confidence: number;
  safeForTeasing: boolean;
  targetUser?: 'Kris' | 'Riely' | 'Other';
}

export interface FoxtyIdentityContext {
  name: string;
  species: string;
  color: string;
  residentOf: string;
  personality: string[];
  speechStyle: string[];
  characteristics: string[];
  behavioralTendencies: string[];
  boundaries: string[];
}

export interface CurrentLocationContext {
  guild: { id: string; name: string };
  category: { id?: string; name: string; decoratedName?: string };
  channel: { id: string; name: string; decoratedName?: string; type: string };
  purpose: string;
  thematicContext: string;
  foxtyPolicy: FoxtyChannelPolicy;
  presenceLevel: string;
  limitations: string;
  specialRules: string;
  isProtected: boolean;
}

export interface CurrentEventContext {
  eventType: 'chat_message' | 'direct_mention' | 'slash_command' | 'scheduled_tick' | 'reaction_event' | 'custom';
  messageId: string;
  author: { name: string; isBot: boolean };
  content: string;
  timestamp: string;
  replyToMessageId?: string;
  repliedMessage?: { id?: string; author: string; content: string; timestamp?: string } | null;
  mentions: { directMentionOfFoxty: boolean; otherMentions: string[] };
  immediateConversationWindow: ChatMessage[];
  recentConversationWindow: Array<{ id?: string; author: string; content: string; timestamp: string; replyToMessageId?: string }>;
}

export interface MemoryAndStateContext {
  relevantMemories: Array<{ content: string; type: string; safeForTeasing: boolean; targetUser?: string }>;
  foxtyState: FoxtyState;
  participants: string[];
  behavioralObservations: BehavioralObservation[];
}

export type StructuredDecisionAction =
  | 'respond'
  | 'ignore'
  | 'react'
  | 'react_only'
  | 'tool_call'
  | 'respond_and_tool'
  | 'custom'
  | 'do_nothing';

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface BrainDecision {
  decision: 'respond' | 'ignore' | 'react_only';
  action?: StructuredDecisionAction;
  tone: ToneType;
  messages: string[];
  message?: string;
  mode?: 'single' | 'burst';
  reactions?: string[];
  reaction?: string | null;
  tool_calls?: ToolCall[];
  memoryCandidates?: MemoryCandidate[];
  actionRequests?: ActionRequest[];
  reason?: string;
  reasoning?: string;
}

export interface ContextPackage {
  foxtyIdentity: {
    species: string;
    color: string;
    residentOf: string;
    nature: string[];
  };
  identity?: FoxtyIdentityContext;
  channel: ChannelInfo;
  location: SemanticLocationContext;
  currentLocation?: CurrentLocationContext;
  event?: CurrentEventContext;
  memoryAndState?: MemoryAndStateContext;
  participants: string[];
  recentMessages: ChatMessage[];
  relevantMemories: MemoryItem[];
  behavioralObservations: BehavioralObservation[];
  foxtyState: FoxtyState;
  currentEvent: FoxtyEvent | null;
  availableTools: string[];
}

export type EventRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'anomalous';
export type EventCostClass = 'no_ai' | 'low' | 'medium' | 'rare';

export interface FoxtyEvent {
  id: string;
  name: string;
  description: string;
  rarity: EventRarity;
  costClass?: EventCostClass;
  priority?: number;        // 1 - 100
  chance: number;           // 0.0 - 1.0
  cooldownMinutes: number;
  requiresAi: boolean;
  allowedChannels: string[];
  lastTriggered?: string;
  payload?: Record<string, any>;
}

// SakuraMail Boundary Bridge Types (06_FOXY_OBSERVATION_PRIVACY_AND_MEMORY_BOUNDARY.md)
export type SakuraMailEventType = 'letter_opened' | 'letter_sent' | 'mailbox_checked';

export interface SakuraMailAbstractEvent {
  type: SakuraMailEventType;
  user: string;
  timestamp: string;
  channelId?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  event: string;
  channelId?: string;
  author?: string;
  actionType: string;
  decision: string;
  success: boolean;
  aiUsed: boolean;
  tokensUsed?: number;
  durationMs: number;
  details?: string;
  error?: string;
}

// ----------------------------------------------------------------------------
// SERVER MAP VALIDATOR TYPES
// ----------------------------------------------------------------------------
export type ValidationSeverity = 'OK' | 'INFO' | 'WARNING' | 'ERROR';

export interface ValidationFinding {
  code: string;
  severity: ValidationSeverity;
  targetType: 'guild' | 'category' | 'channel';
  targetId?: string;
  targetName?: string;
  expected?: any;
  actual?: any;
  message: string;
}

export interface DiscordServerSnapshot {
  guildId: string;
  guildName: string;
  categories: Array<{
    id: string;
    name: string;
    position?: number;
  }>;
  channels: Array<{
    id: string;
    name: string;
    type: 'text' | 'voice' | string;
    parentId?: string | null;
    position?: number;
  }>;
}

export interface CategoryValidationResult {
  canonicalId: string;
  canonicalName: string;
  decoratedName: string;
  expectedOrder: number;
  status: 'MATCH' | 'MISSING' | 'DIVERGENT';
  actualId?: string;
  actualName?: string;
  actualPosition?: number;
  channelsSummary: {
    totalExpected: number;
    matched: number;
    missing: number;
    divergent: number;
  };
  findings: ValidationFinding[];
}

export interface ChannelValidationResult {
  canonicalId: string;
  canonicalName: string;
  technicalName: string;
  decoratedName: string;
  expectedType: ChannelType;
  expectedCategoryId: string;
  expectedCategoryName: string;
  expectedOrder: number;
  status: 'MATCH' | 'MISSING' | 'DIVERGENT';
  actualId?: string;
  actualName?: string;
  actualType?: string;
  actualParentId?: string | null;
  actualPosition?: number;
  findings: ValidationFinding[];
}

export interface UnexpectedEntity {
  id: string;
  name: string;
  type: 'category' | 'channel';
  parentId?: string | null;
  channelType?: string;
  position?: number;
}

export interface ServerMapValidationReport {
  timestamp: string;
  status: 'PERFECT_MATCH' | 'COMPLIANT_WITH_WARNINGS' | 'CRITICAL_DIVERGENCES';
  isSafeAndNonDestructive: true;
  guildValidation: {
    canonicalId: string;
    canonicalName: string;
    actualId?: string;
    actualName?: string;
    isGuildIdMatch: boolean;
    isGuildNameMatch: boolean;
    findings: ValidationFinding[];
  };
  metrics: {
    totalExpectedCategories: number;
    matchedCategories: number;
    missingCategories: number;
    totalExpectedChannels: number;
    matchedChannels: number;
    missingChannels: number;
    unexpectedChannelsCount: number;
    unexpectedCategoriesCount: number;
    criticalErrorsCount: number;
    warningsCount: number;
    complianceScore: number;
  };
  categories: CategoryValidationResult[];
  channels: ChannelValidationResult[];
  unexpectedEntities: UnexpectedEntity[];
  allFindings: ValidationFinding[];
  summaryMarkdown: string;
}

// ----------------------------------------------------------------------------
// DEEPSEEK BRAIN CONFIGURATION TYPES
// ----------------------------------------------------------------------------
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  reason?: string;
  cooldownRemainingMs: number;
  lastFailureTime?: number;
}

export type ThinkingMode = 'none' | 'enabled' | 'auto';
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface DeepSeekBrainConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
  allowHeuristicFallback: boolean;
  fetchFn?: typeof fetch;
}

// ----------------------------------------------------------------------------
// DISCORD CONNECTION AUDIT & INTEGRATION TYPES
// ----------------------------------------------------------------------------
export interface DiscordConnectionAudit {
  timestamp: string;
  verdict: 'HEALTHY' | 'PARTIAL' | 'DISCONNECTED' | 'ERROR';
  summary: string;
  credentials: {
    hasToken: boolean;
    tokenConfigured: boolean;
    tokenLength: number;
    tokenPreview: string; // e.g. "MTU1...[REDACTED]"
    clientId: string | null;
    guildId: string | null;
    isClientIdCanonical: boolean;
    isGuildIdCanonical: boolean;
  };
  restApi: {
    status: 'CONNECTED' | 'FAILED' | 'SKIPPED';
    botUser: {
      id: string;
      tag: string;
      username: string;
      bot: boolean;
    } | null;
    latencyMs?: number;
    error?: string;
  };
  gateway: {
    status: 'READY' | 'CONNECTING' | 'DISCONNECTED' | 'FAILED';
    pingMs: number;
    intents: {
      guilds: boolean;
      guildMembers?: boolean;
      guildPresences?: boolean;
      guildMessages: boolean;
      messageContent: boolean;
      guildMessageReactions: boolean;
      rawIntents: number;
    };
    cachedGuilds: number;
    error?: string;
  };
  guildIdentification: {
    identified: boolean;
    id: string;
    name: string | null;
    isCherryPlace: boolean;
    memberCount?: number;
    channelCount?: number;
    categoriesCount?: number;
    error?: string;
  };
  slashCommandAudit: {
    registered: boolean;
    commandId?: string;
    commandName?: string;
    description?: string;
    optionsCount?: number;
    scope: 'guild' | 'global' | 'none';
    error?: string;
  };
  security: {
    tokensExposedInLogs: boolean;
    sanitizationActive: boolean;
  };
  summaryMarkdown: string;
}

// ----------------------------------------------------------------------------
// RUNTIME KNOWLEDGE & CONSTITUTION TYPES (11 CANONICAL DOCUMENTS)
// ----------------------------------------------------------------------------
export type CanonicalDocumentCategory =
  | 'BEHAVIOR_AND_IDENTITY'
  | 'ARCHITECTURE_AND_INFRASTRUCTURE';

export interface CanonicalDocumentMetadata {
  id: string;
  filename: string;
  title: string;
  category: CanonicalDocumentCategory;
  description: string;
}

export interface CanonicalDocumentInfo extends CanonicalDocumentMetadata {
  sizeBytes: number;
  charCount: number;
  hash: string;
  status: 'loaded' | 'missing' | 'empty';
  loadedAt?: string;
  preview?: string;
}

export interface RuntimeKnowledgeStatus {
  isComplete: boolean;
  loadedCount: number;
  totalExpected: number;
  constitutionHash: string;
  loadedAt: string;
  documents: CanonicalDocumentInfo[];
  missingDocuments: string[];
  emptyDocuments: string[];
  totalSizeBytes: number;
  totalCharCount: number;
  estimatedTokens: number;
  constitutionInjected: boolean;
  promptPrefixSize: number;
  summaryMarkdown: string;
}

