import { ChannelInfo, FoxtyState, ToneType } from '../types.js';

export class PersonalityEngine {
  public determineTone(state: FoxtyState, channel: ChannelInfo, signals: string[]): ToneType {
    // Restricted channels dictate cautious / pseudo_serious tone
    if (channel.isProtected) {
      return 'pseudo_serious';
    }

    // High drama + chaos triggers dramatic / chaotic
    if (state.drama > 0.7 && state.chaos > 0.6) {
      return 'chaotic';
    }

    if (state.drama > 0.65) {
      return 'dramatic';
    }

    // Inquisitive prompts trigger curious or clever
    if (signals.includes('inquisitive_prompt') || state.curiosity > 0.8) {
      return 'clever';
    }

    // Laughter markers trigger playful teasing
    if (signals.includes('laughter_marker') || state.mood > 0.7) {
      return 'teasing';
    }

    // Low energy or high suspicion triggers deadpan
    if (state.suspicion > 0.6 || state.energy < 0.3) {
      return 'deadpan';
    }

    return 'casual';
  }

  public shouldStaySilent(state: FoxtyState, isDirectMention: boolean, channel?: ChannelInfo): boolean {
    // 1. Blocked channels: strictly forbidden from interacting, EVEN IF MENTIONED
    // "Mencionar Foxty SEMPRE fará com que ele responda e apareça. MENOS PARA OS CANAIS DE 'Uso Bloqueado'."
    if (channel?.foxtyPolicy === 'Uso Bloqueado') {
      return true;
    }

    // 2. Direct mentions: always respond (for non-blocked channels)
    if (isDirectMention) {
      return false;
    }

    // 3. Frequent usage channels (Jardim Mágico, MiniGames): Foxty is deliberately and obligatorily present!
    if (channel?.foxtyPolicy === 'Uso Frequente') {
      return false;
    }

    // 4. Limited usage channels (Coords, Call Topics, Call Ideas): Extremely rare appearances
    if (channel?.foxtyPolicy === 'Uso Limitado') {
      return Math.random() < 0.95;
    }

    // 5. Moderate usage channels (Maps, Build Ideas): Occasionally chimes in
    if (channel?.foxtyPolicy === 'Uso Moderado') {
      const threshold = 0.80 - state.talkativeness * 0.2;
      return Math.random() < threshold;
    }

    // 6. Active usage channels (Conversas Diárias, Conversas Cúbicas, Metas e Objetivos):
    // Talkativeness controls spontaneous reply likelihood
    const threshold = 1.0 - state.talkativeness * 0.9;
    const roll = Math.random();
    return roll < threshold;
  }
}
