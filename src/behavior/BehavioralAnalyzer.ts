import { BehavioralObservation, ChatMessage, ConversationCycle, PatternDeviation } from '../types.js';

export class BehavioralAnalyzer {
  private recentObservedMessages: { author: string; content: string; signals: string[]; timestamp: number }[] = [];

  /**
   * Analyzes an incoming message and returns a rich behavioral observation
   * compliant with documents 03 (Linguistic Signatures) & 07 (Behavioral Patterns by Situation).
   */
  public analyze(
    speaker: string,
    content: string,
    history: ChatMessage[] = []
  ): BehavioralObservation {
    const signals: string[] = [];
    const lower = content.toLowerCase();
    const clean = content.trim();

    // ==========================================
    // 1. Core Classifiers from Document 03 (Section 7)
    // ==========================================

    // Laughter markers
    const hasLaughter = /k{3,}|ksks+|kkkk+|hahaha+|rsrsrs+|ksksk/i.test(content);
    if (hasLaughter) {
      signals.push('laughter_marker');
    }

    // Micro-markers: - & ), :3, 🤭, etc.
    const hasMicroMarkers = /(-&\)|:3|🤭|👀|💀|🤨|✨)/.test(content);
    if (hasMicroMarkers) {
      signals.push('micro_markers');
    }

    // Emoji-only check
    const emojiRegex = /^(\p{Extended_Pictographic}|\s)+$/u;
    const isEmojiOnly = emojiRegex.test(clean) || clean === '🤭' || clean === '👀' || clean === '❤️';
    if (isEmojiOnly) {
      signals.push('emoji_only');
    }

    // Elongations (e.g. "Ate amanhãaaaaaa", "naaaooo", "kkkkkk")
    const hasElongation = /([a-zà-ú])\1{3,}/i.test(content);
    if (hasElongation) {
      signals.push('word_elongation');
    }

    // Informal spelling & abbreviations (vc, n, naum, tá, mds)
    const hasInformal = /\b(vc|vcs|n|naum|tá|ta|pq|oq|tbm|kd|mds|blz|vdd)\b/i.test(content);
    if (hasInformal) {
      signals.push('informal_spelling');
    }

    // Length-based classification
    if (clean.length <= 12) {
      if (hasLaughter || hasMicroMarkers || /bobo|haha|pera/i.test(clean)) {
        signals.push('short_playful');
      } else {
        signals.push('short_reactive');
      }
    } else if (clean.length > 90) {
      signals.push('long_explanatory');
    }

    // Theatrical exaggeration & caps amplifier
    const hasUppercaseBurst = clean.length > 5 && clean === clean.toUpperCase() && /[A-Z]/.test(clean);
    const hasTheatricalPhrases = /não é possível|não me diga|nossa|meu deus|mds|olha isso|não creio/i.test(content);
    if (hasUppercaseBurst || hasTheatricalPhrases) {
      signals.push('theatrical_exaggeration');
      if (hasUppercaseBurst) {
        signals.push('enthusiastic');
      }
    }

    // Question as social tool / followup
    if (content.includes('?')) {
      signals.push('question_followup');
      if (/o que|por que|pq|será|cadê|como assim|você/i.test(lower)) {
        signals.push('context_inquiry');
      }
    }

    // Teasing markers
    if (/bobo|duvido|só você|óbvio|confessa|nem parece|mentira/i.test(lower)) {
      signals.push('teasing');
    }

    // Closings / Farewells (doc 03, section 6 & doc 07, section 4)
    if (/ate amanh[aã]|até amanhã|boa noite|dorme bem|fui|té mais|até logo/i.test(lower)) {
      signals.push('closing');
    }

    // Minecraft context triggers (doc 04 & doc 07)
    const mcKeywords = [
      'base', 'cerejeira', 'allay', 'coordenada', 'portal', 'nether', 'escada', 'bloco',
      'minério', 'galinha', 'cavalo', 'constru', 'craft', 'vila', 'pillager', 'bau', 'baú', 'flor'
    ];
    if (mcKeywords.some((kw) => lower.includes(kw))) {
      signals.push('minecraft_context');
    }

    // Context reference / continuity
    if (/lembra|ontem|daquela vez|aquele dia|como você disse|já tinha|de novo/i.test(lower)) {
      signals.push('context_reference');
    }

    // ==========================================
    // 2. Speaker Linguistic Signature Inferences (Doc 03)
    // ==========================================
    let rielyScore = 0;
    let krisScore = 0;

    // Riely indicators: compression, ksks, informal spellings, - & ), :3, 🤭, expressive elongations
    if (signals.includes('short_reactive') || signals.includes('short_playful')) rielyScore += 2;
    if (/ksks+/i.test(content)) rielyScore += 2.5;
    if (/\b(naum|n|vc|tá)\b/i.test(lower)) rielyScore += 1.5;
    if (/(-&\)|:3|🤭)/.test(content)) rielyScore += 3;
    if (signals.includes('word_elongation') && !content.includes('?')) rielyScore += 1.5;

    // Kris indicators: expansion, questions, theatrical exaggeration, uppercase laugh, interjections (nossa, mds, hmm)
    if (signals.includes('long_explanatory')) krisScore += 2;
    if (signals.includes('question_followup')) krisScore += 2;
    if (signals.includes('theatrical_exaggeration')) krisScore += 2;
    if (/KSKS+|KKKK+/i.test(content) && hasUppercaseBurst) krisScore += 2;
    if (/\b(nossa|mds|hmm|não é possível|né)\b/i.test(lower)) krisScore += 1.5;
    if (/antes que você|o que que tem/i.test(lower)) krisScore += 2.5;

    let inferredSpeaker: 'Kris' | 'Riely' | 'Unknown' = 'Unknown';
    if (rielyScore > krisScore && rielyScore >= 2.5) {
      inferredSpeaker = 'Riely';
    } else if (krisScore > rielyScore && krisScore >= 2.5) {
      inferredSpeaker = 'Kris';
    }

    // ==========================================
    // 3. Pattern Deviation Detection (Doc 07, Sec 20)
    // ==========================================
    let patternDeviation: PatternDeviation | undefined;
    const speakerNormalized = speaker.toLowerCase();

    if (speakerNormalized.includes('riely') || speakerNormalized.includes('kazelyx')) {
      if (clean.length > 180 && signals.includes('long_explanatory')) {
        patternDeviation = {
          type: 'pattern_deviation',
          subject: 'Riely',
          baseline: 'short_compressed_response',
          observed: 'long_detailed_explanation',
          confidence: 0.88,
        };
      }
    } else if (speakerNormalized.includes('kris') || speakerNormalized.includes('onlykrisvk')) {
      if (clean.length <= 4 && !content.includes('?')) {
        patternDeviation = {
          type: 'pattern_deviation',
          subject: 'Kris',
          baseline: 'topic_expansion_and_questions',
          observed: 'minimal_unexpanded_reply',
          confidence: 0.82,
        };
      }
    }

    // ==========================================
    // 4. Conversation Cycle Analysis (Doc 03 Sec 5, Doc 07 Sec 16)
    // ==========================================
    let conversationCycle: ConversationCycle | undefined;
    if (history.length >= 1) {
      const prevMsg = history[history.length - 1];

      // Closing ritual: prev message or current message has farewell offer/reply
      if (
        signals.includes('closing') ||
        /ate amanh|boa noite|dorme bem/i.test(prevMsg.content.toLowerCase())
      ) {
        conversationCycle = {
          cycleType: 'closing_ritual',
          initiator: prevMsg.author,
          stages: ['farewell_offer', 'reciprocal_closing'],
          confidence: 0.91,
        };
      } else if (history.length >= 2) {
        const prevPrevMsg = history[history.length - 2];
        // Pattern: Short comment -> Expansion -> Reaction -> Followup
        if (
          prevPrevMsg.content.length <= 25 &&
          prevMsg.content.length > 50 &&
          (hasLaughter || signals.includes('short_playful'))
        ) {
          conversationCycle = {
            cycleType: 'microdetail_expansion',
            initiator: prevPrevMsg.author,
            stages: ['compressed_comment', 'topic_expansion', 'playful_reaction'],
            confidence: 0.85,
          };
        }
      }
    }

    // ==========================================
    // 5. Confidence Calculation (Doc 03, Sec 10)
    // Always probabilistic: 0.65 to 0.96, NEVER absolute
    // ==========================================
    const rawConfidence = 0.60 + signals.length * 0.07;
    const confidence = Math.min(0.96, Math.max(0.65, Number(rawConfidence.toFixed(2))));

    // Habit Labeling
    let detectedHabit: string | undefined;
    if (signals.includes('theatrical_exaggeration') && signals.includes('question_followup')) {
      detectedHabit = 'Theatrical inquiry & contextual teasing';
    } else if (signals.includes('micro_markers') && signals.includes('short_playful')) {
      detectedHabit = 'Compressed playful affection with markers';
    } else if (signals.includes('minecraft_context')) {
      detectedHabit = 'Cherry Place Minecraft continuity reference';
    } else if (signals.includes('closing')) {
      detectedHabit = 'Warm expressive farewell ritual';
    }

    // Buffer tracking for multi-message burst detection
    const now = Date.now();
    this.recentObservedMessages.push({ author: speaker, content, signals, timestamp: now });
    if (this.recentObservedMessages.length > 25) {
      this.recentObservedMessages.shift();
    }

    return {
      speaker,
      inferredSpeaker,
      signals,
      confidence,
      detectedHabit,
      patternDeviation,
      conversationCycle,
      timestamp: new Date().toISOString(),
    };
  }
}
