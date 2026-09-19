import { strict as assert } from 'assert';
import {
  ChannelBehaviorPolicy,
  ChannelPolicyLevel,
  CHANNEL_POLICY_RULES,
} from '../src/policy/ChannelBehaviorPolicy.js';
import {
  CHERRY_PLACE_CHANNEL_IDS,
  getChannelById,
  getAllChannels,
  getSemanticLocationContext,
  CherryPlaceChannel,
} from '../src/config/cherryPlaceModel.js';
import { FoxtyCore } from '../src/core/FoxtyCore.js';
import { ContextBuilder } from '../src/core/ContextBuilder.js';
import { loadConfig } from '../src/config/index.js';
import { ActionRequest } from '../src/types.js';

export async function runChannelBehaviorPolicyTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================');
  console.log('🧪 RUNNING FOXTYS CHANNEL BEHAVIOR POLICY TEST SUITE');
  console.log('======================================================');

  let passed = 0;
  let failed = 0;

  function test(description: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${description}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(description: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${description}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  const policy = new ChannelBehaviorPolicy();

  // Mock channels for each policy level
  const blockedChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES)!;
  const limitedChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.COORDENADAS_IMPORTANTES)!;
  const moderateChannel: CherryPlaceChannel = {
    ...limitedChannel,
    id: 'test-moderate-chan',
    name: 'test-moderate',
    foxtyPolicy: 'Uso Moderado',
  };
  const activeChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS)!;
  const frequentChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY)!;

  // ==========================================
  // GROUP 1: LEVEL BLOCKED
  // ==========================================
  console.log('\nGroup 1: Formal BLOCKED Policy Verification');

  test('BLOCKED policy rules contract definition', () => {
    const rules = policy.getRules(ChannelPolicyLevel.BLOCKED);
    assert.equal(rules.level, ChannelPolicyLevel.BLOCKED);
    assert.equal(rules.canRespond, false, 'canRespond must be false');
    assert.equal(rules.appearanceProbability, 0.0, 'appearanceProbability must be 0.0');
    assert.equal(rules.canReact, false, 'canReact must be false');
    assert.equal(rules.reactionProbability, 0.0, 'reactionProbability must be 0.0');
    assert.equal(rules.maxReactionsPerMessage, 0, 'maxReactionsPerMessage must be 0');
    assert.equal(rules.allowedTools.length, 0, 'allowedTools must be empty');
    assert.equal(rules.maxToolsPerTurn, 0, 'maxToolsPerTurn must be 0');
    assert.equal(rules.allowSpontaneous, false, 'allowSpontaneous must be false');
    assert.equal(rules.spontaneousProbability, 0.0, 'spontaneousProbability must be 0.0');
    assert.equal(rules.mentionPriority, 0, 'mentionPriority must be 0');
    assert.equal(rules.canBypassWithMention, false, 'canBypassWithMention must be false');
  });

  test('BLOCKED pre-consultation blocks unprompted message', () => {
    const evalResult = policy.evaluatePreConsultation({
      channel: blockedChannel,
      isDirectMention: false,
    });
    assert.equal(evalResult.shouldProceedToBrain, false);
    assert.equal(evalResult.policy.level, ChannelPolicyLevel.BLOCKED);
  });

  test('BLOCKED pre-consultation blocks direct mention override', () => {
    const evalResult = policy.evaluatePreConsultation({
      channel: blockedChannel,
      isDirectMention: true,
    });
    assert.equal(evalResult.shouldProceedToBrain, false, 'Direct mention must NOT bypass BLOCKED');
    assert.ok(evalResult.reason.includes('BLOCKED'));
  });

  test('BLOCKED post-consultation guardrail discards any proposed messages', () => {
    const filtered = policy.filterProposedMessages(['Olá mundo!', 'Tudo bem?'], blockedChannel);
    assert.deepEqual(filtered, []);
  });

  test('BLOCKED post-consultation guardrail discards any proposed reactions', () => {
    const filtered = policy.filterProposedReactions(['🦊', '✨'], blockedChannel);
    assert.deepEqual(filtered, []);
  });

  test('BLOCKED post-consultation guardrail rejects all proposed tools', () => {
    const toolActions: ActionRequest[] = [
      { tool: 'send_message', arguments: { channel_id: blockedChannel.id, content: 'test' } },
    ];
    const { approved, rejected } = policy.filterProposedTools(toolActions, blockedChannel);
    assert.equal(approved.length, 0);
    assert.equal(rejected.length, 1);
  });

  // ==========================================
  // GROUP 2: LEVEL LIMITED
  // ==========================================
  console.log('\nGroup 2: Formal LIMITED Policy Verification');

  test('LIMITED policy rules contract definition', () => {
    const rules = policy.getRules(ChannelPolicyLevel.LIMITED);
    assert.equal(rules.level, ChannelPolicyLevel.LIMITED);
    assert.equal(rules.canRespond, true);
    assert.equal(rules.appearanceProbability, 0.08, 'appearanceProbability is very low (0.08)');
    assert.equal(rules.minCooldownSeconds, 180, 'cooldown is 180 seconds');
    assert.equal(rules.maxBurstMessages, 1, 'max burst is 1 message');
    assert.equal(rules.canReact, true);
    assert.equal(rules.reactionProbability, 0.05, 'reaction probability is very low (0.05)');
    assert.equal(rules.maxReactionsPerMessage, 1);
    assert.equal(rules.canSaveMemories, false, 'memories are not saved in LIMITED channels');
    assert.equal(rules.allowSpontaneous, false);
    assert.equal(rules.mentionPriority, 100);
    assert.equal(rules.canBypassWithMention, true);
  });

  test('LIMITED direct mention forces immediate consultation override', () => {
    const evalResult = policy.evaluatePreConsultation({
      channel: limitedChannel,
      isDirectMention: true,
    });
    assert.equal(evalResult.shouldProceedToBrain, true);
    assert.ok(evalResult.reason.includes('Direct mention override'));
  });

  test('LIMITED unprompted message respects probability roll', () => {
    // Roll higher than 0.08 fails
    const failEval = policy.evaluatePreConsultation({
      channel: limitedChannel,
      isDirectMention: false,
      randomRoll: () => 0.50,
    });
    assert.equal(failEval.shouldProceedToBrain, false);
    assert.ok(failEval.reason.includes('Appearance roll failed'));

    // Roll lower than 0.08 passes
    const passEval = policy.evaluatePreConsultation({
      channel: limitedChannel,
      isDirectMention: false,
      randomRoll: () => 0.04,
    });
    assert.equal(passEval.shouldProceedToBrain, true);
  });

  test('LIMITED respects 180s cooldown between unprompted appearances', () => {
    const now = 1000000;
    policy.recordResponse(limitedChannel.id, now);

    // 60 seconds later (within 180s cooldown)
    const cooldownEval = policy.evaluatePreConsultation({
      channel: limitedChannel,
      isDirectMention: false,
      currentTime: now + 60 * 1000,
      randomRoll: () => 0.01,
    });
    assert.equal(cooldownEval.shouldProceedToBrain, false);
    assert.ok(cooldownEval.reason.includes('cooldown active'));

    // 200 seconds later (past 180s cooldown)
    const afterCooldownEval = policy.evaluatePreConsultation({
      channel: limitedChannel,
      isDirectMention: false,
      currentTime: now + 200 * 1000,
      randomRoll: () => 0.01,
    });
    assert.equal(afterCooldownEval.shouldProceedToBrain, true);
    policy.resetCooldowns();
  });

  test('LIMITED limits proposed messages burst to 1', () => {
    const filtered = policy.filterProposedMessages(['Msg 1', 'Msg 2', 'Msg 3'], limitedChannel);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0], 'Msg 1');
  });

  test('LIMITED tools guardrail permits reading tools and rejects complex tools', () => {
    const singleAllowed: ActionRequest[] = [
      { tool: 'search_memory', arguments: { query: 'coords' } },
    ];
    const { approved: approvedAllowed } = policy.filterProposedTools(singleAllowed, limitedChannel);
    assert.equal(approvedAllowed.length, 1);
    assert.equal(approvedAllowed[0].tool, 'search_memory');

    const singleForbidden: ActionRequest[] = [
      { tool: 'save_memory', arguments: { content: 'coords' } },
    ];
    const { rejected: rejectedForbidden } = policy.filterProposedTools(singleForbidden, limitedChannel);
    assert.equal(rejectedForbidden.length, 1);
    assert.ok(rejectedForbidden[0].reason.includes('is forbidden by LIMITED'));
  });

  // ==========================================
  // GROUP 3: LEVEL MODERATE
  // ==========================================
  console.log('\nGroup 3: Formal MODERATE Policy Verification');

  test('MODERATE policy rules contract definition', () => {
    const rules = policy.getRules(ChannelPolicyLevel.MODERATE);
    assert.equal(rules.level, ChannelPolicyLevel.MODERATE);
    assert.equal(rules.canRespond, true);
    assert.equal(rules.appearanceProbability, 0.35);
    assert.equal(rules.minCooldownSeconds, 45);
    assert.equal(rules.maxBurstMessages, 2);
    assert.equal(rules.canReact, true);
    assert.equal(rules.reactionProbability, 0.30);
    assert.equal(rules.maxToolsPerTurn, 2);
    assert.equal(rules.allowSpontaneous, true);
    assert.equal(rules.canBypassWithMention, true);
  });

  test('MODERATE direct mention forces immediate consultation override', () => {
    const evalResult = policy.evaluatePreConsultation({
      channel: moderateChannel,
      isDirectMention: true,
    });
    assert.equal(evalResult.shouldProceedToBrain, true);
  });

  test('MODERATE unprompted message probability check', () => {
    const pass = policy.evaluatePreConsultation({
      channel: moderateChannel,
      isDirectMention: false,
      randomRoll: () => 0.20,
    });
    assert.equal(pass.shouldProceedToBrain, true);

    const fail = policy.evaluatePreConsultation({
      channel: moderateChannel,
      isDirectMention: false,
      randomRoll: () => 0.60,
    });
    assert.equal(fail.shouldProceedToBrain, false);
  });

  test('MODERATE post-consultation limits burst to 2 and tools to 2', () => {
    const filteredMessages = policy.filterProposedMessages(['1', '2', '3'], moderateChannel);
    assert.equal(filteredMessages.length, 2);

    const toolActions: ActionRequest[] = [
      { tool: 'send_message', arguments: { content: 'm1' } },
      { tool: 'react', arguments: { emoji: '✨' } },
      { tool: 'search_memory', arguments: {} },
    ];
    const { approved, rejected } = policy.filterProposedTools(toolActions, moderateChannel);
    assert.equal(approved.length, 2);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason.includes('Exceeded max tools limit'));
  });

  // ==========================================
  // GROUP 4: LEVEL ACTIVE
  // ==========================================
  console.log('\nGroup 4: Formal ACTIVE Policy Verification');

  test('ACTIVE policy rules contract definition', () => {
    const rules = policy.getRules(ChannelPolicyLevel.ACTIVE);
    assert.equal(rules.level, ChannelPolicyLevel.ACTIVE);
    assert.equal(rules.canRespond, true);
    assert.equal(rules.appearanceProbability, 0.75);
    assert.equal(rules.minCooldownSeconds, 15);
    assert.equal(rules.maxBurstMessages, 3);
    assert.equal(rules.canReact, true);
    assert.equal(rules.reactionProbability, 0.65);
    assert.equal(rules.maxReactionsPerMessage, 2);
    assert.equal(rules.maxToolsPerTurn, 4);
    assert.equal(rules.canSaveMemories, true);
    assert.equal(rules.allowSpontaneous, true);
    assert.equal(rules.mentionPriority, 100);
    assert.equal(rules.canBypassWithMention, true);
  });

  test('ACTIVE direct mention forces immediate consultation override', () => {
    const evalResult = policy.evaluatePreConsultation({
      channel: activeChannel,
      isDirectMention: true,
    });
    assert.equal(evalResult.shouldProceedToBrain, true);
  });

  test('ACTIVE post-consultation limits burst to 3 and reactions to 2', () => {
    const msgs = policy.filterProposedMessages(['1', '2', '3', '4'], activeChannel);
    assert.equal(msgs.length, 3);

    const reacts = policy.filterProposedReactions(['1', '2', '3'], activeChannel, () => 0.1);
    assert.equal(reacts.length, 2);
  });

  // ==========================================
  // GROUP 5: LEVEL FREQUENT
  // ==========================================
  console.log('\nGroup 5: Formal FREQUENT Policy Verification');

  test('FREQUENT policy rules contract definition', () => {
    const rules = policy.getRules(ChannelPolicyLevel.FREQUENT);
    assert.equal(rules.level, ChannelPolicyLevel.FREQUENT);
    assert.equal(rules.canRespond, true);
    assert.equal(rules.appearanceProbability, 1.0, 'Appearance probability is 1.0 (obligatory)');
    assert.equal(rules.minCooldownSeconds, 0, 'No cooldown');
    assert.equal(rules.maxBurstMessages, 4);
    assert.equal(rules.canReact, true);
    assert.equal(rules.reactionProbability, 0.85);
    assert.equal(rules.maxReactionsPerMessage, 3);
    assert.deepEqual(rules.allowedTools, ['*'], 'All tools are authorized');
    assert.equal(rules.maxToolsPerTurn, 6);
    assert.equal(rules.allowSpontaneous, true);
    assert.equal(rules.spontaneousProbability, 0.75);
    assert.equal(rules.mentionPriority, 100);
  });

  test('FREQUENT unprompted message ALWAYS proceeds to brain', () => {
    const evalResult = policy.evaluatePreConsultation({
      channel: frequentChannel,
      isDirectMention: false,
    });
    assert.equal(evalResult.shouldProceedToBrain, true);
    assert.ok(evalResult.reason.includes('FREQUENT channel policy'));
  });

  test('FREQUENT approves all tool actions including custom ones', () => {
    const toolActions: ActionRequest[] = [
      { tool: 'save_memory', arguments: { content: 'trivia note' } },
      { tool: 'send_multiple_messages', arguments: { messages: ['oi'] } },
      { tool: 'send_message', arguments: { content: 'ok' } },
    ];
    const { approved, rejected } = policy.filterProposedTools(toolActions, frequentChannel);
    assert.equal(approved.length, 3);
    assert.equal(rejected.length, 0);
  });

  // ==========================================
  // GROUP 6: MENTION RULE ACROSS ALL 15 CANONICAL CHANNELS
  // ==========================================
  console.log('\nGroup 6: Mention Rule Across All 15 Canonical Channels');

  test('Direct mention rule across all 15 canonical channels', () => {
    const allChannels = getAllChannels();
    assert.equal(allChannels.length, 15);

    for (const ch of allChannels) {
      const isBlocked = ch.foxtyPolicy === 'Uso Bloqueado';
      const evalResult = policy.evaluatePreConsultation({
        channel: ch,
        isDirectMention: true,
      });

      if (isBlocked) {
        assert.equal(
          evalResult.shouldProceedToBrain,
          false,
          `Channel ${ch.technicalName} (${ch.foxtyPolicy}) must REJECT direct mention`
        );
      } else {
        assert.equal(
          evalResult.shouldProceedToBrain,
          true,
          `Channel ${ch.technicalName} (${ch.foxtyPolicy}) must ACCEPT direct mention`
        );
      }
    }
  });

  // ==========================================
  // GROUP 7: CORE PIPELINE END-TO-END INTEGRATION
  // ==========================================
  console.log('\nGroup 7: Core Pipeline End-to-End Enforcement');

  const baseConfig = loadConfig();
  const core = new FoxtyCore({
    ...baseConfig,
    deepSeek: {
      ...baseConfig.deepSeek,
      allowHeuristicFallback: true,
    },
    testMode: true,
  });

  await testAsync('Core handleMessage rejects BLOCKED channel before calling AI', async () => {
    const result = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES,
      author: 'Kris',
      content: 'Aviso importante!',
      isDirectMention: false,
    });

    assert.equal(result.aiUsed, false, 'AI must not be used');
    assert.equal(result.decision.decision, 'ignore');
    assert.ok(result.decision.reasoning?.includes('BLOCKED'));
    assert.equal(result.decision.messages.length, 0);
  });

  await testAsync('Core handleMessage rejects BLOCKED channel even when author mentions Foxty', async () => {
    const result = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES,
      author: 'Kris',
      content: '@Foxty me ajude aqui!',
      isDirectMention: true,
    });

    assert.equal(result.aiUsed, false, 'AI must not be used');
    assert.equal(result.decision.decision, 'ignore');
    assert.ok(result.decision.reasoning?.includes('BLOCKED'));
  });

  await testAsync('Core handleMessage processes mention in ACTIVE channel', async () => {
    const result = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
      author: 'Riri',
      content: 'Oi @Foxty como vai?',
      isDirectMention: true,
    });

    assert.equal(result.decision.decision, 'respond');
    assert.ok(result.decision.messages.length > 0);
  });

  await testAsync('Core handleMessage processes unmentioned message in FREQUENT channel', async () => {
    const result = await core.handleMessage({
      channelId: CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY,
      author: 'Kris',
      content: 'Plantando flores no jardim mágico',
      isDirectMention: false,
    });

    assert.equal(result.decision.decision, 'respond');
  });

  await testAsync('Core slash command returns silence in BLOCKED channel', async () => {
    const result = await core.handleSlashCommand({
      commandName: 'foxty',
      subcommand: 'status',
      author: 'Kris',
      channelId: CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES,
    });

    assert.ok(result.reply.includes('silêncio'));
    assert.equal(result.decision.decision, 'ignore');
  });

  // ==========================================
  // GROUP 8: SEMANTIC LOCATION CONTEXT & CONTEXT BUILDER
  // ==========================================
  console.log('\nGroup 8: Semantic Location Context Verification');

  test('Semantic location context maps canonical channels correctly', () => {
    const allChannels = getAllChannels();
    const distinguishedThematics = new Set<string>();

    for (const ch of allChannels) {
      const loc = getSemanticLocationContext(ch);
      assert.ok(loc.category, `Channel ${ch.name} must have a category`);
      assert.ok(loc.purpose, `Channel ${ch.name} must have a purpose`);
      assert.ok(loc.thematicContext, `Channel ${ch.name} must have a thematicContext`);
      assert.ok(loc.foxtyPresenceLevel, `Channel ${ch.name} must have a foxtyPresenceLevel`);
      assert.ok(loc.limitations, `Channel ${ch.name} must have limitations`);
      assert.equal(typeof loc.isProtected, 'boolean', `Channel ${ch.name} must specify isProtected`);
      assert.ok(loc.specialRules, `Channel ${ch.name} must have specialRules`);
      assert.ok(loc.channelType === 'text' || loc.channelType === 'voice', `Channel ${ch.name} must have valid channelType`);

      distinguishedThematics.add(loc.thematicContext);
    }

    // Verify all 9 required semantic distinctions exist across Cherry Place channels
    assert.ok(distinguishedThematics.has('conversa casual'), 'Should distinguish conversa casual');
    assert.ok(distinguishedThematics.has('Minecraft'), 'Should distinguish Minecraft');
    assert.ok(distinguishedThematics.has('exploração'), 'Should distinguish exploração');
    assert.ok(distinguishedThematics.has('coordenadas'), 'Should distinguish coordenadas');
    assert.ok(distinguishedThematics.has('metas'), 'Should distinguish metas');
    assert.ok(distinguishedThematics.has('planejamento de calls'), 'Should distinguish planejamento de calls');
    assert.ok(distinguishedThematics.has('minigames'), 'Should distinguish minigames');
    assert.ok(distinguishedThematics.has('correspondência protegida'), 'Should distinguish correspondência protegida');
    assert.ok(distinguishedThematics.has('canais importantes'), 'Should distinguish canais importantes');
  });

  await testAsync('ContextBuilder enriches ContextPackage with semantic location', async () => {
    const memStore = core.getMemoryStore();
    const contextBuilder = new ContextBuilder(memStore);
    const channel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.MINIGAMES_DO_FOXTY)!;

    const pkg = await contextBuilder.buildContext({
      channel,
      currentMessage: {
        id: 'msg-test',
        author: 'Kris',
        channelId: channel.id,
        content: 'Bora jogar uma partida?',
        timestamp: new Date().toISOString(),
        isBot: false,
      },
      recentMessages: [],
      observations: [],
      state: core.getStateManager().getState(),
      availableTools: ['send_message', 'react'],
    });

    assert.ok(pkg.location !== undefined, 'Package must contain location object');
    assert.equal(pkg.location.thematicContext, 'minigames');
    assert.equal(pkg.location.category, 'Praça Principal');
    assert.equal(pkg.location.foxtyPresenceLevel, 'Uso Frequente');
    assert.equal(pkg.location.isProtected, false);
    assert.equal(pkg.channel.thematicContext, 'minigames');
  });

  console.log('\n======================================================');
  console.log(`Channel Behavior Policy Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  return { passed, failed };
}

if (process.argv[1]?.endsWith('test_channel_behavior_policy.ts')) {
  runChannelBehaviorPolicyTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
