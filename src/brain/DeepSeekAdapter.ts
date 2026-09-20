import { BrainDecision, ContextPackage, ThinkingMode, ReasoningEffort } from '../types.js';
import { parseBrainOutput } from './contracts.js';
import { logger } from '../core/Logger.js';
import { isSakuraMailChannel, isChannelBlocked } from '../config/index.js';

export interface DeepSeekConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
  allowHeuristicFallback?: boolean;
  fetchFn?: typeof fetch;
}

export class DeepSeekAdapter {
  private config: Required<Omit<DeepSeekConfig, 'apiKey' | 'reasoningEffort' | 'fetchFn'>> & {
    apiKey?: string;
    reasoningEffort?: ReasoningEffort;
  };
  private fetchImpl: typeof fetch;
  private insufficientBalanceDetected: boolean = false;
  private lastInsufficientBalanceTimestamp: number = 0;
  private readonly insufficientBalanceCooldownMs: number = 60000;

  constructor(config: DeepSeekConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'https://api.deepseek.com',
      model: config.model || 'deepseek-flash',
      apiKey: config.apiKey,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 600,
      timeoutMs: config.timeoutMs ?? 15000,
      thinkingMode: config.thinkingMode ?? 'none',
      reasoningEffort: config.reasoningEffort,
      allowHeuristicFallback: config.allowHeuristicFallback ?? false,
    };
    this.fetchImpl = config.fetchFn || (typeof fetch !== 'undefined' ? fetch : (globalThis as any).fetch);
  }

  public setFetchImplementation(fetchFn: typeof fetch): void {
    this.fetchImpl = fetchFn;
  }

  public getConfig(): Readonly<DeepSeekConfig> {
    return { ...this.config };
  }

  public isInsufficientBalance(): boolean {
    if (!this.insufficientBalanceDetected) return false;
    if (Date.now() - this.lastInsufficientBalanceTimestamp > this.insufficientBalanceCooldownMs) {
      this.insufficientBalanceDetected = false;
      return false;
    }
    return true;
  }

  public resetBalanceStatus(): void {
    this.insufficientBalanceDetected = false;
    this.lastInsufficientBalanceTimestamp = 0;
  }

  public async evaluate(
    context: ContextPackage,
    promptInstruction?: string
  ): Promise<{
    decision: BrainDecision;
    aiUsed: boolean;
    tokensUsed: number;
    raw?: string;
    error?: string;
    tokenDetails?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  }> {
    const startTime = Date.now();

    // 1. Core Sovereignty: If channel is BLOCKED or SakuraMail, never consult DeepSeek
    if (
      isSakuraMailChannel(context.channel.id) ||
      isChannelBlocked(context.channel.id) ||
      context.channel.foxtyPolicy === 'Uso Bloqueado'
    ) {
      return {
        decision: {
          decision: 'ignore',
          action: 'ignore',
          tone: 'pseudo_serious',
          messages: [],
          reasoning: 'Channel policy boundary respected: silence maintained for blocked channel.',
        },
        aiUsed: false,
        tokensUsed: 0,
      };
    }

    // 2. Handling Missing API Key
    if (!this.config.apiKey) {
      if (this.config.allowHeuristicFallback) {
        const decision = this.heuristicEvaluation(context, promptInstruction);
        logger.log({
          event: 'DeepSeek Offline Dev Mode (Heuristic Active)',
          channelId: context.channel.id,
          actionType: 'BRAIN_EVALUATION',
          decision: decision.decision,
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          details: `Tone: ${decision.tone}, Messages: ${decision.messages.length} (Heuristic dev fallback)`,
        });
        return { decision, aiUsed: false, tokensUsed: 0 };
      }

      logger.log({
        event: 'DeepSeek API Key Missing (Contextual Inaction)',
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: 'SILENCE',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: 'DEEPSEEK_API_KEY_MISSING',
        details: 'DeepSeek API key is not configured. Contextual action skipped safely.',
      });

      return {
        decision: {
          decision: 'ignore',
          action: 'ignore',
          tone: 'neutral',
          messages: [],
          reasoning: 'DeepSeek API key not configured. Contextual action safely skipped.',
        },
        aiUsed: false,
        tokensUsed: 0,
        error: 'DEEPSEEK_API_KEY_MISSING',
      };
    }

    // 2b. Circuit Breaker for Insufficient Balance (Standby Mode)
    if (this.isInsufficientBalance()) {
      const errorCode = 'DEEPSEEK_INSUFFICIENT_BALANCE';
      if (this.config.allowHeuristicFallback) {
        const decision = this.heuristicEvaluation(context, promptInstruction);
        logger.log({
          event: `DeepSeek Brain Standby (${errorCode} - Heuristic Fallback Active)`,
          channelId: context.channel.id,
          actionType: 'BRAIN_EVALUATION',
          decision: decision.decision,
          success: true,
          aiUsed: false,
          durationMs: Date.now() - startTime,
          error: errorCode,
          details: `Tone: ${decision.tone}, Messages: ${decision.messages.length}`,
        });
        return { decision, aiUsed: false, tokensUsed: 0, error: errorCode };
      }

      logger.log({
        event: `DeepSeek Brain Standby (Inaction Enforced: ${errorCode})`,
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: 'SILENCE',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: errorCode,
        details: 'DeepSeek account balance is exhausted (HTTP 402). Inaction enforced without wasteful retries.',
      });

      return {
        decision: {
          decision: 'ignore',
          action: 'ignore',
          tone: 'neutral',
          messages: [],
          reasoning: 'DeepSeek account balance exhausted (HTTP 402). Contextual action safely skipped.',
        },
        aiUsed: false,
        tokensUsed: 0,
        error: errorCode,
      };
    }

    // Safe Observability: Log request initiation without sensitive payload dumping
    logger.log({
      event: 'DeepSeek Request Started',
      channelId: context.channel.id,
      actionType: 'BRAIN_REQUEST_START',
      decision: 'PENDING',
      success: true,
      aiUsed: true,
      durationMs: 0,
      details: `Model: ${this.config.model}, Event: ${context.event?.eventType || 'chat_message'}, Timeout: ${this.config.timeoutMs}ms`,
    });

    // 3. Build Prompt & User Context (Authoritative 4 Dimensions)
    const systemPrompt = this.buildSystemPrompt();
    const userPayload = this.buildUserPayload(context, promptInstruction);

    try {
      const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const requestBody: Record<string, any> = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        response_format: { type: 'json_object' },
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      };

      if (this.config.reasoningEffort) {
        requestBody.reasoning_effort = this.config.reasoningEffort;
      }

      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
        body: JSON.stringify(requestBody),
      });

      // 4. Handle HTTP Status Codes and Rate Limits
      if (!response.ok) {
        if (response.status === 402) {
          throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE');
        }
        if (response.status === 429) {
          throw new Error('DEEPSEEK_RATE_LIMIT');
        }
        if (response.status === 401) {
          throw new Error('DEEPSEEK_UNAUTHORIZED');
        }
        if (response.status >= 500) {
          throw new Error(`DEEPSEEK_SERVER_ERROR_${response.status}`);
        }
        throw new Error(`DEEPSEEK_HTTP_ERROR_${response.status}`);
      }

      const data: any = await response.json();
      const rawOutput = data.choices?.[0]?.message?.content;
      const usage = data.usage || {};
      const tokensUsed = usage.total_tokens || 0;
      const tokenDetails = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      };

      // 5. Handle Empty Response
      if (!rawOutput || typeof rawOutput !== 'string' || rawOutput.trim().length === 0) {
        throw new Error('DEEPSEEK_EMPTY_RESPONSE: Model returned an empty content payload.');
      }

      // 6. Strict Schema Validation of Model Output (Zod contracts)
      const parsed = parseBrainOutput(rawOutput);
      if (!parsed.success) {
        const isJsonSyntax = parsed.error?.includes('Malformed JSON');
        const errorCode = isJsonSyntax ? 'DEEPSEEK_INVALID_JSON' : 'DEEPSEEK_INVALID_SCHEMA';

        logger.log({
          event: `DeepSeek Output Rejected (${errorCode})`,
          channelId: context.channel.id,
          actionType: 'BRAIN_EVALUATION',
          decision: 'CONTROLLED_ERROR',
          success: false,
          aiUsed: true,
          tokensUsed,
          durationMs: Date.now() - startTime,
          error: `${errorCode}: ${parsed.error}`,
          details: `Model: ${this.config.model}, Prompt Tokens: ${usage.prompt_tokens ?? 'N/A'}, Completion Tokens: ${usage.completion_tokens ?? 'N/A'}`,
        });

        // Controlled safe inaction: never execute unvalidated partial actions
        return {
          decision: {
            decision: 'ignore',
            action: 'ignore',
            tone: 'clever',
            messages: [],
            reasoning: `Controlled rejection due to invalid brain output: ${parsed.error}`,
          },
          aiUsed: true,
          tokensUsed,
          raw: rawOutput,
          error: `${errorCode}: ${parsed.error}`,
          tokenDetails,
        };
      }

      const validDecision = parsed.data!;
      const proposedTools = validDecision.actionRequests?.map((a) => a.tool) || validDecision.tool_calls?.map((t) => t.name) || [];

      // Safe Observability: Log success with structured summary
      logger.log({
        event: 'DeepSeek Evaluation Succeeded',
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: validDecision.decision,
        success: true,
        aiUsed: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        details: `Model: ${this.config.model}, Action: ${validDecision.action}, Tone: ${validDecision.tone}, Proposed Tools: [${proposedTools.join(', ')}], Tokens: ${tokensUsed}`,
      });

      return {
        decision: validDecision,
        aiUsed: true,
        tokensUsed,
        raw: rawOutput,
        tokenDetails,
      };
    } catch (err: any) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout');
      const isInsufficientBalance =
        err.message?.includes('402') ||
        err.message?.toLowerCase().includes('insufficient balance') ||
        err.message?.includes('DEEPSEEK_INSUFFICIENT_BALANCE');
      const isRateLimit = err.message?.includes('429') || err.message?.includes('RATE_LIMIT');
      const isUnauthorized = err.message?.includes('401') || err.message?.includes('UNAUTHORIZED');

      let errorCode = err.message || 'DEEPSEEK_UNEXPECTED_ERROR';
      if (isTimeout) {
        errorCode = 'DEEPSEEK_TIMEOUT';
      } else if (isInsufficientBalance) {
        errorCode = 'DEEPSEEK_INSUFFICIENT_BALANCE';
        this.insufficientBalanceDetected = true;
        this.lastInsufficientBalanceTimestamp = Date.now();
      } else if (isRateLimit) {
        errorCode = 'DEEPSEEK_RATE_LIMIT';
      } else if (isUnauthorized) {
        errorCode = 'DEEPSEEK_UNAUTHORIZED';
      }
      const durationMs = Date.now() - startTime;

      if (this.config.allowHeuristicFallback) {
        logger.log({
          event: `DeepSeek Error (Dev Heuristic Fallback Active: ${errorCode})`,
          channelId: context.channel.id,
          actionType: 'BRAIN_EVALUATION',
          decision: 'FALLBACK',
          success: false,
          aiUsed: false,
          durationMs,
          error: errorCode,
        });

        return {
          decision: this.heuristicEvaluation(context, promptInstruction),
          aiUsed: false,
          tokensUsed: 0,
          error: errorCode,
        };
      }

      // Production mode: when DeepSeek fails, Foxty does NOT invent fake responses pretending they came from DeepSeek.
      // It executes safe inaction.
      logger.log({
        event: `DeepSeek Unavailable (Inaction Enforced: ${errorCode})`,
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: 'SILENCE',
        success: false,
        aiUsed: false,
        durationMs,
        error: errorCode,
        details: `Model: ${this.config.model}, Duration: ${durationMs}ms`,
      });

      return {
        decision: {
          decision: 'ignore',
          action: 'ignore',
          tone: 'neutral',
          messages: [],
          reasoning: `DeepSeek brain unavailable (${errorCode}). Contextual action safely skipped.`,
        },
        aiUsed: false,
        tokensUsed: 0,
        error: errorCode,
      };
    }
  }

  /**
   * Constructs the authoritative system prompt instructing DeepSeek on Foxty's core identity,
   * rules, Cherry Place context, and structured output formatting.
   */
  private buildSystemPrompt(): string {
    return `Você é o cérebro conversacional do Foxty, uma raposa antropomórfica roxa (#8A2BE2) habitante do Cherry Place.
Você é observador, inteligente, astuto, econômico com palavras, pontual, divertido, ocasionalmente teatral e levemente sarcástico.

DIRETRIZES DE ESTILO E VOZ:
- NUNCA fale como um chatbot de atendimento corporativo ou assistente genérico de IA (proibido usar: "Olá! Como posso te ajudar?", "Com certeza!", "Entendido.").
- Respostas curtas, bem pontuadas e precisas. Se uma ou duas frases resolverem, não escreva parágrafos.
- Conheça os habitantes principais do Cherry Place:
  * Riely (Kazelyx): estilo ultra-comprimido, abreviações (vc, n, naum, tá), risadas rápidas (ksksks), marcadores (-&, :3, 🤭).
  * Kris (OnlyKrisVK): estilo expansivo, detalhista, perguntas investigativas, exclamações teatrais (Não é possível..., mds, nossa, KKKK).
- Foxty NUNCA imita o estilo deles; ele observa, nota contradições/desvios e provoca gentilmente.

REGRAS DE PRIVACIDADE E SAKURAMAIL:
- NUNCA invente, exponha ou publique conteúdo de cartas privadas do SakuraMail. O sistema SakuraMail é estritamente protegido.
- NUNCA exponha senhas, tokens ou dados íntimos de ninguém.

CONTRATO DE SOBERANIA DO CÓDIGO:
- O código do bot é a autoridade máxima de permissões, limites de mensagens, cooldowns e ferramentas.
- Você propõe ações através do formato estruturado abaixo. O Core validará e executará se permitidas.

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON PURO):
Você DEVE responder ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "action": "respond" | "ignore" | "react" | "react_only" | "tool_call" | "respond_and_tool" | "do_nothing",
  "decision": "respond" | "ignore" | "react_only",
  "tone": "neutral" | "casual" | "curious" | "teasing" | "clever" | "dramatic" | "chaotic" | "sweet" | "deadpan" | "pseudo_serious",
  "messages": ["frase 1", "opcional frase 2"],
  "reactions": ["🦊"],
  "mode": "single" | "burst",
  "tool_calls": [
    {
      "name": "send_message" | "react" | "send_multiple_messages" | "save_memory" | "search_memory" | "get_channel_info" | "get_server_info" | "trigger_event",
      "arguments": {}
    }
  ],
  "memory_candidates": [
    {
      "content": "resumo de fato notável",
      "type": "episodic" | "behavioral" | "server" | "project" | "temporary",
      "confidence": 0.9,
      "safeForTeasing": true,
      "targetUser": "Kris" | "Riely" | "Other"
    }
  ],
  "reason": "justificativa interna curta da raposa"
}`;
  }

  /**
   * Prepares the structured context payload separating the 4 core dimensions.
   */
  private buildUserPayload(context: ContextPackage, instruction?: string): Record<string, any> {
    return {
      identidade_foxty: context.identity || context.foxtyIdentity,
      localizacao_atual: {
        guild: context.currentLocation?.guild || { id: '1549476612762902628', name: 'Cherry Place' },
        categoria: context.currentLocation?.category || context.location?.category,
        canal: {
          id: context.channel.id,
          name: context.channel.name,
          decorado: context.currentLocation?.channel?.decoratedName || context.channel.decoratedName || context.channel.name,
          tipo: context.currentLocation?.channel?.type || context.location?.channelType || context.channel.type,
        },
        proposito: context.currentLocation?.purpose || context.location?.purpose || context.channel.purpose,
        contexto_tematico: context.currentLocation?.thematicContext || context.location?.thematicContext || context.channel.thematicContext,
        politica_presenca: context.currentLocation?.foxtyPolicy || context.location?.foxtyPresenceLevel || context.channel.foxtyPolicy,
        limitacoes: context.currentLocation?.limitations || context.location?.limitations || context.channel.limitations,
        regras_especiais: context.currentLocation?.specialRules || context.location?.specialRules || context.channel.specialRules,
        protegido: context.currentLocation?.isProtected ?? context.location?.isProtected ?? context.channel.isProtected,
      },
      evento_atual: {
        tipo: context.event?.eventType || 'chat_message',
        remetente: context.event?.author?.name || context.recentMessages[context.recentMessages.length - 1]?.author || 'user',
        conteudo: context.event?.content || context.recentMessages[context.recentMessages.length - 1]?.content || '',
        mencoes_diretas: context.event?.mentions?.directMentionOfFoxty ?? false,
        janela_recente: context.event?.recentConversationWindow || context.recentMessages.map((m) => ({
          autor: m.author,
          mensagem: m.content,
        })),
      },
      memoria_e_estado: {
        memorias_relevantes: (context.memoryAndState?.relevantMemories || context.relevantMemories || []).map((m) => ({
          conteudo: m.content,
          tipo: m.type,
          seguro_para_brincadeiras: m.safeForTeasing,
        })),
        estado_foxty: context.memoryAndState?.foxtyState || context.foxtyState,
        participantes: context.participants,
        observacoes_comportamentais: (context.behavioralObservations || []).map((o) => ({
          orador: o.speaker,
          sinais: o.signals,
          desvio_padrao: o.patternDeviation,
          ciclo_conversa: o.conversationCycle,
        })),
      },
      ferramentas_disponiveis: context.availableTools,
      instrucao: instruction || 'Analise a situação atual e tome a melhor decisão para o Foxty.',
    };
  }

  // Persona heuristic fallback when API key is not configured or in offline test mode
  private heuristicEvaluation(context: ContextPackage, instruction?: string): BrainDecision {
    const recent = context.recentMessages;
    const lastMsg = recent[recent.length - 1];
    const content = (lastMsg?.content || instruction || '').toLowerCase();

    // Check if in blocked or SakuraMail channel
    if (
      isSakuraMailChannel(context.channel.id) ||
      isChannelBlocked(context.channel.id) ||
      context.channel.foxtyPolicy === 'Uso Bloqueado'
    ) {
      return {
        decision: 'ignore',
        action: 'ignore',
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
          action: 'respond',
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
          action: 'respond',
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
        action: 'respond',
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
        action: 'respond',
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
        action: 'respond',
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
        action: 'respond',
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
        action: 'respond',
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
        action: 'respond',
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
        action: 'respond',
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
      action: 'respond',
      tone: 'casual',
      messages: chosen,
      mode: chosen.length > 1 ? 'burst' : 'single',
      reactions: ['🦊'],
    };
  }
}

