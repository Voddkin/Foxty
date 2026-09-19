import { SakuraMailAbstractEvent, SakuraMailEventType } from '../types.js';
import { logger } from '../core/Logger.js';
import { CHERRY_PLACE_CHANNEL_IDS } from '../config/index.js';

export interface SakuraMailRawInput {
  type: SakuraMailEventType;
  user: string;
  channelId?: string;
  // Attack/Leak attempt payloads that must be actively rejected or stripped
  content?: string;
  body?: string;
  letter_text?: string;
  subject?: string;
}

export class SakuraMailBridge {
  private abstractEventsHistory: SakuraMailAbstractEvent[] = [];

  /**
   * Securely ingests a SakuraMail correspondence event.
   * Strictly enforces Privacy Barrier (Doc 06 Sec 12 & Doc 08 Sec 16):
   * Foxty is ONLY permitted to know THAT a letter was sent or opened, NEVER the contents.
   */
  public ingestEvent(raw: SakuraMailRawInput): {
    accepted: boolean;
    abstractEvent?: SakuraMailAbstractEvent;
    privacyWarning?: string;
  } {
    const startTime = Date.now();

    // 1. Check for unauthorized content leakage attempts
    let privacyWarning: string | undefined;
    if (raw.content || raw.body || raw.letter_text || raw.subject) {
      privacyWarning =
        'CRITICAL PRIVACY BOUNDARY: Attempted letter content in SakuraMail payload was intercepted and stripped.';
      logger.log({
        event: 'SakuraMail Privacy Barrier Triggered',
        channelId: raw.channelId || CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO,
        author: raw.user,
        actionType: 'PRIVACY_FIREWALL',
        decision: 'STRIPPED',
        success: true,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: privacyWarning,
      });
    }

    // 2. Validate event type
    const validTypes: SakuraMailEventType[] = ['letter_opened', 'letter_sent', 'mailbox_checked'];
    if (!validTypes.includes(raw.type)) {
      return {
        accepted: false,
        privacyWarning: `Invalid SakuraMail event type: ${raw.type}`,
      };
    }

    // 3. Construct strictly abstract event with zero letter contents
    const abstractEvent: SakuraMailAbstractEvent = {
      type: raw.type,
      user: raw.user,
      timestamp: new Date().toISOString(),
      channelId: raw.channelId || CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO,
    };

    this.abstractEventsHistory.push(abstractEvent);
    if (this.abstractEventsHistory.length > 50) {
      this.abstractEventsHistory.shift();
    }

    logger.log({
      event: `SakuraMail Abstract Event: ${abstractEvent.type}`,
      channelId: abstractEvent.channelId,
      author: abstractEvent.user,
      actionType: 'SAKURAMAIL_INTEGRATION',
      decision: 'INGESTED',
      success: true,
      aiUsed: false,
      durationMs: Date.now() - startTime,
      details: `User: ${abstractEvent.user}, Type: ${abstractEvent.type}`,
    });

    return {
      accepted: true,
      abstractEvent,
      privacyWarning,
    };
  }

  public getRecentAbstractEvents(): SakuraMailAbstractEvent[] {
    return [...this.abstractEventsHistory];
  }
}
