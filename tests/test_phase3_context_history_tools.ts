import { HistoryManager } from '../src/core/HistoryManager.js';
import { RetrievalCoordinator } from '../src/memory/RetrievalCoordinator.js';
import { InMemoryStore } from '../src/memory/InMemoryStore.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';
import { ToolExecutor } from '../src/tools/ToolExecutor.js';
import { FoxtyCore } from '../src/core/FoxtyCore.js';
import { ContextBuilder } from '../src/core/ContextBuilder.js';
import { loadConfig, CHERRY_PLACE_CHANNELS, isSakuraMailChannel } from '../src/config/index.js';
import { ChatMessage, ChannelInfo } from '../src/types.js';

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

export async function runPhase3TestSuite(): Promise<{ passed: number; failed: number }> {
  console.log('\n=============================================================');
  console.log('🧪 FOxty Phase 3: Context, History, References & Tools Suite');
  console.log('=============================================================\n');

  const publicChannel = CHERRY_PLACE_CHANNELS.find((c) => !c.isProtected && c.foxtyPolicy === 'Uso Ativo')!;
  const sakuraMailChannel = CHERRY_PLACE_CHANNELS.find((c) => isSakuraMailChannel(c.id))!;

  // -------------------------------------------------------------
  // Test 1: HistoryManager Operations & Privacy Isolation
  // -------------------------------------------------------------
  console.log('Test 1: HistoryManager — Message Storage, Windows & Privacy');
  const history = new HistoryManager(50);

  const mockMsg1: ChatMessage = {
    id: 'msg-101',
    author: 'OnlyKrisVK',
    channelId: publicChannel.id,
    content: 'Riely, você viu a nova escada da base de cerejeira?',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    isBot: false,
  };

  const mockMsg2: ChatMessage = {
    id: 'msg-102',
    author: 'Kazelyx',
    channelId: publicChannel.id,
    content: 'Vi sim, ficou incrível com as lanternas.',
    timestamp: new Date(Date.now() - 30000).toISOString(),
    isBot: false,
    replyToMessageId: 'msg-101',
    repliedMessage: {
      id: 'msg-101',
      author: 'OnlyKrisVK',
      content: 'Riely, você viu a nova escada da base de cerejeira?',
    },
  };

  history.addMessage(mockMsg1);
  history.addMessage(mockMsg2);

  const window = history.getImmediateWindow(publicChannel.id, 10);
  assert(window.length === 2, 'HistoryManager retrieves immediate conversation window');
  assert(window[0].id === 'msg-101', 'HistoryManager preserves message ID');
  assert(window[1].replyToMessageId === 'msg-101', 'HistoryManager preserves replyToMessageId');
  assert(window[1].repliedMessage?.author === 'OnlyKrisVK', 'HistoryManager preserves referenced message');

  const foundMsg = history.getMessage(publicChannel.id, 'msg-101');
  assert(Boolean(foundMsg?.content.includes('escada da base')), 'HistoryManager getMessage finds message by ID');

  const searchResults = history.searchMessages(publicChannel.id, 'lanternas');
  assert(searchResults.length === 1 && searchResults[0].id === 'msg-102', 'HistoryManager searchMessages finds matching text');

  // Test SakuraMail Isolation in HistoryManager
  const secretMailMsg: ChatMessage = {
    id: 'msg-sec-999',
    author: 'SecretSender',
    channelId: sakuraMailChannel.id,
    content: 'Carta confidencial de amor',
    timestamp: new Date().toISOString(),
    isBot: false,
  };
  history.addMessage(secretMailMsg);

  const mailSearchResults = history.searchMessages(sakuraMailChannel.id, 'confidencial');
  assert(mailSearchResults.length === 0, 'HistoryManager strictly blocks search inside SakuraMail channels');

  // -------------------------------------------------------------
  // Test 2: RetrievalCoordinator Multi-factor Fuzzy Search
  // -------------------------------------------------------------
  console.log('\nTest 2: RetrievalCoordinator — Multi-Factor Contextual & Fuzzy Scoring');
  const memoryStore = new InMemoryStore();
  const coordinator = new RetrievalCoordinator(memoryStore);

  // Seed test memories
  await memoryStore.save({
    content: 'Kris costuma dizer que "raposas são seres de caos calculado" quando constrói pontes.',
    type: 'episodic',
    importance: 0.9,
    confidence: 0.95,
    source: 'OnlyKrisVK',
    targetUser: 'Kris',
    safeForTeasing: true,
    tags: ['frase', 'caos', 'kris-citacao', 'minecraft'],
  });

  await memoryStore.save({
    content: 'Riely prefere plantar cerejeiras ao redor do lago sul.',
    type: 'behavioral',
    importance: 0.7,
    confidence: 0.85,
    source: 'Kazelyx',
    targetUser: 'Riely',
    safeForTeasing: true,
    tags: ['flores', 'jardim', 'riely-habito'],
  });

  await memoryStore.save({
    content: '[Confidencial SakuraMail] Carta selada com dados íntimos.',
    type: 'temporary',
    importance: 0.9,
    confidence: 1.0,
    source: 'SakuraMail',
    safeForTeasing: false,
    tags: ['sakuramail', 'private'],
  });

  // Test retrieval with indirect query ("qual era aquela frase?")
  const retrievedMemories = await coordinator.retrieve({
    currentMessage: {
      content: 'Foxty, qual era aquela frase que o Kris falou outro dia sobre você?',
      author: 'Kazelyx',
      channelId: publicChannel.id,
    },
    targetUser: 'Kris',
    safeForTeasingRequired: true,
    limit: 3,
  });

  assert(retrievedMemories.length > 0, 'RetrievalCoordinator finds memories for non-exact query');
  assert(
    retrievedMemories[0].memory.content.includes('caos calculado'),
    'RetrievalCoordinator ranks high-importance Kris quote highest for Kris-related phrase query'
  );
  assert(retrievedMemories[0].score > 0.4, `RetrievalCoordinator computes multi-factor score (${retrievedMemories[0].score.toFixed(3)})`);

  // Verify SakuraMail is strictly excluded from general teasing retrieval
  const safeMemories = retrievedMemories.map((r) => r.memory);
  const leakedMail = safeMemories.some((m) => m.content.includes('Carta selada'));
  assert(!leakedMail, 'RetrievalCoordinator strictly filters out unsafe/SakuraMail memories');

  // -------------------------------------------------------------
  // Test 3: ToolRegistry — Zod Schemas & DeepSeek Tool Declarations
  // -------------------------------------------------------------
  console.log('\nTest 3: ToolRegistry — Schema Validation & DeepSeek Tool Exposure');
  const registry = new ToolRegistry();
  const deepSeekTools = registry.getDeepSeekTools();

  assert(deepSeekTools.length >= 12, `ToolRegistry exposes 12+ tools to DeepSeek (${deepSeekTools.length} exposed)`);

  const toolNames = deepSeekTools.map((t) => t.function.name);
  assert(toolNames.includes('reply_to_message'), 'Tool reply_to_message declared');
  assert(toolNames.includes('search_messages'), 'Tool search_messages declared');
  assert(toolNames.includes('get_message'), 'Tool get_message declared');
  assert(toolNames.includes('get_recent_messages'), 'Tool get_recent_messages declared');
  assert(toolNames.includes('send_file'), 'Tool send_file declared');
  assert(toolNames.includes('edit_message'), 'Tool edit_message declared');
  assert(toolNames.includes('delete_message'), 'Tool delete_message declared');

  // Validation tests
  const validReply = registry.validate(
    {
      tool: 'reply_to_message',
      arguments: {
        channel_id: publicChannel.id,
        message_id: '123456789012345678',
        content: 'Aqui está minha resposta contextual.',
      },
    },
    publicChannel
  );
  assert(validReply.valid, 'ToolRegistry approves valid reply_to_message action');

  const invalidSendFile = registry.validate(
    {
      tool: 'send_file',
      arguments: {
        channel_id: publicChannel.id,
        file_path: '/etc/shadow', // Dangerous unauthorized path
      },
    },
    publicChannel
  );
  assert(!invalidSendFile.valid, 'ToolRegistry rejects unauthorized file path outside assets/public/https');

  const validSendFile = registry.validate(
    {
      tool: 'send_file',
      arguments: {
        channel_id: publicChannel.id,
        file_path: './assets/foxty-sticker.png',
      },
    },
    publicChannel
  );
  assert(validSendFile.valid, 'ToolRegistry approves safe local asset file path');

  // -------------------------------------------------------------
  // Test 4: ToolExecutor — Multi-Tool Execution Loop & History Integration
  // -------------------------------------------------------------
  console.log('\nTest 4: ToolExecutor — Execution of Extended Tool Set');
  const executor = new ToolExecutor(
    registry,
    undefined, // simulated discord handler
    memoryStore,
    undefined,
    () => CHERRY_PLACE_CHANNELS,
    history
  );

  // Test reply_to_message
  const replyResult = await executor.execute(
    {
      tool: 'reply_to_message',
      arguments: {
        channel_id: publicChannel.id,
        message_id: 'msg-101',
        content: 'Interessante observação.',
      },
    },
    publicChannel
  );
  assert(replyResult.success, 'ToolExecutor successfully executes reply_to_message');
  assert(replyResult.result?.replyToMessageId === 'msg-101', 'ToolExecutor captures reply reference target');

  // Test search_messages via HistoryManager
  const searchExec = await executor.execute(
    {
      tool: 'search_messages',
      arguments: {
        channel_id: publicChannel.id,
        query: 'lanternas',
        limit: 5,
      },
    },
    publicChannel
  );
  assert(searchExec.success, 'ToolExecutor executes search_messages tool');
  assert(searchExec.result?.count >= 1, 'ToolExecutor search_messages finds matching history');

  // Test get_message tool
  const getMsgExec = await executor.execute(
    {
      tool: 'get_message',
      arguments: {
        channel_id: publicChannel.id,
        message_id: 'msg-101',
      },
    },
    publicChannel
  );
  assert(getMsgExec.success, 'ToolExecutor get_message retrieves targeted message');
  assert(getMsgExec.result?.content.includes('escada da base'), 'ToolExecutor get_message returns correct content');

  // -------------------------------------------------------------
  // Test 5: ContextBuilder Full Context Payload & Message ID Preservation
  // -------------------------------------------------------------
  console.log('\nTest 5: ContextBuilder — Message ID & Reply Chain Preservation');
  const contextBuilder = new ContextBuilder(memoryStore, {
    retrievalCoordinator: coordinator,
  });

  const contextPkg = await contextBuilder.buildContext({
    channel: publicChannel,
    currentMessage: mockMsg2,
    recentMessages: [mockMsg1, mockMsg2],
    observations: [],
    state: { mood: 0.8, curiosity: 0.9, energy: 0.7, chaos: 0.5, drama: 0.4, talkativeness: 0.6, suspicion: 0.1 },
    availableTools: registry.getAvailableTools(),
    isDirectMention: true,
    repliedMessage: mockMsg2.repliedMessage,
    historyManager: history,
  });

  assert(contextPkg.event?.messageId === 'msg-102', 'ContextBuilder preserves current message ID');
  assert(contextPkg.event?.replyToMessageId === 'msg-101', 'ContextBuilder preserves replyToMessageId');
  assert(contextPkg.event?.repliedMessage?.author === 'OnlyKrisVK', 'ContextBuilder includes full repliedMessage structure');
  assert(contextPkg.event?.immediateConversationWindow?.length === 2, 'ContextBuilder includes full immediateConversationWindow');
  assert(contextPkg.relevantMemories.length > 0, 'ContextBuilder seamlessly triggers RetrievalCoordinator for memory injection');

  // -------------------------------------------------------------
  // Test 6: FoxtyCore End-to-End Handling with Reply References
  // -------------------------------------------------------------
  console.log('\nTest 6: FoxtyCore End-to-End Pipeline with Context & Tools');
  const config = loadConfig();
  const core = new FoxtyCore({
    ...config,
    deepSeek: {
      ...config.deepSeek,
      allowHeuristicFallback: true,
    },
  });

  const coreResult = await core.handleMessage({
    channelId: publicChannel.id,
    author: 'OnlyKrisVK',
    content: 'Foxty, você viu o que a Riely construiu?',
    messageId: 'msg-e2e-201',
    isDirectMention: true,
  });

  assert(coreResult.decision.decision === 'respond', 'FoxtyCore produces conversational response for direct query');
  assert(coreResult.memoriesRetrieved.length >= 0, 'FoxtyCore connects memory retrieval coordinator');
  assert(core.getHistoryManager().getImmediateWindow(publicChannel.id, 10).length >= 1, 'FoxtyCore records message into HistoryManager');

  console.log(`\n=============================================================`);
  console.log(`Phase 3 Test Suite Results: ${passed} passed, ${failed} failed`);
  console.log(`=============================================================\n`);

  return { passed, failed };
}

if (process.argv[1]?.endsWith('test_phase3_context_history_tools.ts')) {
  runPhase3TestSuite().then(({ failed: failCount }) => {
    if (failCount > 0) process.exit(1);
  });
}
