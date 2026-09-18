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

  public shouldStaySilent(state: FoxtyState, isDirectMention: boolean): boolean {
    // Direct mentions are almost never ignored, unless suspicion or low energy is extreme
    if (isDirectMention) {
      return false;
    }

    // Foxty is economical with words - talkativeness controls spontaneous reply likelihood
    const threshold = 1.0 - state.talkativeness; // e.g. 0.6 if talkativeness is 0.4
    const roll = Math.random();
    return roll < threshold;
  }
}
