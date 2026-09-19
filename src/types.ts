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
  safeForTeasing: boolean; // Privacy constraint: never tease with private context
  retention: 'permanent' | 'temporary' | 'session';
  tags: string[];
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
  | 'react'
  | 'send_multiple_messages'
  | 'save_memory'
  | 'search_memory'
  | 'get_channel_info'
  | 'get_server_info'
  | 'trigger_event';

export interface ActionRequest {
  tool: ToolName;
  arguments: Record<string, any>;
}

export interface MemoryCandidate {
  content: string;
  type: MemoryType;
  confidence: number;
  safeForTeasing: boolean;
  targetUser?: 'Kris' | 'Riely' | 'Other';
}

export interface BrainDecision {
  decision: 'respond' | 'ignore' | 'react_only';
  tone: ToneType;
  messages: string[];
  mode?: 'single' | 'burst';
  reactions?: string[];
  memoryCandidates?: MemoryCandidate[];
  actionRequests?: ActionRequest[];
  reasoning?: string;
}

export interface ContextPackage {
  foxtyIdentity: {
    species: string;
    color: string;
    residentOf: string;
    nature: string[];
  };
  channel: ChannelInfo;
  location: SemanticLocationContext;
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

