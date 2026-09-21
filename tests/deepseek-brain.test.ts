import assert from 'node:assert';
import { DeepSeekAdapter } from '../src/brain/DeepSeekAdapter.js';
import { parseBrainOutput, normalizeBrainDecision, BrainResponseSchema } from '../src/brain/contracts.js';
import { ContextBuilder } from '../src/core/ContextBuilder.js';
import { InMemoryStore } from '../src/memory/InMemoryStore.js';
import { FoxtyCore } from '../src/core/FoxtyCore.js';
import {
  ChannelInfo,
  ChatMessage,
  ContextPackage,
  FoxtyState,
  BehavioralObservation,
} from '../src/types.js';
import { getChannelById, CHERRY_PLACE_CHANNEL_IDS } from '../src/config/cherryPlaceModel.js';
import { loadConfig } from '../src/config/index.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  })();
}

console.log('\n======================================================');
console.log('🧠 RUNNING AUTHORITATIVE DEEPSEEK BRAIN TEST SUITE (13 MANDATORY SPECS)');
console.log('======================================================\n');

async function runTests() {
  console.log('--- Configuration & Initialization Tests ---');

  // 1. DeepSeekAdapter usa deepseek-chat por default
  await test('1. DeepSeekAdapter uses deepseek-chat by default', () => {
    const adapter = new DeepSeekAdapter({
      baseUrl: 'https://api.deepseek.com',
    });
    assert.strictEqual(adapter.getConfig().model, 'deepseek-chat');
  });

  // 2. API key vem da configuração
  await test('2. API key comes from config', () => {
    const customKey = 'sk-test-secret-key-998877';
    const adapter = new DeepSeekAdapter({
      apiKey: customKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    });
    assert.strictEqual(adapter.getConfig().apiKey, customKey);

    const config = loadConfig();
    assert.ok(typeof config.deepSeek === 'object');
    assert.strictEqual(config.deepSeek.model, 'deepseek-chat');
  });

  // 3. base URL é configurável
  await test('3. Base URL is configurable', () => {
    const customBaseUrl = 'https://custom-proxy.deepseek.internal/v1';
    const adapter = new DeepSeekAdapter({
      apiKey: 'test-key',
      baseUrl: customBaseUrl,
      model: 'deepseek-chat',
    });
    assert.strictEqual(adapter.getConfig().baseUrl, customBaseUrl);
  });

  // 3.1 Semântica de Config: DEEPSEEK_ALLOW_HEURISTIC_FALLBACK=false é mantido mesmo com TEST_MODE=true
  await test('3.1 loadConfig respects DEEPSEEK_ALLOW_HEURISTIC_FALLBACK=false when TEST_MODE=true', () => {
    const origFallback = process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
    const origTestMode = process.env.TEST_MODE;
    try {
      process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK = 'false';
      process.env.TEST_MODE = 'true';
      const cfg = loadConfig();
      assert.strictEqual(cfg.deepSeek.allowHeuristicFallback, false);
    } finally {
      if (origFallback !== undefined) process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK = origFallback;
      else delete process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
      if (origTestMode !== undefined) process.env.TEST_MODE = origTestMode;
      else delete process.env.TEST_MODE;
    }
  });

  // 3.2 Semântica de Config: DEEPSEEK_ALLOW_HEURISTIC_FALLBACK=true é mantido mesmo com TEST_MODE=false
  await test('3.2 loadConfig respects DEEPSEEK_ALLOW_HEURISTIC_FALLBACK=true when TEST_MODE=false', () => {
    const origFallback = process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
    const origTestMode = process.env.TEST_MODE;
    try {
      process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK = 'true';
      process.env.TEST_MODE = 'false';
      const cfg = loadConfig();
      assert.strictEqual(cfg.deepSeek.allowHeuristicFallback, true);
    } finally {
      if (origFallback !== undefined) process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK = origFallback;
      else delete process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
      if (origTestMode !== undefined) process.env.TEST_MODE = origTestMode;
      else delete process.env.TEST_MODE;
    }
  });

  // 3.2b Semântica de Config: Sem DEEPSEEK_ALLOW_HEURISTIC_FALLBACK, o default é false independentemente de TEST_MODE
  await test('3.2b loadConfig defaults DEEPSEEK_ALLOW_HEURISTIC_FALLBACK to false when unset regardless of TEST_MODE', () => {
    const origFallback = process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
    const origTestMode = process.env.TEST_MODE;
    try {
      delete process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
      process.env.TEST_MODE = 'true';
      const cfgTrue = loadConfig();
      assert.strictEqual(cfgTrue.deepSeek.allowHeuristicFallback, false);

      process.env.TEST_MODE = 'false';
      const cfgFalse = loadConfig();
      assert.strictEqual(cfgFalse.deepSeek.allowHeuristicFallback, false);
    } finally {
      if (origFallback !== undefined) process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK = origFallback;
      else delete process.env.DEEPSEEK_ALLOW_HEURISTIC_FALLBACK;
      if (origTestMode !== undefined) process.env.TEST_MODE = origTestMode;
      else delete process.env.TEST_MODE;
    }
  });

  const testMemStore = new InMemoryStore();
  const testCtxBuilder = new ContextBuilder(testMemStore, { recentHistoryLimit: 5, memoryLimit: 3 });
  const testCanonicalChan = getChannelById(CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS)!;
  const testChanInfo: ChannelInfo = {
    id: testCanonicalChan.id,
    name: testCanonicalChan.name,
    category: 'Praça Principal',
    type: 'social',
    isProtected: false,
    allowSpontaneousEvents: true,
    toneGuidance: 'Casual',
    foxtyPolicy: testCanonicalChan.foxtyPolicy,
  };
  const dummyCtx = await testCtxBuilder.buildContext({
    channel: testChanInfo,
    recentMessages: [{ id: '1', author: 'Kris', channelId: testChanInfo.id, content: 'Oi', timestamp: new Date().toISOString(), isBot: false }],
    observations: [],
    state: { mood: 0.8, drama: 0.1, chaos: 0.1, energy: 0.8, suspicion: 0.1, curiosity: 0.8, talkativeness: 0.5 },
    availableTools: ['send_message'],
  });

  // 3.3 Sem chave de API: inação se fallback=false, heurística se fallback=true
  await test('3.3 Missing API key behavior: inaction when fallback=false, heuristic when fallback=true', async () => {
    const adapterNoFallback = new DeepSeekAdapter({ allowHeuristicFallback: false });
    const resNoFallback = await adapterNoFallback.evaluate(dummyCtx);
    assert.strictEqual(resNoFallback.error, 'DEEPSEEK_API_KEY_MISSING');
    assert.strictEqual(resNoFallback.decision.decision, 'ignore');
    assert.strictEqual(resNoFallback.aiUsed, false);

    const adapterWithFallback = new DeepSeekAdapter({ allowHeuristicFallback: true });
    const resWithFallback = await adapterWithFallback.evaluate(dummyCtx);
    assert.strictEqual(resWithFallback.error, undefined);
    assert.strictEqual(resWithFallback.aiUsed, false);
    assert.strictEqual(resWithFallback.decision.decision, 'respond');
  });

  // 3.4 Erro no DeepSeek (500/timeout): inação se fallback=false, heurística se fallback=true
  await test('3.4 DeepSeek error behavior: inaction when fallback=false, heuristic when fallback=true', async () => {
    const mockFailFetch = (async () => {
      throw new Error('504 Gateway Timeout');
    }) as any;

    const adapterNoFallback = new DeepSeekAdapter({ apiKey: 'sk-test', allowHeuristicFallback: false });
    adapterNoFallback.setFetchImplementation(mockFailFetch);
    const resNoFallback = await adapterNoFallback.evaluate(dummyCtx);
    assert.strictEqual(resNoFallback.decision.decision, 'ignore');
    assert.strictEqual(resNoFallback.error, 'DEEPSEEK_TIMEOUT');
    assert.strictEqual(resNoFallback.aiUsed, false);

    const adapterWithFallback = new DeepSeekAdapter({ apiKey: 'sk-test', allowHeuristicFallback: true });
    adapterWithFallback.setFetchImplementation(mockFailFetch);
    const resWithFallback = await adapterWithFallback.evaluate(dummyCtx);
    assert.strictEqual(resWithFallback.error, 'DEEPSEEK_TIMEOUT');
    assert.strictEqual(resWithFallback.aiUsed, false);
    assert.strictEqual(resWithFallback.decision.decision, 'respond');
  });

  // 3.5 Erro HTTP 402 (Insufficient Balance) é normalizado para DEEPSEEK_INSUFFICIENT_BALANCE e ativa circuit breaker
  await test('3.5 DeepSeek HTTP 402 Insufficient Balance is normalized and engages circuit breaker', async () => {
    let callCount = 0;
    const mock402Fetch = (async () => {
      callCount++;
      return {
        ok: false,
        status: 402,
        text: async () => '{"error":{"message":"Insufficient Balance","type":"unknown_error","param":null,"code":"invalid_request_error"}}',
      };
    }) as any;

    const adapter = new DeepSeekAdapter({ apiKey: 'sk-test', allowHeuristicFallback: false });
    adapter.setFetchImplementation(mock402Fetch);

    assert.strictEqual(adapter.isInsufficientBalance(), false);

    // First call encounters 402
    const res1 = await adapter.evaluate(dummyCtx);
    assert.strictEqual(res1.error, 'DEEPSEEK_INSUFFICIENT_BALANCE');
    assert.strictEqual(res1.decision.decision, 'ignore');
    assert.strictEqual(callCount, 1);
    assert.strictEqual(adapter.isInsufficientBalance(), true);

    // Second call engages circuit breaker without making an HTTP request
    const res2 = await adapter.evaluate(dummyCtx);
    assert.strictEqual(res2.error, 'DEEPSEEK_INSUFFICIENT_BALANCE');
    assert.strictEqual(res2.decision.decision, 'ignore');
    assert.strictEqual(callCount, 1); // No new fetch call made!

    // Reset allows re-attempt
    adapter.resetBalanceStatus();
    assert.strictEqual(adapter.isInsufficientBalance(), false);
  });

  console.log('\n--- Output Validation & Schema Tests ---');

  // 4. resposta JSON válida é convertida para o tipo interno
  await test('4. Valid JSON response is converted to internal BrainDecision type', () => {
    const raw = JSON.stringify({
      action: 'respond_and_tool',
      decision: 'respond',
      tone: 'teasing',
      messages: ['Riely construindo outra fazenda? 🦊', 'A última levou semanas.'],
      reactions: ['🦊', '👀'],
      mode: 'burst',
      tool_calls: [
        {
          name: 'send_message',
          arguments: { channel_id: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS, content: 'mensagem teste' },
        },
      ],
      memory_candidates: [
        {
          content: 'Riely começou nova fazenda',
          type: 'project',
          confidence: 0.95,
          safeForTeasing: true,
          targetUser: 'Riely',
        },
      ],
      reason: 'Observação pontual de projeto em andamento.',
    });

    const result = parseBrainOutput(raw);
    assert.strictEqual(result.success, true);
    assert.ok(result.data);
    assert.strictEqual(result.data.decision, 'respond');
    assert.strictEqual(result.data.action, 'respond_and_tool');
    assert.strictEqual(result.data.tone, 'teasing');
    assert.strictEqual(result.data.messages.length, 2);
    assert.strictEqual(result.data.reactions?.length, 2);
    assert.strictEqual(result.data.tool_calls?.length, 1);
    assert.strictEqual(result.data.memoryCandidates?.length, 1);
    assert.strictEqual(result.data.reasoning, 'Observação pontual de projeto em andamento.');
  });

  // 5. JSON inválido é rejeitado
  await test('5. Invalid JSON string is rejected with controlled error', () => {
    const raw = 'Desculpe, como um modelo de IA eu não posso responder em JSON.';
    const result = parseBrainOutput(raw);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Malformed JSON') || result.error?.includes('validation failed'));
  });

  // 6. schema inválido é rejeitado
  await test('6. Invalid schema structure is rejected with validation error', () => {
    const raw = JSON.stringify({
      action: 'respond',
      tone: 'unsupported_hallucinated_tone_enum_xyz',
      messages: ['mensagem teste'],
    });

    const result = parseBrainOutput(raw);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('JSON schema validation failed'));
  });

  console.log('\n--- Tool & Policy Guardrail Tests ---');

  const memoryStore = new InMemoryStore();
  const contextBuilder = new ContextBuilder(memoryStore, { recentHistoryLimit: 5, memoryLimit: 3 });
  const canonicalChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS)!;
  const channelInfo: ChannelInfo = {
    id: canonicalChannel.id,
    name: canonicalChannel.name,
    category: 'Praça Principal',
    type: 'social',
    isProtected: false,
    allowSpontaneousEvents: true,
    toneGuidance: 'Casual',
    foxtyPolicy: canonicalChannel.foxtyPolicy,
  };

  const sampleState: FoxtyState = {
    mood: 0.8,
    drama: 0.3,
    chaos: 0.2,
    energy: 0.7,
    suspicion: 0.1,
    curiosity: 0.8,
    talkativeness: 0.6,
  };

  const sampleMessages: ChatMessage[] = [
    { id: '1', author: 'Kris', channelId: channelInfo.id, content: 'Boa tarde!', timestamp: new Date().toISOString(), isBot: false },
    { id: '2', author: 'Riely', channelId: channelInfo.id, content: 'oii', timestamp: new Date().toISOString(), isBot: false },
  ];

  // 7. ferramenta inexistente é rejeitada
  await test('7. Non-existent tool suggested by DeepSeek is rejected by executor/policy', async () => {
    const core = new FoxtyCore(loadConfig());
    const result = await core.getToolExecutor().execute(
      {
        tool: 'hallucinated_unregistered_tool' as any,
        arguments: { some: 'arg' },
      },
      channelInfo
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('unknown tool') || result.error?.includes('Unauthorized'));
  });

  // 8. ferramenta proibida pela política é rejeitada
  await test('8. Tool forbidden by channel policy is rejected by guardrails', async () => {
    const limitedChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.BOAS_VINDAS)!; // Uso Limitado
    const core = new FoxtyCore(loadConfig());

    const { rejected } = core.getChannelBehaviorPolicy().filterProposedTools(
      [
        { tool: 'trigger_event', arguments: { event_id: 'test', channel_id: limitedChannel.id } },
        { tool: 'get_channel_info', arguments: { channel_id: limitedChannel.id } },
      ],
      limitedChannel
    );

    assert.ok(rejected.some((r) => r.action.tool === 'trigger_event'));
  });

  // 9. canal BLOCKED não chama o DeepSeek
  await test('9. BLOCKED channel (caixa-de-correio) never calls DeepSeek API', async () => {
    let apiCalled = false;
    const mockFetch = (async () => {
      apiCalled = true;
      return { ok: true, json: async () => ({ choices: [] }) };
    }) as any;

    const core = new FoxtyCore(loadConfig());
    const adapter = core.getDeepSeekAdapter();
    adapter.setFetchImplementation(mockFetch);

    const res = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO, // Uso Bloqueado
      author: 'Kris',
      content: 'Foxty, leia esta carta!',
      isDirectMention: true,
    });

    assert.strictEqual(apiCalled, false);
    assert.strictEqual(res.decision.decision, 'ignore');
    assert.strictEqual(res.aiUsed, false);
    assert.strictEqual(res.toolResults.length, 0);
  });

  // 10. SakuraMail continua isolado
  await test('10. SakuraMail remains completely isolated from context and brain', async () => {
    // Attempting to ingest a letter with sensitive body
    const core = new FoxtyCore(loadConfig());
    const ingestion = core.handleSakuraMailEvent({
      type: 'letter_opened',
      user: 'Kris',
      body: 'CONFIDENTIAL SECRET PRIVATE LETTER CONTENT 12345',
      channelId: CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO,
    });

    assert.strictEqual(ingestion.accepted, true);
    assert.ok(ingestion.privacyWarning?.includes('stripped') || ingestion.privacyWarning?.includes('PRIVACY'));

    // Verify context builder never leaks letterBody
    const pkg = await core.getContextBuilder().buildContext({
      channel: channelInfo,
      recentMessages: sampleMessages,
      observations: [],
      state: sampleState,
      availableTools: ['send_message'],
    });

    const serialized = JSON.stringify(pkg);
    assert.strictEqual(serialized.includes('CONFIDENTIAL SECRET PRIVATE LETTER CONTENT'), false);
  });

  // 11. erro do DeepSeek não derruba o FoxtyCore
  await test('11. DeepSeek network error, timeout, or 500 error does not crash FoxtyCore', async () => {
    const mockFatalError = (async () => {
      throw new Error('Connection reset by peer / Gateway 504 Timeout');
    }) as any;

    const core = new FoxtyCore(loadConfig());
    const adapter = core.getDeepSeekAdapter();
    adapter.setFetchImplementation(mockFatalError);
    (adapter as any).config.apiKey = 'sk-active-key';
    (adapter as any).config.allowHeuristicFallback = false; // Production mode

    const res = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
      author: 'Kris',
      content: 'Foxty, você está aí?',
      isDirectMention: true,
    });

    assert.strictEqual(res.aiUsed, false);
    assert.strictEqual(res.decision.decision, 'ignore');
    assert.ok(res.state); // State remains intact
  });

  // 12. uma resposta válida percorre todo o fluxo até a camada de execução
  await test('12. Valid response travels entire flow through execution layer', async () => {
    let executedMessage = '';
    const mockDiscordHandler = {
      sendMessage: async (channelId: string, content: string) => {
        executedMessage = content;
        return { messageId: 'msg-executed-7788', success: true };
      },
      react: async () => true,
    };

    const mockFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: 'respond',
                tone: 'clever',
                messages: ['Cheguei bem na hora. 🦊'],
                reactions: ['🦊'],
                tool_calls: [],
                reason: 'Resposta a Kris',
              }),
            },
          },
        ],
        usage: { total_tokens: 88 },
      }),
    })) as any;

    const core = new FoxtyCore(loadConfig());
    core.setDiscordActionHandler(mockDiscordHandler as any);
    const adapter = core.getDeepSeekAdapter();
    adapter.setFetchImplementation(mockFetch);
    (adapter as any).config.apiKey = 'sk-test-key';

    const res = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
      author: 'Kris',
      content: 'Foxty, você viu isso?',
      isDirectMention: true,
      messageId: 'incoming-msg-001',
    });

    assert.strictEqual(res.aiUsed, true);
    assert.strictEqual(res.decision.messages[0], 'Cheguei bem na hora. 🦊');
    assert.strictEqual(executedMessage, 'Cheguei bem na hora. 🦊');
    assert.ok(res.toolResults.some((tr) => tr.tool === 'send_message' && tr.success));
  });

  // 13. o DeepSeek não consegue ultrapassar ChannelBehaviorPolicy
  await test('13. DeepSeek cannot bypass ChannelBehaviorPolicy (burst limit enforced)', async () => {
    // Model proposes 10 messages in a LIMITED channel (where max burst is 1)
    const mockExcessiveFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: 'respond',
                tone: 'chaotic',
                messages: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
                tool_calls: [],
                reason: 'Spam test',
              }),
            },
          },
        ],
        usage: { total_tokens: 150 },
      }),
    })) as any;

    const core = new FoxtyCore(loadConfig());
    let sentCount = 0;
    core.setDiscordActionHandler({
      sendMessage: async () => {
        sentCount++;
        return { messageId: `msg-${sentCount}`, success: true };
      },
      react: async () => true,
    } as any);

    const adapter = core.getDeepSeekAdapter();
    adapter.setFetchImplementation(mockExcessiveFetch);
    (adapter as any).config.apiKey = 'sk-test-key';

    const res = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.IDEIAS_DE_CONSTRUCAO, // Uso Moderado (max burst is 2)
      author: 'Riely',
      content: 'Foxty, conte tudo!',
      isDirectMention: true,
      messageId: 'incoming-burst-test',
    });

    assert.strictEqual(res.aiUsed, true);
    // Channel policy capped burst to 2, DeepSeek's 10 messages were suppressed by Core
    assert.ok(sentCount <= 2);
  });

  console.log('\n--- Internal Integration Simulation ---');

  // 14. Teste de integração completo
  await test('14. Full End-to-End Integration Simulation: Message -> ContextBuilder -> DeepSeekAdapter -> Decision -> FoxtyCore -> ToolRegistry/Executor', async () => {
    const receivedActions: Array<{ tool: string; args: any }> = [];

    const mockDiscordHandler = {
      sendMessage: async (channelId: string, content: string) => {
        receivedActions.push({ tool: 'send_message', args: { channelId, content } });
        return { messageId: 'sim-msg-999', success: true };
      },
      react: async (channelId: string, messageId: string, emoji: string) => {
        receivedActions.push({ tool: 'react', args: { channelId, messageId, emoji } });
        return true;
      },
    };

    let fetchPayloadSent: any = null;
    const mockIntegrationFetch = (async (url: any, opts: any) => {
      fetchPayloadSent = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: 'respond_and_tool',
                  tone: 'teasing',
                  messages: ['Não vi as ferramentas, mas ouvi um barulho na oficina. 🦊'],
                  reactions: ['🔧'],
                  tool_calls: [
                    {
                      name: 'get_channel_info',
                      arguments: { channel_id: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS },
                    },
                  ],
                  memory_candidates: [
                    {
                      content: 'Kris perdeu ferramentas na oficina',
                      type: 'episodic',
                      confidence: 0.9,
                      safeForTeasing: true,
                      targetUser: 'Kris',
                    },
                  ],
                  reason: 'Responde à pergunta com informação e sugestão de ferramenta',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
        }),
      };
    }) as any;

    const core = new FoxtyCore(loadConfig());
    core.setDiscordActionHandler(mockDiscordHandler as any);

    const adapter = core.getDeepSeekAdapter();
    adapter.setFetchImplementation(mockIntegrationFetch);
    (adapter as any).config.apiKey = 'sk-real-integration-key';

    // Ingest simulated message from user
    const interactionResult = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
      author: 'Kris',
      content: 'Foxty, alguém mexeu nas ferramentas da oficina?',
      isDirectMention: true,
      messageId: 'sim-user-msg-001',
    });

    // 1. ContextBuilder Verification
    assert.ok(fetchPayloadSent);
    const userContext = JSON.parse(fetchPayloadSent.messages[1].content);
    assert.strictEqual(userContext.identidade_foxty.name, 'Foxty');
    assert.strictEqual(userContext.localizacao_atual.canal.id, CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS);
    assert.strictEqual(userContext.evento_atual.remetente, 'Kris');

    // 2. Decision Verification
    assert.strictEqual(interactionResult.aiUsed, true);
    assert.strictEqual(interactionResult.tokensUsed, 165);
    assert.strictEqual(interactionResult.decision.decision, 'respond');
    assert.strictEqual(interactionResult.decision.tone, 'teasing');

    // 3. Execution Verification via ToolExecutor
    assert.ok(receivedActions.some((a) => a.tool === 'send_message' && a.args.content.includes('oficina')));
    assert.ok(receivedActions.some((a) => a.tool === 'react' && a.args.emoji === '🔧'));

    // 4. Memory Retention Verification
    const savedMemories = await core.getMemoryStore().search('oficina');
    assert.ok(savedMemories.length > 0);
    assert.ok(savedMemories[0].content.includes('ferramentas na oficina'));
  });

  console.log('\n======================================================');
  console.log(`DeepSeek Brain Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

export async function runDeepSeekBrainTestSuite(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;
  await runTests();
  return { passed, failed };
}

if (process.argv[1]?.endsWith('deepseek-brain.test.ts') || process.argv[1]?.endsWith('deepseek-brain.test.js')) {
  runDeepSeekBrainTestSuite();
}

