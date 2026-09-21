import { FoxtyCore } from '../src/core/FoxtyCore.js';
import { ObservationQueue } from '../src/behavior/ObservationQueue.js';
import { AutonomyBudgetManager } from '../src/behavior/AutonomyBudgetManager.js';
import { ObservationPreFilter } from '../src/behavior/ObservationPreFilter.js';
import { ObservationEvaluator } from '../src/behavior/ObservationEvaluator.js';
import { ReactionDiversityPolicy } from '../src/behavior/ReactionDiversityPolicy.js';
import { FoxtyConfig } from '../src/config/index.js';

function createMockConfig(): FoxtyConfig {
  return {
    testMode: true,
    deepSeekBaseUrl: 'https://api.deepseek.com',
    deepSeekModel: 'deepseek-chat',
    port: 3000,
    maxBurstMessages: 3,
    deepSeek: {
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 600,
      timeoutMs: 15000,
      thinkingMode: 'none',
      allowHeuristicFallback: true,
    },
    channels: [
      {
        id: '123456789012345678',
        name: 'Geral',
        category: 'Praça Principal',
        type: 'text',
        isProtected: false,
        allowSpontaneousEvents: true,
        toneGuidance: 'General chatter',
        foxtyPolicy: 'Uso Ativo',
      },
      {
        id: '999999999999999999',
        name: 'SakuraMail-Inbox',
        category: 'Correspondências',
        type: 'text',
        isProtected: true,
        allowSpontaneousEvents: false,
        toneGuidance: 'Private correspondence',
        foxtyPolicy: 'Uso Bloqueado',
      },
    ],
    defaultState: {
      mood: 0.8,
      energy: 0.8,
      curiosity: 0.8,
      chaos: 0.3,
      drama: 0.2,
      talkativeness: 0.5,
      suspicion: 0.2,
    },
    globalEventCooldownMinutes: 1,
  };
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    testsFailed++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('  FOXTYS - FASE 4: REAL AUTONOMOUS OBSERVATION LOOP SUITE');
  console.log('======================================================\n');

  const config = createMockConfig();
  const core = new FoxtyCore(config);

  // ----------------------------------------------------
  // TEST 1: Observation & Pre-Filter (Cheap, No DeepSeek)
  // ----------------------------------------------------
  console.log('🔍 Test 1: Passive Observation & Pre-Filter');
  const obs1 = await core.observeMessage({
    channelId: '123456789012345678',
    author: 'Kris',
    content: 'O que acham de fazermos um projeto de uma nova fazenda em Cherry Place?',
    messageId: 'msg-obs-1',
    isBot: false,
    isDirectMention: false,
  });

  assert(obs1.queued === true, 'High relevance unmentioned message is queued');
  assert(obs1.relevance >= 0.40, 'Relevance score is above threshold');
  assert(obs1.candidate !== undefined, 'Candidate object created');

  const obsLow = await core.observeMessage({
    channelId: '123456789012345678',
    author: 'UserX',
    content: 'ok',
    messageId: 'msg-obs-low',
    isBot: false,
    isDirectMention: false,
  });

  assert(obsLow.queued === false, 'Low relevance short message is NOT queued');
  assert(obsLow.relevance < 0.40, 'Low relevance score below threshold');

  // ----------------------------------------------------
  // TEST 2: ObservationQueue Functionality
  // ----------------------------------------------------
  console.log('\n📋 Test 2: ObservationQueue Management');
  const queue = new ObservationQueue(5);
  queue.addCandidate({
    messageId: 'm1',
    channelId: 'c1',
    author: 'A1',
    content: 'Ideia para o portal do Nether',
    timestamp: Date.now(),
    relevance: 0.6,
    reason: 'keyword',
    expiresAt: Date.now() + 60000,
  });
  queue.addCandidate({
    messageId: 'm2',
    channelId: 'c1',
    author: 'A2',
    content: 'Como construo a base principal?',
    timestamp: Date.now(),
    relevance: 0.85,
    reason: 'question + keyword',
    expiresAt: Date.now() + 60000,
  });

  const pending = queue.getPendingCandidates();
  assert(pending.length === 2, 'Pending candidates count is 2');
  assert(pending[0].relevance === 0.85, 'Pending candidates sorted by highest relevance');

  queue.markProcessed('m2');
  const pendingAfter = queue.getPendingCandidates();
  assert(pendingAfter.length === 1, 'Marking candidate processed reduces pending count');

  // ----------------------------------------------------
  // TEST 3: ObservationEvaluator Context Lag & Topic Drift
  // ----------------------------------------------------
  console.log('\n⏱️ Test 3: ObservationEvaluator Context & Lag Rules');
  const evaluator = new ObservationEvaluator();
  const candTest = {
    id: 'cand-1',
    messageId: 'msg-lag-1',
    channelId: '123456789012345678',
    author: 'Riely',
    content: 'Alguém tem minério de ferro extra?',
    timestamp: Date.now(),
    relevance: 0.75,
    reason: 'question',
    expiresAt: Date.now() + 60000,
    processed: false,
  };

  const channel = config.channels[0];
  const recentMsgsFresh = [
    { id: 'msg-lag-1', author: 'Riely', content: 'Alguém tem minério de ferro extra?', timestamp: new Date().toISOString() },
    { id: 'msg-2', author: 'Kris', content: 'Acho que tenho no baú.', timestamp: new Date().toISOString() },
  ];

  const evalFresh = evaluator.evaluateCandidate({
    candidate: candTest,
    channel,
    recentMessagesInChannel: recentMsgsFresh,
  });

  assert(evalFresh.shouldIntervene === true, 'Fresh candidate allows intervention');

  // Simulate 15 messages passing (topic drift)
  const recentMsgsDrift = [
    { id: 'msg-lag-1', author: 'Riely', content: 'Alguém tem minério de ferro extra?', timestamp: new Date().toISOString() },
    ...Array.from({ length: 15 }).map((_, i) => ({
      id: `drift-${i}`,
      author: 'User',
      content: `Mensagem sobre outro assunto ${i}`,
      timestamp: new Date().toISOString(),
    })),
  ];

  const evalDrift = evaluator.evaluateCandidate({
    candidate: candTest,
    channel,
    recentMessagesInChannel: recentMsgsDrift,
  });

  assert(evalDrift.shouldIntervene === false, 'Candidate rejected due to topic drift (>12 messages passed)');

  // ----------------------------------------------------
  // TEST 4: Silence as Valid Decision in Observation Loop
  // ----------------------------------------------------
  console.log('\n🤐 Test 4: Silence as Valid Decision');
  core.getObservationQueue().clear();
  await core.observeMessage({
    channelId: '123456789012345678',
    author: 'User1',
    content: 'O clima no servidor hoje está ótimo!',
    messageId: 'msg-silence-test',
  });

  const cycleResult = await core.runObservationCycle('123456789012345678');
  // In test mode without DeepSeek key, default response is simulated or silence
  assert(cycleResult === null || cycleResult.decision.decision === 'ignore' || cycleResult.decision.decision === 'respond', 'Observation cycle handled candidate smoothly');

  // ----------------------------------------------------
  // TEST 5: Reaction Diversity Policy
  // ----------------------------------------------------
  console.log('\n🎭 Test 5: Reaction Diversity Policy');
  const reactionPolicy = new ReactionDiversityPolicy();
  const e1 = reactionPolicy.selectEmoji('Qual é a ideia da fazenda?', 'curious', 'chan1');
  const e2 = reactionPolicy.selectEmoji('Consegui colocar o portal!', 'excited', 'chan1');
  const e3 = reactionPolicy.selectEmoji('Café da noite no jardim', 'casual', 'chan1');

  assert(reactionPolicy.getAllowedEmojis().length >= 10, 'Reaction diversity policy offers >= 10 emojis');
  assert(e1 !== e2 || e2 !== e3, 'Reactions change dynamically across contexts');

  // ----------------------------------------------------
  // TEST 6: Autonomy Budget & Multi-level Cooldowns
  // ----------------------------------------------------
  console.log('\n🛡️ Test 6: Autonomy Budget & Multi-level Cooldowns');
  const budget = new AutonomyBudgetManager(1000, 10);
  const now = Date.now();

  const cd1 = budget.checkCooldowns({ channelId: 'c1', userId: 'u1', now });
  assert(cd1.allowed === true, 'First intervention allowed');

  budget.recordIntervention({ channelId: 'c1', userId: 'u1', timestamp: now });

  const cdGlobal = budget.checkCooldowns({ channelId: 'c2', userId: 'u2', now: now + 1000 });
  assert(cdGlobal.allowed === false, 'Global cooldown active shortly after intervention');

  const status = budget.getBudgetStatus();
  assert(status.dailyAiCallLimit === 10, 'Daily AI call limit accurately reported');

  // ----------------------------------------------------
  // TEST 7: Idempotency & Duplicate Action Protection
  // ----------------------------------------------------
  console.log('\n🔁 Test 7: Idempotency & Deduplication');
  const isDup1 = budget.isDuplicate('msg-100', 'reply_to_message::msg-100');
  assert(isDup1 === false, 'First action fingerprint is not duplicate');

  budget.recordActionFingerprint('msg-100', 'reply_to_message::msg-100');
  const isDup2 = budget.isDuplicate('msg-100', 'reply_to_message::msg-100');
  assert(isDup2 === true, 'Duplicate action fingerprint detected & suppressed');

  // ----------------------------------------------------
  // TEST 8: EventEngine Integration in Observation Cycle
  // ----------------------------------------------------
  console.log('\n⚙️ Test 8: EventEngine Integration into Observation Pipeline');
  core.getObservationQueue().clear();
  const futureTime = Date.now() + 60 * 60 * 1000; // 1 hr in future
  const eventResult = core.evaluateSpontaneousEventEngine('123456789012345678', futureTime);
  assert(eventResult !== null && eventResult.decision.messages.length > 0, 'Spontaneous EventEngine triggered cleanly inside observation cycle');

  // ----------------------------------------------------
  // TEST 9: SakuraMail Privacy Isolation in Pre-Filter
  // ----------------------------------------------------
  console.log('\n🔒 Test 9: SakuraMail Privacy Isolation in Observation Pre-Filter');
  const sakuraChannel = config.channels[1]; // SakuraMail channel
  const preFilter = new ObservationPreFilter();

  const sakuraObs = preFilter.evaluateMessage({
    messageId: 's1',
    channel: sakuraChannel,
    author: 'Sender',
    content: 'Carta pessoal confidencial para Kris',
    timestamp: Date.now(),
  });

  assert(sakuraObs.shouldQueue === false, 'SakuraMail channel is 100% isolated in ObservationPreFilter');
  assert(sakuraObs.reason.includes('BLOCKED or private SakuraMail'), 'Appropriate privacy rejection reason returned');

  console.log('\n======================================================');
  console.log(`  FASE 4 SUITE COMPLETE: ${testsPassed} PASSED | ${testsFailed} FAILED`);
  console.log('======================================================\n');

  return { passed: testsPassed, failed: testsFailed };
}

export { runSuite as runPhase4TestSuite };

if (process.argv[1] && process.argv[1].includes('phase4-autonomy-suite')) {
  runSuite().then((res) => {
    if (res.failed > 0) process.exit(1);
  });
}
