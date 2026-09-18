import { ChannelInfo, FoxtyState } from '../types.js';

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
  channels: ChannelInfo[];
  defaultState: FoxtyState;
}

export const CHERRY_PLACE_CHANNELS: ChannelInfo[] = [
  {
    id: 'ch-daily-talk',
    name: '💬 — conversas・diárias',
    category: 'The Little Riri ✧･ﾟ',
    type: 'social',
    isProtected: false,
    allowSpontaneousEvents: true,
    toneGuidance: 'High narrative freedom, playful, observant, teasing and spontaneous banter.',
  },
  {
    id: 'ch-build-ideas',
    name: '🏡 — ideias・de・construção',
    category: 'The Little Riri ✧･ﾟ',
    type: 'planning',
    isProtected: false,
    allowSpontaneousEvents: true,
    toneGuidance: 'Attentive to Minecraft builds, materials, cherry blossoms, house layouts.',
  },
  {
    id: 'ch-maps-exploration',
    name: '🌎 — mapas・e・explorações',
    category: 'The Little Riri ✧･ﾟ',
    type: 'planning',
    isProtected: false,
    allowSpontaneousEvents: true,
    toneGuidance: 'Curious about biomes, caves, expeditions, rare structures.',
  },
  {
    id: 'ch-important-coords',
    name: '📌 — coordenadas・importantes',
    category: 'The Little Riri ✧･ﾟ',
    type: 'restricted',
    isProtected: true,
    allowSpontaneousEvents: false,
    toneGuidance: 'Caution first. Accurate information, no playful distortions of crucial coordinates.',
  },
  {
    id: 'ch-topics-to-talk',
    name: '📝 — assuntos・para・falar',
    category: 'Planner da Riri ✧･ﾟ',
    type: 'planning',
    isProtected: false,
    allowSpontaneousEvents: false,
    toneGuidance: 'Organized, notices forgotten topics, does not act like a rigid task manager.',
  },
  {
    id: 'ch-sakura-mail',
    name: '💌 — caixa・de・correio',
    category: '📨 Correspondencias ✧･ﾟ',
    type: 'correspondence',
    isProtected: true,
    allowSpontaneousEvents: false,
    toneGuidance: 'Strictly protected. SakuraMail is dominant. Never inspect private letter content.',
  },
];

export function loadConfig(): FoxtyConfig {
  return {
    discordToken: process.env.DISCORD_TOKEN || undefined,
    discordClientId: process.env.DISCORD_CLIENT_ID || undefined,
    discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
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
