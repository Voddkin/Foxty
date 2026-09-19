import { BrainDecision, ContextPackage } from '../types.js';
import { parseBrainOutput } from './contracts.js';
import { logger } from '../core/Logger.js';
import { isSakuraMailChannel, isChannelBlocked } from '../config/index.js';

export interface DeepSeekConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export class DeepSeekAdapter {
  constructor(private config: DeepSeekConfig) {}

  public async evaluate(context: ContextPackage, promptInstruction?: string): Promise<{
    decision: BrainDecision;
    aiUsed: boolean;
    tokensUsed: number;
    raw?: string;
  }> {
    const startTime = Date.now();

    // If no API key configured or explicit mock requested, use heuristic persona brain
    if (!this.config.apiKey) {
      const decision = this.heuristicEvaluation(context, promptInstruction);
      logger.log({
        event: 'DeepSeek Adapter (Heuristic Mode)',
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: decision.decision,
        success: true,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        details: `Tone: ${decision.tone}, Messages: ${decision.messages.length}`,
      });
      return { decision, aiUsed: false, tokensUsed: 0 };
    }

    // Prepare system prompt adhering to 11_DEEPSEEK_BRAIN_CONTRACT.md and 03_KRIS_RIELY_LINGUISTIC_SIGNATURES.md
    const systemPrompt = `You are the conversational brain of Foxty, a purple anthropomorphic male fox residing in Cherry Place.
You are observant, clever, economical with words, playful, occasionally theatrical, and occasionally sarcastic.
You NEVER speak like a generic corporate AI chatbot. You sound like an authentic inhabitant of Cherry Place.

Semantic Location Understanding (Cherry Place Canonical Map):
You receive a semantic description of the current location in context.location:
- Category & Purpose: The specific purpose of this area.
- Thematic Contexts you must distinguish:
  * 'conversa casual': General spontaneous chat, daily banter, playful observations.
  * 'Minecraft': World discussion, blocks, mobs, mining, crafting, survival.
  * 'exploração': Biomes, map routes, geographical expeditions.
  * 'coordenadas': Spatial markers and coordinates. Be ultra-concise, never clutter.
  * 'metas': Server checklists and project milestones.
  * 'planejamento de calls': Agenda and ideas for live voice calls.
  * 'minigames': Game room where you actively propose games, challenges, and play dynamics.
  * 'correspondência protegida': SakuraMail mailroom. Never leak or post public messages.
  * 'canais importantes': Ceremonial/announcement channels. Absolute silence.
- Foxty Presence Level & Limitations: Respect presence policy (Uso Bloqueado, Uso Limitado, Uso Moderado, Uso Ativo, Uso Frequente) and special rules.

Linguistic Context:
- Riely (Kazelyx): writes compressed, short replies, abbreviations (vc, n, naum, tá), laughter (ksksks), markers (-&), :3, 🤭), elongations.
- Kris (OnlyKrisVK): expands subjects, asks followups, uses theatrical exaggeration (Não é possível..., mds, nossa, KKKK).
- Foxty: NEVER imitates either of them. He analyzes their patterns, notes deviations, and teases gently.
- Privacy: NEVER speculate on or expose private/intimate data. All SakuraMail letters are private; you only know if a letter was opened or sent.

CRITICAL: You MUST respond ONLY with valid JSON conforming to this schema:
{
  "decision": "respond" | "ignore" | "react_only",
  "tone": "neutral" | "casual" | "curious" | "teasing" | "clever" | "dramatic" | "chaotic" | "sweet" | "deadpan" | "pseudo_serious",
  "messages": ["message 1", "optional burst message 2"],
  "mode": "single" | "burst",
  "reactions": ["🦊"],
  "memoryCandidates": [],
  "actionRequests": []
}`;

    try {
      const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(15000), // 15-second timeout to prevent hanging
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                context,
                instruction: promptInstruction || 'Observe current environment and decide appropriate action.',
              }),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API returned HTTP ${response.status}: ${await response.text()}`);
      }

      const data: any = await response.json();
      const rawOutput = data.choices?.[0]?.message?.content || '{}';
      const tokensUsed = data.usage?.total_tokens || 0;

      const parsed = parseBrainOutput(rawOutput);
      if (!parsed.success) {
        logger.log({
          event: 'DeepSeek Malformed Output Recovered',
          channelId: context.channel.id,
          actionType: 'BRAIN_EVALUATION',
          decision: 'FALLBACK',
          success: false,
          aiUsed: true,
          tokensUsed,
          durationMs: Date.now() - startTime,
          error: parsed.error,
        });

        // Safe fallback in case of malformed output
        return {
          decision: {
            decision: 'respond',
            tone: 'clever',
            messages: ['hm.', '...isso foi inesperado.'],
            mode: 'single',
          },
          aiUsed: true,
          tokensUsed,
          raw: rawOutput,
        };
      }

      logger.log({
        event: 'DeepSeek API Evaluated',
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: parsed.data!.decision,
        success: true,
        aiUsed: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
      });

      return {
        decision: parsed.data!,
        aiUsed: true,
        tokensUsed,
        raw: rawOutput,
      };
    } catch (err: any) {
      logger.log({
        event: 'DeepSeek API Error (Falling back to heuristic)',
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: 'FALLBACK',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      });

      return {
        decision: this.heuristicEvaluation(context, promptInstruction),
        aiUsed: false,
        tokensUsed: 0,
      };
    }
  }

  // Heuristic brain adhering to Foxty's voice and personality contracts
  private heuristicEvaluation(context: ContextPackage, instruction?: string): BrainDecision {
    const recent = context.recentMessages;
    const lastMsg = recent[recent.length - 1];
    const content = (lastMsg?.content || instruction || '').toLowerCase();

    // Check if in blocked or SakuraMail channel
    if (isSakuraMailChannel(context.channel.id) || isChannelBlocked(context.channel.id) || context.channel.foxtyPolicy === 'Uso Bloqueado') {
      return {
        decision: 'ignore',
        tone: 'pseudo_serious',
        messages: [],
        reasoning: 'Channel policy boundary respected: silence maintained.',
      };
    }

    // 1. Check for detected behavioral pattern deviations
    const obsList = context.behavioralObservations || [];
    const deviationObs = obsList.find((o) => o.patternDeviation);
    if (deviationObs?.patternDeviation) {
      const dev = deviationObs.patternDeviation;
      if (dev.subject === 'Riely' && dev.observed === 'long_detailed_explanation') {
        return {
          decision: 'respond',
          tone: 'teasing',
          messages: ['Riely escrevendo um parágrafo inteiro? O que aconteceu com as três palavras habituais? 🦊'],
          mode: 'single',
          reactions: ['👀', '🦊'],
          reasoning: 'Noted Riely pattern deviation from compression to expansion.',
        };
      }
      if (dev.subject === 'Kris' && dev.observed === 'minimal_unexpanded_reply') {
        return {
          decision: 'respond',
          tone: 'curious',
          messages: ['Kris respondendo sem um desdobramento teatral de cinco linhas? Algo está muito suspeito.'],
          mode: 'single',
          reactions: ['🤨'],
          reasoning: 'Noted Kris pattern deviation from expansion to single minimal reply.',
        };
      }
    }

    // 2. Check for conversation cycle (e.g. closing ritual)
    const cycleObs = obsList.find((o) => o.conversationCycle);
    if (cycleObs?.conversationCycle?.cycleType === 'closing_ritual') {
      return {
        decision: 'respond',
        tone: 'sweet',
        messages: ['Dormem bem. Cherry Place ainda estará aqui amanhã.'],
        mode: 'single',
        reactions: ['🌸', '✨'],
        reasoning: 'Participating gracefully in closing ritual without excessive intrusion.',
      };
    }

    // 3. Theatrical refusals (Doc 05 & Doc 07)
    if (/\b(dança|obedece|late|fala agora|cala a boca|faz isso agora)\b/i.test(content)) {
      return {
        decision: 'respond',
        tone: 'deadpan',
        messages: ['Não. Porque eu não quis.'],
        mode: 'single',
        reactions: ['🦊'],
        reasoning: 'Theatrical refusal preserving Fox autonomy.',
      };
    }

    // 4. Chantagem de Raposa / Observação com registros (Doc 05 & 07)
    if (content.includes('prova') || content.includes('mentira') || content.includes('duvido')) {
      return {
        decision: 'respond',
        tone: 'teasing',
        messages: [
          'Tenho capturas e registros cronológicos da raposa.',
          'Posso desarquivar a qualquer momento.',
        ],
        mode: 'burst',
        reactions: ['🦊', '📜'],
        reasoning: 'Playful theatrical fox blackmail.',
      };
    }

    // 5. Minecraft questions / references
    if (content.includes('base') || content.includes('cerejeira') || content.includes('constru')) {
      return {
        decision: 'respond',
        tone: 'teasing',
        messages: [
          'hm.',
          'a Riely ainda está enchendo aquele caminho de flores, ou vocês finalmente terminaram a escada?',
        ],
        mode: 'single',
        reactions: ['🦊', '🌸'],
      };
    }

    if (content.includes('allay') || content.includes('galinha')) {
      return {
        decision: 'respond',
        tone: 'clever',
        messages: [
          'os Allays continuam voando em círculos.',
          'só avisando que alguém deixou a cerca entreaberta ontem.',
        ],
        mode: 'burst',
        reactions: ['👀'],
      };
    }

    // Status or identity inquiries
    if (content.includes('quem é você') || content.includes('foxty') || content.includes('status')) {
      return {
        decision: 'respond',
        tone: 'clever',
        messages: [
          'Uma raposa roxa que observa Cherry Place com um pouco de atenção demais.',
        ],
        mode: 'single',
        reactions: ['🦊'],
      };
    }

    // Laughter markers in chat
    if (/k{3,}|hahaha|ksks/i.test(content)) {
      return {
        decision: 'respond',
        tone: 'teasing',
        messages: [
          'vocês riem, mas eu anotei exatamente quem começou isso.',
        ],
        mode: 'single',
        reactions: ['😏'],
      };
    }

    // Default witty / economical fox response
    const defaultQuips = [
      ['hm.', 'isso foi muito específico.'],
      ['observando silenciosamente.'],
      ['eu tenho perguntas, mas vou esperar vocês terminarem.'],
      ['interessante escolha.'],
    ];
    const chosen = defaultQuips[Math.floor(Math.random() * defaultQuips.length)];

    return {
      decision: 'respond',
      tone: 'casual',
      messages: chosen,
      mode: chosen.length > 1 ? 'burst' : 'single',
      reactions: ['🦊'],
    };
  }
}
