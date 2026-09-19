import { ChannelInfo, FoxtyState } from '../types.js';
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
  testMode: boolean;
  port: number;
  maxBurstMessages: number;
  globalEventCooldownMinutes: number;
  channels: readonly ChannelInfo[];
  defaultState: FoxtyState;
}

export function loadConfig(): FoxtyConfig {
  return {
    discordToken: process.env.DISCORD_TOKEN || undefined,
    discordClientId: process.env.DISCORD_CLIENT_ID || undefined,
    discordGuildId: process.env.DISCORD_GUILD_ID || CHERRY_PLACE_SERVER.id,
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY || undefined,
    deepSeekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepSeekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
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
