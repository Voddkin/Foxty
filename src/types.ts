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

export type ChannelCategory = 'social' | 'planning' | 'correspondence' | 'system' | 'restricted';

export interface ChannelInfo {
  id: string;
  name: string;
  category: string;
  type: ChannelCategory;
  isProtected: boolean;
  allowSpontaneousEvents: boolean;
  toneGuidance: string;
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
