import { ChannelInfo, FoxtyState, DeepSeekBrainConfig } from '../types.js';
import type {
  CherryPlaceChannel,
  CherryPlaceCategory,
  CherryPlaceServerInfo,
  CherryPlaceMember,
  ChannelType,
  FoxtyChannelPolicy,
} from './cherryPlaceModel.js';
import {
  CHERRY_PLACE_CHANNELS,
  CHERRY_PLACE_CATEGORIES,
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_MEMBERS,
  CHERRY_PLACE_CHANNEL_IDS,
  CHERRY_PLACE_CATEGORY_IDS,
  CHERRY_PLACE_MEMBER_IDS,
  getChannelById,
  getCategoryById,
  getChannelsByCategoryId,
  isChannelBlocked,
  isVoiceChannel,
  isSakuraMailChannel,
  getChannelUsagePolicy,
  canFoxtyInteractInChannel,
  getAllChannels,
  getAllCategories,
} from './cherryPlaceModel.js';

export type {
  CherryPlaceChannel,
  CherryPlaceCategory,
  CherryPlaceServerInfo,
  CherryPlaceMember,
  ChannelType,
  FoxtyChannelPolicy,
};

export {
  CHERRY_PLACE_CHANNELS,
  CHERRY_PLACE_CATEGORIES,
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_MEMBERS,
  CHERRY_PLACE_CHANNEL_IDS,
  CHERRY_PLACE_CATEGORY_IDS,
  CHERRY_PLACE_MEMBER_IDS,
  getChannelById,
  getCategoryById,
  getChannelsByCategoryId,
  isChannelBlocked,
  isVoiceChannel,
  isSakuraMailChannel,
  getChannelUsagePolicy,
  canFoxtyInteractInChannel,
  getAllChannels,
  getAllCategories,
};

export interface FoxtyConfig {
  discordToken?: string;
  discordClientId?: string;
  discordGuildId?: string;
  deepSeekApiKey?: string;
  deepSeekBaseUrl: string;
  deepSeekModel: string;
  deepSeek: DeepSeekBrainConfig;
  memoryProvider?: 'sqlite' | 'firestore' | 'in-memory';
  memoryStore?: any;
  testMode: boolean;
  port: number;
  maxBurstMessages: number;
  globalEventCooldownMinutes: number;
  channels: readonly ChannelInfo[];
  defaultState: FoxtyState;
}

export function loadConfig(): FoxtyConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY || undefined;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const temperature = parseFloat(process.env.DEEPSEEK_TEMPERATURE || '0.7');
  const maxTokens = parseInt(process.env.DEEPSEEK_MAX_TOKENS || '600', 10);
  const timeoutMs = parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '15000', 10);
  const thinkingMode = (process.env.DEEPSEEK_THINKING_MODE as any) || 'none';
  const reasoningEffort = (process.env.DEEPSEEK_REASONING_EFFORT as any) || undefined;
  const allowHeuristicFallback = process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK === 'true';

  const deepSeekConfig: DeepSeekBrainConfig = {
    apiKey,
    baseUrl,
    model,
    temperature,
    maxTokens,
    timeoutMs,
    thinkingMode,
    reasoningEffort,
    allowHeuristicFallback,
  };

  return {
    discordToken: process.env.DISCORD_TOKEN || undefined,
    discordClientId: process.env.DISCORD_CLIENT_ID || undefined,
    discordGuildId: process.env.DISCORD_GUILD_ID || CHERRY_PLACE_SERVER.id,
    deepSeekApiKey: apiKey,
    deepSeekBaseUrl: baseUrl,
    deepSeekModel: model,
    deepSeek: deepSeekConfig,
    memoryProvider: (process.env.MEMORY_PROVIDER as any) || 'sqlite',
    testMode: process.env.TEST_MODE !== 'false',
    port: parseInt(process.env.PORT || '3000', 10),
    maxBurstMessages: 3,
    globalEventCooldownMinutes: 30,
    channels: CHERRY_PLACE_CHANNELS,
    defaultState: {
      mood: 0.65,
      energy: 0.70,
      curiosity: 0.85,
      chaos: 0.45,
      drama: 0.35,
      talkativeness: 0.40, // economical by default!
      suspicion: 0.30,
    },
  };
}

