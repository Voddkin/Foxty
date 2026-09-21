export class ReactionDiversityPolicy {
  private allowedEmojis: string[] = [
    '🦊', '🤔', '🔥', '💡', '👀', '✨', '☕', '⚡', '🎉', '🤐', '❤️', '🌸', '💬'
  ];

  // Channel ID -> Last used emoji
  private lastUsedReactionMap: Map<string, string> = new Map();

  /**
   * Selects an appropriate, diverse reaction emoji for a given message context
   */
  public selectEmoji(content: string, tone?: string, channelId?: string): string {
    const text = content.toLowerCase();

    // Contextual candidates based on keywords / tone
    let candidates: string[] = [];

    if (text.includes('?') || tone === 'curious') {
      candidates = ['🤔', '👀', '💡'];
    } else if (text.includes('ideia') || text.includes('constru') || text.includes('base') || tone === 'clever') {
      candidates = ['💡', '✨', '🔥'];
    } else if (text.includes('haha') || text.includes('kkk') || text.includes('engraça') || tone === 'teasing') {
      candidates = ['🎉', '⚡', '🦊'];
    } else if (text.includes('misterio') || text.includes('segredo') || text.includes('eita') || tone === 'dramatic') {
      candidates = ['👀', '🤐', '🤔'];
    } else if (text.includes('cafe') || text.includes('relax') || text.includes('noite') || tone === 'casual') {
      candidates = ['☕', '🌸', '✨'];
    } else {
      candidates = ['🦊', '👀', '✨', '🔥', '🤔'];
    }

    // Filter out the last emoji used in this channel to ensure diversity
    const lastUsed = channelId ? this.lastUsedReactionMap.get(channelId) : undefined;
    const filtered = candidates.filter((e) => e !== lastUsed);

    const pool = filtered.length > 0 ? filtered : candidates;
    const selected = pool[Math.floor(Math.random() * pool.length)] || '🦊';

    if (channelId) {
      this.lastUsedReactionMap.set(channelId, selected);
    }

    return selected;
  }

  /**
   * Filters proposed reactions from DeepSeek, ensuring only allowed, non-monopolizing emojis pass
   */
  public filterReactions(proposed: string[], channelId?: string): string[] {
    const valid = proposed.filter((e) => this.allowedEmojis.includes(e));
    if (valid.length === 0) return [];

    const lastUsed = channelId ? this.lastUsedReactionMap.get(channelId) : undefined;
    // Remove consecutive duplicates in same channel if alternatives exist
    const distinct = valid.filter((e) => e !== lastUsed);
    const finalSet = distinct.length > 0 ? distinct : valid;

    const chosen = finalSet.slice(0, 1); // Max 1 reaction per event
    if (chosen[0] && channelId) {
      this.lastUsedReactionMap.set(channelId, chosen[0]);
    }

    return chosen;
  }

  public getAllowedEmojis(): string[] {
    return [...this.allowedEmojis];
  }
}
