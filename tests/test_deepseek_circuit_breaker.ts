import assert from 'node:assert';
import { DeepSeekAdapter } from '../src/brain/DeepSeekAdapter.js';
import { FoxtyCore } from '../src/core/FoxtyCore.js';
import { loadConfig, CHERRY_PLACE_CHANNEL_IDS } from '../src/config/index.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

export async function runDeepSeekCircuitBreakerTestSuite(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;

  console.log('\n======================================================');
  console.log('⚡ RUNNING DEEPSEEK CIRCUIT BREAKER & FAULT ISOLATION SUITE');
  console.log('======================================================\n');

  // 1. Initial Circuit Breaker state is CLOSED
  await test('1. Circuit breaker starts in CLOSED state with 0 failures', () => {
    const adapter = new DeepSeekAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
    });
    const state = adapter.getCircuitBreakerState();
    assert.strictEqual(state.state, 'CLOSED');
    assert.strictEqual(state.failureCount, 0);
    assert.strictEqual(adapter.isInsufficientBalance(), false);
  });

  // 2. HTTP 402 trips circuit breaker into OPEN (Standby) state
  await test('2. HTTP 402 trips circuit breaker into OPEN (DEEPSEEK_INSUFFICIENT_BALANCE)', async () => {
    const mock402Fetch = (async () => {
      return {
        ok: false,
        status: 402,
        json: async () => ({ error: { message: 'Insufficient Balance' } }),
      };
    }) as any;

    const adapter = new DeepSeekAdapter({
      apiKey: 'test-key-402',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      fetchFn: mock402Fetch,
      allowHeuristicFallback: false,
    });

    const testRes = await adapter.testDeepSeekConnection();
    assert.strictEqual(testRes.success, false);
    assert.strictEqual(testRes.status, 402);
    assert.strictEqual(testRes.circuitBreakerState, 'OPEN');

    const cb = adapter.getCircuitBreakerState();
    assert.strictEqual(cb.state, 'OPEN');
    assert.strictEqual(cb.reason, 'DEEPSEEK_INSUFFICIENT_BALANCE');
    assert.strictEqual(adapter.isInsufficientBalance(), true);

    const diag = adapter.getDiagnosticStatus();
    assert.strictEqual(diag.status, 'standby_insufficient_balance');
    assert.strictEqual(diag.circuitBreaker, 'open');
  });

  // 3. No fake response in production when circuit breaker is OPEN
  await test('3. Production mode enforces silence when circuit breaker is OPEN (no fabricated response)', async () => {
    const mock402Fetch = (async () => {
      return {
        ok: false,
        status: 402,
        json: async () => ({ error: { message: 'Insufficient Balance' } }),
      };
    }) as any;

    const config = loadConfig();
    const core = new FoxtyCore({
      ...config,
      deepSeekApiKey: 'sk-402-key',
      deepSeek: {
        ...config.deepSeek,
        apiKey: 'sk-402-key',
        allowHeuristicFallback: false, // Production strict mode!
        fetchFn: mock402Fetch,
      },
    });

    const adapter = core.getDeepSeekAdapter();
    // Trip it first
    await adapter.testDeepSeekConnection();
    assert.strictEqual(adapter.getCircuitBreakerState().state, 'OPEN');

    // Message processing must NOT invent response pretending it came from AI
    const result = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
      author: 'Kris',
      content: 'Foxty, você está acordado?',
      isDirectMention: true,
    });

    assert.strictEqual(result.aiUsed, false);
    assert.strictEqual(result.decision.decision, 'ignore');
    assert.strictEqual(result.toolResults.length, 0);
    const diag = adapter.getDiagnosticStatus();
    assert.strictEqual(diag.lastAiResult, 'CIRCUIT_BREAKER');
  });

  // 4. Cooldown time enforcement
  await test('4. Cooldown time is respected before transitioning to HALF_OPEN', async () => {
    const adapter = new DeepSeekAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
    });

    // Manually trip with a 500ms cooldown for fast testing
    (adapter as any).tripCircuitBreaker('TEST_ERROR', 200);
    let state = adapter.getCircuitBreakerState();
    assert.strictEqual(state.state, 'OPEN');
    assert.ok(state.cooldownRemainingMs > 0);

    // Immediate check is still OPEN
    assert.strictEqual(adapter.getCircuitBreakerState().state, 'OPEN');

    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 250));

    state = adapter.getCircuitBreakerState();
    assert.strictEqual(state.state, 'HALF_OPEN', 'State transitions to HALF_OPEN after cooldown expires');
  });

  // 5. Recovery on success in HALF_OPEN state
  await test('5. Successful response in HALF_OPEN resets circuit breaker to CLOSED', async () => {
    let returnSuccess = false;
    const mockDynamicFetch = (async () => {
      if (!returnSuccess) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"status":"ok"}' } }],
          usage: { total_tokens: 15 },
        }),
      };
    }) as any;

    const adapter = new DeepSeekAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      fetchFn: mockDynamicFetch,
    });

    // Trip circuit breaker with short 100ms cooldown
    (adapter as any).tripCircuitBreaker('DEEPSEEK_SERVER_ERROR_500', 100);
    assert.strictEqual(adapter.getCircuitBreakerState().state, 'OPEN');

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 150));
    assert.strictEqual(adapter.getCircuitBreakerState().state, 'HALF_OPEN');

    // Now API recovers
    returnSuccess = true;
    const testRes = await adapter.testDeepSeekConnection();
    assert.strictEqual(testRes.success, true);
    assert.strictEqual(testRes.circuitBreakerState, 'CLOSED');
    assert.strictEqual(adapter.getCircuitBreakerState().state, 'CLOSED');
    assert.strictEqual(adapter.getDiagnosticStatus().status, 'active');
  });

  // 6. Live API Test (optional if key configured, otherwise validates missing key handling)
  await test('6. Live connection test gracefully detects missing key or validates real endpoint', async () => {
    const adapter = new DeepSeekAdapter({
      apiKey: process.env.DEEPSEEK_API_KEY || undefined,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    });

    const result = await adapter.testDeepSeekConnection();
    if (!process.env.DEEPSEEK_API_KEY) {
      assert.strictEqual(result.hasApiKey, false);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'DEEPSEEK_API_KEY_MISSING');
    } else {
      assert.strictEqual(result.hasApiKey, true);
      // If real key exists, it either succeeded (200) or returned API status (e.g. 402/401/429) without crashing
      assert.ok(typeof result.status === 'number' || typeof result.status === 'string');
    }
  });

  console.log('\n======================================================');
  console.log(`Circuit Breaker Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  return { passed, failed };
}

if (process.argv[1]?.endsWith('test_deepseek_circuit_breaker.ts') || process.argv[1]?.endsWith('test_deepseek_circuit_breaker.js')) {
  runDeepSeekCircuitBreakerTestSuite().then((res) => {
    if (res.failed > 0) process.exit(1);
  });
}
