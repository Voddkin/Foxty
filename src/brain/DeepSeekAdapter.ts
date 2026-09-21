import { BrainDecision, ContextPackage, ThinkingMode, ReasoningEffort } from '../types.js';
import { parseBrainOutput } from './contracts.js';
import { logger, sanitizeSensitiveData } from '../core/Logger.js';
import { isSakuraMailChannel, isChannelBlocked, loadConfig } from '../config/index.js';

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

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  reason?: string;
  cooldownRemainingMs: number;
  lastFailureTime?: number;
}

export interface DeepSeekDiagnostic {
  configured: boolean;
  baseUrl: string;
  model: string;
  status: 'active' | 'standby_insufficient_balance' | 'error' | 'disabled';
  circuitBreaker: 'open' | 'closed' | 'half_open';
  circuitBreakerDetails?: CircuitBreakerStatus;
  lastCallTimestamp: string | null;
  lastTokensUsed: number;
  totalTokensUsed: number;
  totalAiCalls: number;
  fallbackEnabled: boolean;
  lastError: string | null;
  latencyMs: number;
  lastAiResult: 'REAL_AI' | 'FALLBACK' | 'SILENCE' | 'ERROR' | 'CIRCUIT_BREAKER' | 'NONE';
}

export interface DeepSeekTestResult {
  success: boolean;
  hasApiKey: boolean;
  model: string;
  endpoint: string;
  status: number | string;
  latencyMs: number;
  tokensUsed: number;
  promptTokens?: number;
  completionTokens?: number;
  replySample?: string;
  circuitBreakerState: CircuitBreakerState;
  error?: string;
}

export class DeepSeekAdapter {
  private config: Required<Omit<DeepSeekConfig, 'apiKey' | 'reasoningEffort' | 'fetchFn'>> & {
    apiKey?: string;
    reasoningEffort?: ReasoningEffort;
  };
  private fetchImpl: typeof fetch;

  // Circuit Breaker State
  private cbState: CircuitBreakerState = 'CLOSED';
  private cbFailureCount: number = 0;
  private cbLastFailureTime: number = 0;
  private cbCooldownMs: number = 0;
  private cbReason?: string;

  // Diagnostics & Observability
  private lastAiCallTimestamp?: number;
  private lastAiResult: 'REAL_AI' | 'FALLBACK' | 'SILENCE' | 'ERROR' | 'CIRCUIT_BREAKER' | 'NONE' = 'NONE';
  private lastTokens: number = 0;
  private totalTokensUsed: number = 0;
  private totalAiCalls: number = 0;
  private lastError?: string;
  private lastLatencyMs: number = 0;

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

  public getCircuitBreakerState(): CircuitBreakerStatus {
    const now = Date.now();
    let effectiveState = this.cbState;
    let cooldownRemaining = 0;

    if (this.cbState === 'OPEN') {
      const elapsed = now - this.cbLastFailureTime;
      if (elapsed >= this.cbCooldownMs) {
        effectiveState = 'HALF_OPEN';
        this.cbState = 'HALF_OPEN';
      } else {
        cooldownRemaining = this.cbCooldownMs - elapsed;
      }
    }

    return {
      state: effectiveState,
      failureCount: this.cbFailureCount,
      reason: this.cbReason,
      cooldownRemainingMs: Math.max(0, cooldownRemaining),
      lastFailureTime: this.cbLastFailureTime || undefined,
    };
  }

  public resetCircuitBreaker(): void {
    this.cbState = 'CLOSED';
    this.cbFailureCount = 0;
    this.cbLastFailureTime = 0;
    this.cbCooldownMs = 0;
    this.cbReason = undefined;
  }

  private tripCircuitBreaker(reason: string, cooldownMs: number): void {
    this.cbState = 'OPEN';
    this.cbFailureCount++;
    this.cbLastFailureTime = Date.now();
    this.cbCooldownMs = cooldownMs;
    this.cbReason = reason;
  }

  private recordCircuitBreakerSuccess(): void {
    this.cbState = 'CLOSED';
    this.cbFailureCount = 0;
    this.cbReason = undefined;
    this.cbCooldownMs = 0;
  }

  public isInsufficientBalance(): boolean {
    const cb = this.getCircuitBreakerState();
    return cb.state === 'OPEN' && cb.reason === 'DEEPSEEK_INSUFFICIENT_BALANCE';
  }

  public resetBalanceStatus(): void {
    this.resetCircuitBreaker();
  }

  public getDiagnosticStatus(): DeepSeekDiagnostic {
    const cb = this.getCircuitBreakerState();
    let status: 'active' | 'standby_insufficient_balance' | 'error' | 'disabled' = 'active';
    if (!this.config.apiKey) {
      status = 'disabled';
    } else if (cb.state === 'OPEN' && cb.reason === 'DEEPSEEK_INSUFFICIENT_BALANCE') {
      status = 'standby_insufficient_balance';
    } else if (cb.state === 'OPEN' || (this.lastError && this.lastAiResult === 'ERROR')) {
      status = 'error';
    }

    const cbStateNormalized = cb.state.toLowerCase() as 'open' | 'closed' | 'half_open';

    return {
      configured: Boolean(this.config.apiKey),
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      status,
      circuitBreaker: cbStateNormalized,
      circuitBreakerDetails: cb,
      lastCallTimestamp: this.lastAiCallTimestamp ? new Date(this.lastAiCallTimestamp).toISOString() : null,
      lastTokensUsed: this.lastTokens,
      totalTokensUsed: this.totalTokensUsed,
      totalAiCalls: this.totalAiCalls,
      fallbackEnabled: Boolean(this.config.allowHeuristicFallback),
      lastError: this.lastError ? sanitizeSensitiveData(this.lastError) : null,
      latencyMs: this.lastLatencyMs || 0,
      lastAiResult: this.lastAiResult,
    };
  }

  public async testDeepSeekConnection(): Promise<DeepSeekTestResult> {
    const startTime = Date.now();
    const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    if (!this.config.apiKey) {
      return {
        success: false,
        hasApiKey: false,
        model: this.config.model,
        endpoint,
        status: 'MISSING_API_KEY',
        latencyMs: 0,
        tokensUsed: 0,
        circuitBreakerState: this.getCircuitBreakerState().state,
        error: 'DEEPSEEK_API_KEY is not configured in environment',
      };
    }

    const cbState = this.getCircuitBreakerState();
    if (cbState.state === 'OPEN') {
      return {
        success: false,
        hasApiKey: true,
        model: this.config.model,
        endpoint,
        status: 'CIRCUIT_BREAKER_OPEN',
        latencyMs: 0,
        tokensUsed: 0,
        circuitBreakerState: 'OPEN',
        error: `Circuit breaker is OPEN: ${cbState.reason} (cooldown remaining: ${Math.round(cbState.cooldownRemainingMs / 1000)}s)`,
      };
    }

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Ping: return JSON {"status":"ok"}' }],
          response_format: { type: 'json_object' },
          max_tokens: 30,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 402) {
          this.tripCircuitBreaker('DEEPSEEK_INSUFFICIENT_BALANCE', 60000);
        } else if (response.status === 401) {
          this.tripCircuitBreaker('DEEPSEEK_UNAUTHORIZED', 60000);
        } else if (response.status === 429) {
          this.tripCircuitBreaker('DEEPSEEK_RATE_LIMIT', 30000);
        } else if (response.status >= 500) {
          this.tripCircuitBreaker(`DEEPSEEK_SERVER_ERROR_${response.status}`, 20000);
        }

        return {
          success: false,
          hasApiKey: true,
          model: this.config.model,
          endpoint,
          status: response.status,
          latencyMs,
          tokensUsed: 0,
          circuitBreakerState: this.getCircuitBreakerState().state,
          error: `HTTP_${response.status}`,
        };
      }

      const data: any = await response.json();
      const usage = data.usage || {};
      const tokensUsed = usage.total_tokens || 0;
      const sample = data.choices?.[0]?.message?.content?.substring(0, 100);

      this.recordCircuitBreakerSuccess();

      return {
        success: true,
        hasApiKey: true,
        model: this.config.model,
        endpoint,
        status: 200,
        latencyMs,
        tokensUsed,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        replySample: sample,
        circuitBreakerState: 'CLOSED',
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout');
      if (isTimeout) {
        this.tripCircuitBreaker('DEEPSEEK_TIMEOUT', 15000);
      } else {
        this.cbFailureCount++;
      }

      return {
        success: false,
        hasApiKey: true,
        model: this.config.model,
        endpoint,
        status: 'ERROR',
        latencyMs,
        tokensUsed: 0,
        circuitBreakerState: this.getCircuitBreakerState().state,
        error: err.message || 'Connection test failed',
      };
    }
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
      this.lastAiResult = 'SILENCE';
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
        this.lastAiResult = 'FALLBACK';
        this.lastTokens = 0;
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

      this.lastAiResult = 'SILENCE';
      this.lastTokens = 0;
      this.lastError = 'DEEPSEEK_API_KEY_MISSING';
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

    // 2b. Circuit Breaker Active Check (Standby Mode)
    const cbState = this.getCircuitBreakerState();
    if (cbState.state === 'OPEN') {
      const errorCode = cbState.reason || 'DEEPSEEK_CIRCUIT_BREAKER_OPEN';
      if (this.config.allowHeuristicFallback) {
        this.lastAiResult = 'FALLBACK';
        this.lastTokens = 0;
        this.lastError = errorCode;
        const decision = this.heuristicEvaluation(context, promptInstruction);
        logger.log({
          event: `DeepSeek Brain Circuit Breaker OPEN (${errorCode} - Heuristic Fallback Active)`,
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

      this.lastAiResult = 'CIRCUIT_BREAKER';
      this.lastTokens = 0;
      this.lastError = errorCode;
      logger.log({
        event: `DeepSeek Brain Circuit Breaker OPEN (Inaction Enforced: ${errorCode})`,
        channelId: context.channel.id,
        actionType: 'BRAIN_EVALUATION',
        decision: 'CIRCUIT_BREAKER',
        success: false,
        aiUsed: false,
        durationMs: Date.now() - startTime,
        error: errorCode,
        details: `Reason: ${cbState.reason}, Cooldown remaining: ${Math.round(cbState.cooldownRemainingMs / 1000)}s`,
      });

      return {
        decision: {
          decision: 'ignore',
          action: 'ignore',
          tone: 'neutral',
          messages: [],
          reasoning: `DeepSeek circuit breaker OPEN (${errorCode}). Inaction safely enforced.`,
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
      this.recordCircuitBreakerSuccess();
      this.lastAiCallTimestamp = Date.now();
      this.lastAiResult = 'REAL_AI';
      this.lastTokens = tokensUsed;
      this.totalTokensUsed += tokensUsed;
      this.totalAiCalls++;
      this.lastLatencyMs = Date.now() - startTime;
      this.lastError = undefined;

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
        this.tripCircuitBreaker('DEEPSEEK_TIMEOUT', 15000);
      } else if (isInsufficientBalance) {
        errorCode = 'DEEPSEEK_INSUFFICIENT_BALANCE';
        this.tripCircuitBreaker('DEEPSEEK_INSUFFICIENT_BALANCE', 60000);
      } else if (isRateLimit) {
        errorCode = 'DEEPSEEK_RATE_LIMIT';
        this.tripCircuitBreaker('DEEPSEEK_RATE_LIMIT', 30000);
      } else if (isUnauthorized) {
        errorCode = 'DEEPSEEK_UNAUTHORIZED';
        this.tripCircuitBreaker('DEEPSEEK_UNAUTHORIZED', 60000);
      } else {
        this.cbFailureCount++;
        if (this.cbFailureCount >= 2) {
          this.tripCircuitBreaker(errorCode, 20000);
        }
      }
      const durationMs = Date.now() - startTime;
      this.lastLatencyMs = durationMs;
      this.lastTokens = 0;
      this.lastError = errorCode;
      this.lastAiResult = this.config.allowHeuristicFallback ? 'FALLBACK' : 'ERROR';

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

export async function testDeepSeekConnection(adapter?: DeepSeekAdapter): Promise<DeepSeekTestResult> {
  if (adapter) {
    return adapter.testDeepSeekConnection();
  }
  const config = loadConfig();
  const defaultAdapter = new DeepSeekAdapter(config.deepSeek);
  return defaultAdapter.testDeepSeekConnection();
}

