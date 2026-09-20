import { FoxtyCore } from '../src/core/FoxtyCore.js';
import {
  loadConfig,
  CHERRY_PLACE_CHANNELS,
  CHERRY_PLACE_CHANNEL_IDS,
  isSakuraMailChannel,
} from '../src/config/index.js';
import { parseBrainOutput } from '../src/brain/contracts.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';
import { InMemoryStore } from '../src/memory/InMemoryStore.js';
import { EventEngine } from '../src/events/EventEngine.js';
import { runServerModelTestSuite } from './test_server_model.js';
import { runChannelBehaviorPolicyTests } from './test_channel_behavior_policy.js';
import { runServerMapValidatorTests } from './test_server_map_validator.js';
import { runDeepSeekBrainTestSuite } from './deepseek-brain.test.js';
import { runDiscordIntegrationTestSuite } from './test_discord_integration.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, message?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${message ? ` - ${message}` : ''}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n=============================================');
  console.log('🧪 FOxty Phase 01 Comprehensive Verification');
  console.log('=============================================\n');

  // 1. Config Loading
  console.log('Group 1: Configuration Loading');
  const config = loadConfig();
  assert(config.port === 3000 || typeof config.port === 'number', 'Port configuration valid');
  assert(config.channels.length >= 6, 'Cherry Place channels loaded correctly');
  assert(config.defaultState.mood > 0, 'Default state vectors populated');

  // 2. Core Initialization
  console.log('\nGroup 2: Core Engine Initialization');
  const testConfig = {
    ...config,
    deepSeek: {
      ...config.deepSeek,
      allowHeuristicFallback: true,
    },
  };
  const core = new FoxtyCore(testConfig);
  assert(core !== null, 'FoxtyCore instances created successfully');
  assert(core.getStateManager().getState().mood === config.defaultState.mood, 'State manager initializes with default state');

  // 3. DeepSeek Adapter & Brain Contract
  console.log('\nGroup 3: DeepSeek Brain Contract & Output Parsing');
  const validJson = JSON.stringify({
    decision: 'respond',
    tone: 'teasing',
    messages: ['hm.', 'isso foi muito específico.'],
    reactions: ['🦊'],
  });
  const parseResult = parseBrainOutput(validJson);
  assert(parseResult.success === true, 'Valid JSON brain output parsed');
  assert(parseResult.data?.decision === 'respond', 'Brain decision correctly parsed');
  assert(parseResult.data?.messages.length === 2, 'Brain messages correctly extracted');

  // 4. Invalid JSON Recovery
  console.log('\nGroup 4: Malformed JSON Recovery');
  const malformedJson = '{ decision: "respond", incomplete json...';
  const badParse = parseBrainOutput(malformedJson);
  assert(badParse.success === false, 'Malformed JSON rejected safely without crash');

  // 5. Tool Validation & Security
  console.log('\nGroup 5: Tool Registry & Argument Validation');
  const registry = new ToolRegistry();
  const publicChannel = CHERRY_PLACE_CHANNELS.find((c) => !c.isProtected && c.foxtyPolicy === 'Uso Ativo')!;
  const protectedMailChannel = CHERRY_PLACE_CHANNELS.find((c) => isSakuraMailChannel(c.id))!;

  const validAction = {
    tool: 'send_message' as const,
    arguments: { channel_id: publicChannel.id, content: 'Olá Cherry Place!' },
  };
  const validCheck = registry.validate(validAction, publicChannel);
  assert(validCheck.valid === true, 'Valid send_message action approved');

  const invalidAction = {
    tool: 'send_message' as const,
    arguments: { channel_id: '', content: '' }, // empty
  };
  const invalidCheck = registry.validate(invalidAction, publicChannel);
  assert(invalidCheck.valid === false, 'Empty arguments rejected by Zod schema');

  // 6. Protected Channel Boundaries (SakuraMail policy)
  console.log('\nGroup 6: Protected Channel Boundary Security');
  const mailViolationAction = {
    tool: 'send_message' as const,
    arguments: { channel_id: protectedMailChannel.id, content: 'Espiando a correspondência...' },
  };
  const mailCheck = registry.validate(mailViolationAction, protectedMailChannel);
  assert(mailCheck.valid === false, 'Automated message rejected in protected SakuraMail channel');

  // 7. Memory Interface (save, get, search, delete, expire)
  console.log('\nGroup 7: Memory Interface Operations');
  const memStore = new InMemoryStore(false); // clean store
  const saved = await memStore.save({
    content: 'Riely replantou as cerejeiras perto da fonte.',
    type: 'episodic',
    importance: 0.9,
    confidence: 0.95,
    source: 'test-user',
    targetUser: 'Riely',
    safeForTeasing: true,
    retention: 'permanent',
    tags: ['cerejeira', 'base'],
  });
  assert(saved.id.length > 0, 'Memory saved with generated ID');

  const fetched = await memStore.get(saved.id);
  assert(fetched !== null && fetched.content === saved.content, 'Memory fetched by ID');

  const searchResults = await memStore.search('cerejeira');
  assert(searchResults.length === 1, 'Memory search by keyword works');

  const safeTeasingResults = await memStore.search(undefined, { safeForTeasingOnly: true });
  assert(safeTeasingResults.length === 1, 'Memory search respects safeForTeasing flag');

  const deleted = await memStore.delete(saved.id);
  assert(deleted === true, 'Memory successfully deleted');
  const checkDeleted = await memStore.get(saved.id);
  assert(checkDeleted === null, 'Deleted memory is no longer accessible');

  // 8. Event Engine & Cooldowns
  console.log('\nGroup 8: Event Engine & Cooldowns');
  const eventEngine = new EventEngine(30);
  const testTrigger = eventEngine.triggerTestEvent(undefined, publicChannel);
  assert(testTrigger.triggered === true, 'Spontaneous test event triggered successfully');
  assert(testTrigger.messages !== undefined && testTrigger.messages.length > 0, 'Event produced quips/messages');

  const immediateRecheck = eventEngine.checkSpontaneousEvent(publicChannel);
  assert(immediateRecheck.canTrigger === false, 'Event engine enforces cooldown immediately after event');

  // 9. Multi-Message Burst & Pipeline Execution
  console.log('\nGroup 9: Core Pipeline & Multi-Message Execution');
  const slashResult = await core.handleSlashCommand({
    commandName: 'foxty',
    subcommand: 'status',
    author: 'Kris',
    channelId: publicChannel.id,
  });
  assert(slashResult.reply.includes('Foxty Status'), '/foxty status command executes');

  const chatResult = await core.handleMessage({
    channelId: publicChannel.id,
    author: 'Riely',
    content: 'a base de minecraft ficou tão linda com as cerejeiras KKKKKKK',
    isDirectMention: true,
  });
  assert(chatResult.decision.decision === 'respond', 'Direct mention yields response decision');
  assert(chatResult.observations.length > 0, 'Behavioral analyzer captured observation signals');
  assert(chatResult.toolResults.length > 0, 'Tool executor ran approved send_message action');

  // 10. Behavioral Intelligence & Linguistic Signatures (Doc 03 & 07)
  console.log('\nGroup 10: Behavioral Signatures & Cycle Analysis');
  const analyzer = (core as any).behavioralAnalyzer;
  
  // Test Riely compression & markers
  const rielyObs = analyzer.analyze('Riely', 'naum tá pronto ainda -&) :3 ksksks');
  assert(rielyObs.inferredSpeaker === 'Riely', 'Riely linguistic signature detected correctly');
  assert(rielyObs.signals.includes('micro_markers'), 'Micro-markers (-&) :3) detected');
  assert(rielyObs.signals.includes('informal_spelling'), 'Informal spelling detected');

  // Test Kris theatrical expansion
  const krisObs = analyzer.analyze('Kris', 'NÃO É POSSÍVEL que vocês ainda estão mexendo nisso... meu deus, cadê a escada?');
  assert(krisObs.inferredSpeaker === 'Kris', 'Kris linguistic signature detected correctly');
  assert(krisObs.signals.includes('theatrical_exaggeration'), 'Theatrical exaggeration detected');
  assert(krisObs.signals.includes('question_followup'), 'Followup question detected');

  // Test Riely pattern deviation (usually compressed, here 200+ characters)
  const longRielyText = 'então, eu estive pensando muito detalhadamente sobre como nós deveríamos estruturar a ala leste da base de cerejeiras, incluindo todos os baús de minérios e as mudas de árvores que nós trouxemos do bioma vizinho';
  const rielyDeviation = analyzer.analyze('Riely', longRielyText);
  assert(rielyDeviation.patternDeviation !== undefined, 'Riely length deviation recognized');
  assert(rielyDeviation.patternDeviation?.subject === 'Riely', 'Deviation attributed to Riely');

  // Test Conversation Cycle (Farewell / Closing ritual)
  const cycleObs = analyzer.analyze('Kris', 'boa noite, dorme bem', [
    { id: '1', author: 'Riely', channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS, content: 'até amanhãaaaaaa', timestamp: new Date().toISOString() }
  ]);
  assert(cycleObs.conversationCycle !== undefined, 'Closing ritual cycle detected');
  assert(cycleObs.conversationCycle?.cycleType === 'closing_ritual', 'Cycle labeled as closing_ritual');

  // 11. SakuraMail Integration & Privacy Firewall (Doc 06 & 08)
  console.log('\nGroup 11: SakuraMail Privacy Barrier & Abstract Events');
  const bridge = core.getSakuraMailBridge();

  // Test content stripping firewall
  const leakAttempt = bridge.ingestEvent({
    type: 'letter_opened',
    user: 'Kris',
    letter_text: 'Esta é uma carta ultra secreta com confissões íntimas',
    content: 'texto privado',
  });
  assert(leakAttempt.accepted === true, 'Abstract event accepted');
  assert(leakAttempt.privacyWarning !== undefined, 'Privacy warning generated on leakage attempt');
  assert((leakAttempt.abstractEvent as any).letter_text === undefined, 'Letter text strictly stripped');
  assert((leakAttempt.abstractEvent as any).content === undefined, 'Letter content strictly stripped');

  // 12. Expanded Tool Registry & Security Safeguards
  console.log('\nGroup 12: Expanded Tool Registry & Security Safeguards');
  
  // Test save_memory privacy check
  const unsafeMemoryAction = {
    tool: 'save_memory' as const,
    arguments: {
      content: 'A senha do servidor é cherry123',
      safe_for_teasing: true, // violation!
    },
  };
  const unsafeCheck = registry.validate(unsafeMemoryAction, publicChannel);
  assert(unsafeCheck.valid === false, 'Privacy violation prevented: sensitive keyword cannot be safe_for_teasing');

  const safeMemoryAction = {
    tool: 'save_memory' as const,
    arguments: {
      content: 'Riely adora construir fontes de flores de cerejeira',
      safe_for_teasing: true,
    },
  };
  const safeCheck = registry.validate(safeMemoryAction, publicChannel);
  assert(safeCheck.valid === true, 'Safe memory validation approved');

  // Test send_multiple_messages
  const burstAction = {
    tool: 'send_multiple_messages' as const,
    arguments: {
      channel_id: publicChannel.id,
      messages: ['pera', 'olha isso'],
    },
  };
  const burstCheck = registry.validate(burstAction, publicChannel);
  assert(burstCheck.valid === true, 'Burst send_multiple_messages validated');

  // 13. Event Engine Rarities & Cross-Channel Redirection
  console.log('\nGroup 13: Event Engine Rarities & Cross-Channel Mechanics');
  const registeredEvents = eventEngine.getRegisteredEvents();
  assert(registeredEvents.length >= 6, 'All 6 event tiers registered');
  
  const raritiesFound = new Set(registeredEvents.map(e => e.rarity));
  assert(raritiesFound.has('common'), 'Common rarity present');
  assert(raritiesFound.has('uncommon'), 'Uncommon rarity present');
  assert(raritiesFound.has('rare'), 'Rare rarity present');
  assert(raritiesFound.has('very_rare'), 'Very Rare rarity present');
  assert(raritiesFound.has('legendary'), 'Legendary rarity present');
  assert(raritiesFound.has('anomalous'), 'Anomalous rarity present');

  const crossChannelEvent = registeredEvents.find(e => e.payload?.targetChannelRedirect);
  assert(crossChannelEvent !== undefined, 'Cross-channel event configured');

  // 14. Server Model Canonical Specification Verification
  await runServerModelTestSuite();

  // 15. Channel Behavior Policy Specification Verification
  const policyResults = await runChannelBehaviorPolicyTests();
  if (policyResults.failed > 0) {
    failed += policyResults.failed;
  }

  // 16. ServerMapValidator Specification Verification
  const validatorResults = await runServerMapValidatorTests();
  if (validatorResults.failed > 0) {
    failed += validatorResults.failed;
  }

  // 17. DeepSeek Brain Real Integration (V4.1-Flash) Verification
  const deepSeekResults = await runDeepSeekBrainTestSuite();
  if (deepSeekResults.failed > 0) {
    failed += deepSeekResults.failed;
  }

  // 18. Discord Integration Audit & Diagnostics Verification
  const discordResults = await runDiscordIntegrationTestSuite();
  if (discordResults.failed > 0) {
    failed += discordResults.failed;
  } else {
    passed += discordResults.passed;
  }

  console.log('\n=============================================');
  console.log(`Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
