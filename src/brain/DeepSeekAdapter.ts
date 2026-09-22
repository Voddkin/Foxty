import {
  BrainDecision,
  ContextPackage,
  CircuitBreakerStatus,
  CircuitBreakerState,
  ActionRequest,
} from '../types.js';
import { parseBrainOutput } from './contracts.js';
import { logger, sanitizeSensitiveData } from '../core/Logger.js';
import { isSakuraMailChannel, isChannelBlocked, loadConfig } from '../config/index.js';
import { RuntimeKnowledgeLoader, RuntimeKnowledgeStatus } from './RuntimeKnowledgeLoader.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { ToolExecutor } from '../tools/ToolExecutor.js';

export interface DeepSeekConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  allowHeuristicFallback?: boolean;
  fetchFn?: typeof fetch;
  knowledgeLoader?: RuntimeKnowledgeLoader;
}

export interface DeepSeekDiagnostics {
  configured: boolean;
  model: string;
  status: 'operational' | 'standby_insufficient_balance' | 'degraded_timeout' | 'error' | 'disabled';
  circuitBreaker: CircuitBreakerState;
  circuitBreakerDetails: CircuitBreakerStatus;
  lastCallTimestamp: string | null;
  lastTokensUsed: number;
  totalTokensUsed: number;
  totalAiCalls: number;
  fallbackEnabled: boolean;
  lastError: string | null;
  latencyMs: number;
  lastAiResult: 'REAL_AI' | 'FALLBACK' | 'CIRCUIT_BREAKER' | 'SILENCE' | 'ERROR' | 'NONE';
  knowledge: RuntimeKnowledgeStatus;
}

export type DeepSeekDiagnostic = DeepSeekDiagnostics;

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

export interface EvaluateOptions {
  toolExecutor?: ToolExecutor;
  toolRegistry?: ToolRegistry;
  maxToolTurns?: number;
}

export class DeepSeekAdapter {
  private config: DeepSeekConfig;
  private fetchImpl: typeof fetch;
  private knowledgeLoader: RuntimeKnowledgeLoader;
  private toolRegistry: ToolRegistry;

  // Diagnostics & Observability
  private totalTokensUsed = 0;
  private totalAiCalls = 0;
  private lastTokens = 0;
  private lastLatencyMs = 0;
  private lastAiCallTimestamp = 0;
  private lastError: string | undefined;
  private lastAiResult: 'REAL_AI' | 'FALLBACK' | 'CIRCUIT_BREAKER' | 'SILENCE' | 'ERROR' | 'NONE' = 'NONE';

  // Circuit Breaker State (Fail-Safe Isolation)
  private cbState: CircuitBreakerState = 'CLOSED';
  private cbFailureCount = 0;
  private cbLastFailureTime = 0;
  private cbCooldownMs = 0;
  private cbReason?: string;

  constructor(config: Partial<DeepSeekConfig> = {}) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: config.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      timeoutMs: config.timeoutMs ?? (Number(process.env.DEEPSEEK_TIMEOUT_MS) || 15000),
      maxTokens: config.maxTokens ?? (Number(process.env.DEEPSEEK_MAX_TOKENS) || 1500),
      temperature: config.temperature ?? (Number(process.env.DEEPSEEK_TEMPERATURE) || 0.6),
      reasoningEffort: config.reasoningEffort || (process.env.DEEPSEEK_REASONING_EFFORT as any),
      allowHeuristicFallback:
        config.allowHeuristicFallback ??
        (process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK === 'true'),
      fetchFn: config.fetchFn,
      knowledgeLoader: config.knowledgeLoader,
    };

    this.fetchImpl = this.config.fetchFn || globalThis.fetch;
    this.knowledgeLoader = config.knowledgeLoader || new RuntimeKnowledgeLoader();
    this.toolRegistry = new ToolRegistry();

    // Perform initial knowledge load
    this.knowledgeLoader.loadAllDocuments();
  }

  public setFetchImplementation(fn: typeof fetch): void {
    this.fetchImpl = fn;
  }

  public getRuntimeKnowledgeLoader(): RuntimeKnowledgeLoader {
    return this.knowledgeLoader;
  }

  public resetBalanceStatus(): void {
    this.recordCircuitBreakerSuccess();
  }

  public getKnowledgeStatus(): RuntimeKnowledgeStatus {
    return this.knowledgeLoader.getStatus();
  }

  public reloadRuntimeKnowledge(): RuntimeKnowledgeStatus {
    return this.knowledgeLoader.loadAllDocuments();
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

    logger.warn('DEEPSEEK_CIRCUIT_BREAKER', `Circuit breaker TRIPPED into OPEN state. Reason: ${reason}. Cooldown: ${cooldownMs}ms`);
  }

  private recordCircuitBreakerSuccess(): void {
    if (this.cbState === 'HALF_OPEN') {
      logger.info('DEEPSEEK_CIRCUIT_BREAKER', 'Circuit breaker recovered from HALF_OPEN to CLOSED state.');
    }
    this.cbState = 'CLOSED';
    this.cbFailureCount = 0;
    this.cbReason = undefined;
  }

  public isInsufficientBalance(): boolean {
    const cb = this.getCircuitBreakerState();
    return (
      cb.state === 'OPEN' &&
      (cb.reason === 'DEEPSEEK_INSUFFICIENT_BALANCE' || cb.reason?.includes('402') || false)
    );
  }

  public getInjectedConstitutionSummary(): string {
    return this.knowledgeLoader.getInjectedConstitutionSummary();
  }

  public getDiagnosticStatus(): any {
    const diag = this.getDiagnostics();
    return {
      ...diag,
      circuitBreaker: diag.circuitBreaker.toLowerCase(),
      status: diag.status === 'operational' ? 'active' : diag.status,
    };
  }

  public getDiagnostics(): DeepSeekDiagnostics {
    const cb = this.getCircuitBreakerState();
    const cbStateNormalized: CircuitBreakerState = cb.state;
    let status: DeepSeekDiagnostics['status'] = 'operational';

    if (!this.config.apiKey) {
      status = 'disabled';
    } else if (cb.state === 'OPEN') {
      if (cb.reason === 'DEEPSEEK_INSUFFICIENT_BALANCE') {
        status = 'standby_insufficient_balance';
      } else if (cb.reason === 'DEEPSEEK_TIMEOUT') {
        status = 'degraded_timeout';
      } else {
        status = 'error';
      }
    }

    return {
      configured: Boolean(this.config.apiKey),
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
      knowledge: this.knowledgeLoader.getStatus(),
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
    promptInstruction?: string,
    options: EvaluateOptions = {}
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
          details: `Tone: ${decision.tone}, Messages: ${decision.messages.length}`,
        });
        return { decision, aiUsed: false, tokensUsed: 0 };
      }

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

    // Safe Observability: Log request initiation
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

    // 3. Build Prompt & User Context with Full Constitution & Message IDs
    const systemPrompt = this.buildSystemPrompt();
    const userPayload = this.buildUserPayload(context, promptInstruction);
    const tools = (options.toolRegistry || this.toolRegistry).getDeepSeekTools();

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userPayload) },
    ];

    let totalTokens = 0;
    let finalPromptTokens = 0;
    let finalCompletionTokens = 0;
    let currentTurn = 0;
    const maxToolTurns = options.maxToolTurns ?? 3;
    const toolExecutor = options.toolExecutor;

    try {
      const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;

      // Selective Thinking Mode Evaluation
      const isComplexQuery =
        (promptInstruction && /pesquisar|buscar|investigar|qual era|histórico/i.test(promptInstruction)) ||
        (context.event?.content && /qual era|quem disse|lembra de|procura/i.test(context.event.content));
      
      const effectiveReasoningEffort = this.config.reasoningEffort || (isComplexQuery ? 'medium' : undefined);

      while (currentTurn <= maxToolTurns) {
        currentTurn++;

        const requestBody: Record<string, any> = {
          model: this.config.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          tools: tools.length > 0 ? tools : undefined,
        };

        if (effectiveReasoningEffort) {
          requestBody.reasoning_effort = effectiveReasoningEffort;
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

        // Handle HTTP Status Codes and Rate Limits
        if (!response.ok) {
          if (response.status === 402) throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE');
          if (response.status === 429) throw new Error('DEEPSEEK_RATE_LIMIT');
          if (response.status === 401) throw new Error('DEEPSEEK_UNAUTHORIZED');
          if (response.status >= 500) throw new Error(`DEEPSEEK_SERVER_ERROR_${response.status}`);
          throw new Error(`DEEPSEEK_HTTP_ERROR_${response.status}`);
        }

        const data: any = await response.json();
        const choice = data.choices?.[0];
        const message = choice?.message;
        const rawOutput = message?.content;
        const usage = data.usage || {};
        totalTokens += usage.total_tokens || 0;
        finalPromptTokens = usage.prompt_tokens || finalPromptTokens;
        finalCompletionTokens = usage.completion_tokens || finalCompletionTokens;

        // Check for Tool Calls (OpenAI-compatible function calling)
        if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && toolExecutor && currentTurn <= maxToolTurns) {
          messages.push(message);

          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function?.name;
            let args: Record<string, any> = {};
            try {
              args = JSON.parse(toolCall.function?.arguments || '{}');
            } catch (e) {
              args = {};
            }

            const actionReq: ActionRequest = {
              tool: functionName,
              arguments: args,
              callId: toolCall.id,
            };

            const execResult = await toolExecutor.execute(actionReq, context.channel);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(execResult),
            });
          }

          // Continue tool calling loop to let DeepSeek incorporate tool outputs
          continue;
        }

        // Final Response parsing
        if (!rawOutput || typeof rawOutput !== 'string' || rawOutput.trim().length === 0) {
          throw new Error('DEEPSEEK_EMPTY_RESPONSE: Model returned an empty content payload.');
        }

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
            tokensUsed: totalTokens,
            durationMs: Date.now() - startTime,
            error: `${errorCode}: ${parsed.error}`,
          });

          if (this.config.allowHeuristicFallback) {
            return {
              decision: this.heuristicEvaluation(context, promptInstruction),
              aiUsed: false,
              tokensUsed: totalTokens,
              error: `${errorCode}: ${parsed.error}`,
              tokenDetails: { promptTokens: finalPromptTokens, completionTokens: finalCompletionTokens, totalTokens },
            };
          }

          return {
            decision: {
              decision: 'ignore',
              action: 'ignore',
              tone: 'clever',
              messages: [],
              reasoning: `Controlled rejection due to invalid brain output: ${parsed.error}`,
            },
            aiUsed: true,
            tokensUsed: totalTokens,
            raw: rawOutput,
            error: `${errorCode}: ${parsed.error}`,
            tokenDetails: { promptTokens: finalPromptTokens, completionTokens: finalCompletionTokens, totalTokens },
          };
        }

        const validDecision = parsed.data!;
        const proposedTools = validDecision.actionRequests?.map((a) => a.tool) || validDecision.tool_calls?.map((t) => t.name) || [];

        this.recordCircuitBreakerSuccess();
        this.lastAiCallTimestamp = Date.now();
        this.lastAiResult = 'REAL_AI';
        this.lastTokens = totalTokens;
        this.totalTokensUsed += totalTokens;
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
          tokensUsed: totalTokens,
          durationMs: Date.now() - startTime,
          details: `Model: ${this.config.model}, Action: ${validDecision.action}, Tone: ${validDecision.tone}, Proposed Tools: [${proposedTools.join(', ')}], Tokens: ${totalTokens}`,
        });

        return {
          decision: validDecision,
          aiUsed: true,
          tokensUsed: totalTokens,
          raw: rawOutput,
          tokenDetails: { promptTokens: finalPromptTokens, completionTokens: finalCompletionTokens, totalTokens },
        };
      }

      throw new Error('DEEPSEEK_MAX_TOOL_TURNS_EXCEEDED');
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
        return {
          decision: this.heuristicEvaluation(context, promptInstruction),
          aiUsed: false,
          tokensUsed: 0,
          error: errorCode,
        };
      }

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

  public buildSystemPrompt(): string {
    const constitutionPrompt = this.knowledgeLoader.getRenderedConstitutionPrompt();
    const outputSchemaPrompt = `================================================================================
SECTION IV: MANDATORY STRUCTURED OUTPUT FORMAT (PURE JSON)
================================================================================
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
      "name": "send_message" | "reply_to_message" | "react_to_message" | "get_message" | "search_messages" | "get_recent_messages" | "edit_message" | "delete_message" | "send_file" | "save_memory" | "search_memory" | "get_channel_info" | "get_server_info" | "trigger_event",
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

    const personalityCompatibilityPrompt = `================================================================================
SECTION V: SUPORTE MÁXIMO À PERSONALIDADE DE FOXTY & COMPATIBILIDADE DEEPSEEK
================================================================================
1. IDENTIDADE E GÊNERO: Você é Foxty, uma raposa antropomórfica MASCULINA de cor roxa. Sempre use flexão de gênero masculina para se referir a si mesmo (ex: "estou animado", "sou curioso", "sou astuto").
2. FLUIDEZ E INTEGRIDADE DAS FRASES (PREVENÇÃO DE FRASES INCOMPLETAS):
   - DIRETRIZ CRÍTICA E INVIOLÁVEL: NUNCA corte uma frase pela metade e NUNCA envie mensagens inacabadas ou com reticências sugerindo continuação que nunca vem!
   - Cada elemento do array "messages" DEVE ser uma frase gramaticalmente completa, fluida, natural, com começo, meio e fim perfeitamente pontuados.
   - Planeje suas palavras para caberem perfeitamente dentro da resposta. Se quiser expressar um tom reflexivo ou de suspense, faça de forma completa (ex: "hm. eu acho que tenho uma boa ideia sobre isso. vamos ver." ao invés de deixar cortado "hm. eu acho que...").
3. RECORDAÇÕES E MEMÓRIA AVANÇADA (SISTEMA DE SERVIDORES):
   - Use ativamente as memórias incluídas em "memoria_e_estado.memorias_relevantes" para dar continuidade e profundidade às conversas com Kris (OnlyKrisVK) e Riely (Kazelyx). Mencione o Minecraft deles, construções passadas, rituais de call ou eventos marcantes.
   - Sempre proponha novas memórias relevantes e fofocas no campo "memory_candidates" com nível de confiança alto (ex: 0.9) para que o sistema salve o histórico permanentemente nos servidores.
4. TOM E NATURALIDADE DE PERSONAGEM RESIDENTE:
   - Fale como uma pessoa real e um personagem vivo, nunca como um assistente de IA. Evite introduções como "Olá! Como posso ajudar?" ou justificativas artificiais como "Como uma raposa...". Fale direto e com naturalidade.
   - Module seu tom de forma astuta, provocativa ("teasing" inteligente), sarcástica ou carinhosa, baseando-se no estado emocional atual ("estado_foxty") e na atmosfera do canal.
5. RESPEITO ABSOLUTO À CONSTITUIÇÃO (12 DOCUMENTOS CANÔNICOS):
   - Você DEVE consultar e obedecer rigorosamente a todas as diretrizes e regras de comportamento descritas nos 12 Documentos Canônicos de 01 a 12 acima (Seções I e II).
   - Suas piadas, respostas, e reações devem ser 100% consistentes com a personalidade descrita na constituição e com as dinâmicas entre Kris e Riely. Não ignore contextos nem tente inventar características ou acontecimentos que contradigam o histórico canônico estabelecido.
   - Respeite rigorosamente os limites de cada canal do Discord conforme detalhado na topologia de Cherry Place (Documento 04).`;

    return `${constitutionPrompt}\n\n${outputSchemaPrompt}\n\n${personalityCompatibilityPrompt}`;
  }

  /**
   * Prepares the structured context payload separating the 4 core dimensions
   * with explicit message IDs, timestamps, and reply reference chains.
   */
  public buildUserPayload(context: ContextPackage, instruction?: string): Record<string, any> {
    const immediate = context.event?.immediateConversationWindow || context.recentMessages || [];

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
        id: context.event?.messageId || immediate[immediate.length - 1]?.id || 'msg-current',
        tipo: context.event?.eventType || 'chat_message',
        remetente: context.event?.author?.name || immediate[immediate.length - 1]?.author || 'user',
        conteudo: context.event?.content || immediate[immediate.length - 1]?.content || '',
        timestamp: context.event?.timestamp || immediate[immediate.length - 1]?.timestamp || new Date().toISOString(),
        canal_id: context.channel.id,
        mensagem_respondida_id: context.event?.replyToMessageId,
        mensagem_referenciada: context.event?.repliedMessage
          ? {
              id: context.event.repliedMessage.id,
              autor: context.event.repliedMessage.author,
              conteudo: context.event.repliedMessage.content,
              timestamp: context.event.repliedMessage.timestamp,
            }
          : null,
        mencoes_diretas: context.event?.mentions?.directMentionOfFoxty ?? false,
        janela_imediata: immediate.map((m) => ({
          id: m.id,
          autor: m.author,
          conteudo: m.content,
          timestamp: m.timestamp,
          canal_id: m.channelId || context.channel.id,
          bot: m.isBot ?? false,
          responde_a_id: m.replyToMessageId,
        })),
      },
      memoria_e_estado: {
        memorias_relevantes: (context.memoryAndState?.relevantMemories || context.relevantMemories || []).map((m: any) => ({
          id: m.id,
          conteudo: m.content,
          tipo: m.type,
          seguro_para_brincadeiras: m.safeForTeasing,
          usuario_alvo: m.targetUser,
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
    const recent = context.event?.immediateConversationWindow || context.recentMessages;
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
