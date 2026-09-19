import {
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_MEMBERS,
  CHERRY_PLACE_CATEGORIES,
  CHERRY_PLACE_CHANNELS,
  CHERRY_PLACE_CHANNEL_IDS,
  CHERRY_PLACE_CATEGORY_IDS,
  CHERRY_PLACE_MEMBER_IDS,
  getChannelById,
  getCategoryById,
  getChannelsByCategoryId,
  isChannelBlocked,
  isVoiceChannel,
  isSakuraMailChannel,
  getChannelUsagePolicy,
  canFoxtyInteractInChannel,
  getAllChannels,
  getAllCategories,
} from '../src/config/cherryPlaceModel.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';
import { PersonalityEngine } from '../src/personality/PersonalityEngine.js';

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

export async function runServerModelTestSuite() {
  console.log('\n======================================================');
  console.log('🏛️ Cherry Place Canonical Model Verification Suite');
  console.log('Specification: DISCORD_SERVER_CATEGORIES_AND_CHANNELS_RULES.md');
  console.log('======================================================\n');

  // Group 1: Server Metadata & Members
  console.log('Group 1: Server Metadata & Members');
  assert(CHERRY_PLACE_SERVER.id === '1549476612762902628', 'Server ID matches canonical specification');
  assert(CHERRY_PLACE_SERVER.name === 'Cherry Place', 'Server Name is Cherry Place');
  assert(CHERRY_PLACE_MEMBERS.KRIS.id === CHERRY_PLACE_MEMBER_IDS.KRIS, 'Kris canonical ID matches');
  assert(CHERRY_PLACE_MEMBERS.RIRI.id === CHERRY_PLACE_MEMBER_IDS.RIRI, 'Riely canonical ID matches');
  assert(CHERRY_PLACE_MEMBER_IDS.KRIS === '1351283041477333132', 'Kris ID is 1351283041477333132');
  assert(CHERRY_PLACE_MEMBER_IDS.RIRI === '796756820432650281', 'Riri ID is 796756820432650281');

  // Group 2: Categories Integrity
  console.log('\nGroup 2: Categories Uniqueness & Structure');
  const categories = getAllCategories();
  assert(categories.length === 6, 'Exactly 6 canonical categories registered');

  const categoryIds = new Set<string>();
  for (const cat of categories) {
    assert(!categoryIds.has(cat.id), `Category ID ${cat.id} is unique`);
    categoryIds.add(cat.id);
  }

  assert(getCategoryById(CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES)?.name === 'Importantes', 'Category Importantes matches');
  assert(getCategoryById(CHERRY_PLACE_CATEGORY_IDS.CALLZINHAS)?.name === 'Callzinhas', 'Category Callzinhas matches');
  assert(getCategoryById(CHERRY_PLACE_CATEGORY_IDS.PRACA_PRINCIPAL)?.name === 'Praça Principal', 'Category Praça Principal matches');
  assert(getCategoryById(CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI)?.name === 'The Little Riri', 'Category The Little Riri matches');
  assert(getCategoryById(CHERRY_PLACE_CATEGORY_IDS.PLANNER_DA_RIRI)?.name === 'Planner da Riri', 'Category Planner da Riri matches');
  assert(getCategoryById(CHERRY_PLACE_CATEGORY_IDS.CORRESPONDENCIAS)?.name === 'Correspondências', 'Category Correspondências matches');

  // Group 3: Channels Integrity & Uniqueness
  console.log('\nGroup 3: Channels Uniqueness & Category Mapping');
  const channels = getAllChannels();
  assert(channels.length === 15, 'Exactly 15 canonical channels registered');

  const channelIds = new Set<string>();
  for (const ch of channels) {
    assert(!channelIds.has(ch.id), `Channel ID ${ch.id} (${ch.technicalName}) is unique`);
    channelIds.add(ch.id);

    // Verify parent category exists
    const parentCategory = getCategoryById(ch.categoryId);
    assert(parentCategory !== undefined, `Channel ${ch.technicalName} belongs to valid category ${ch.categoryId}`);
    assert(ch.category === parentCategory?.name, `Channel ${ch.technicalName} category name reflects parent`);
  }

  // Group 4: Channels Distribution per Category
  console.log('\nGroup 4: Channels Distribution per Category');
  const importantesChannels = getChannelsByCategoryId(CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES);
  assert(importantesChannels.length === 3, 'Importantes has 3 channels (Boas Vindas, Avisos, Nunca esquecer)');

  const callzinhasChannels = getChannelsByCategoryId(CHERRY_PLACE_CATEGORY_IDS.CALLZINHAS);
  assert(callzinhasChannels.length === 1, 'Callzinhas has 1 channel (The Little Talking Riri)');

  const pracaChannels = getChannelsByCategoryId(CHERRY_PLACE_CATEGORY_IDS.PRACA_PRINCIPAL);
  assert(pracaChannels.length === 3, 'Praça Principal has 3 channels (Conversas Diárias, Jardim Mágico, MiniGames)');

  const ririChannels = getChannelsByCategoryId(CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI);
  assert(ririChannels.length === 5, 'The Little Riri has 5 channels (Cúbicas, Mapas, Coordenadas, Construção, Metas)');

  const plannerChannels = getChannelsByCategoryId(CHERRY_PLACE_CATEGORY_IDS.PLANNER_DA_RIRI);
  assert(plannerChannels.length === 2, 'Planner da Riri has 2 channels (Assuntos Calls, Ideias Calls)');

  const correspondenciasChannels = getChannelsByCategoryId(CHERRY_PLACE_CATEGORY_IDS.CORRESPONDENCIAS);
  assert(correspondenciasChannels.length === 1, 'Correspondências has 1 channel (Caixa de Correio)');

  // Group 5: Voice Channel Checks
  console.log('\nGroup 5: Voice Channel Identification');
  const voiceChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.THE_LITTLE_TALKING_RIRI);
  assert(voiceChannel !== undefined, 'Voice channel found by ID');
  assert(voiceChannel?.type === 'voice', 'Voice channel has type voice');
  assert(voiceChannel?.isVoice === true, 'Voice channel flag is true');
  assert(isVoiceChannel(CHERRY_PLACE_CHANNEL_IDS.THE_LITTLE_TALKING_RIRI) === true, 'isVoiceChannel returns true');
  assert(isVoiceChannel(CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS) === false, 'Conversas Diárias is not a voice channel');

  // Group 6: SakuraMail Protection Boundary
  console.log('\nGroup 6: SakuraMail Protection Boundary');
  const mailChannel = getChannelById(CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO);
  assert(mailChannel !== undefined, 'Caixa de Correio found by canonical ID');
  assert(isSakuraMailChannel(CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO) === true, 'isSakuraMailChannel helper identifies mailbox');
  assert(mailChannel?.foxtyPolicy === 'Uso Bloqueado', 'Caixa de Correio has Uso Bloqueado policy');
  assert(mailChannel?.isProtected === true, 'Caixa de Correio is marked as protected');
  assert(isChannelBlocked(CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO) === true, 'isChannelBlocked helper returns true for mailbox');

  // Group 7: Interaction Policies Compliance
  console.log('\nGroup 7: Foxty Interaction Policies');
  // Blocked channels: Boas Vindas, Avisos Importantes, Para nunca se esquecer, Voice, Caixa de Correio
  const blockedChannels = [
    CHERRY_PLACE_CHANNEL_IDS.BOAS_VINDAS,
    CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES,
    CHERRY_PLACE_CHANNEL_IDS.PARA_NUNCA_SE_ESQUECER,
    CHERRY_PLACE_CHANNEL_IDS.THE_LITTLE_TALKING_RIRI,
    CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO,
  ];
  for (const id of blockedChannels) {
    const ch = getChannelById(id)!;
    assert(ch.foxtyPolicy === 'Uso Bloqueado', `Channel ${ch.technicalName} policy is Uso Bloqueado`);
    assert(isChannelBlocked(id) === true, `isChannelBlocked(${ch.technicalName}) is true`);
    // Rule: mentions do NOT bypass blocked channels!
    assert(canFoxtyInteractInChannel(id, true) === false, `Mentions cannot bypass blocked channel ${ch.technicalName}`);
    assert(canFoxtyInteractInChannel(id, false) === false, `Spontaneous interaction forbidden in ${ch.technicalName}`);
  }

  // Frequent channels: Jardim Mágico, MiniGames
  const frequentChannels = [
    CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY,
    CHERRY_PLACE_CHANNEL_IDS.MINIGAMES_DO_FOXTY,
  ];
  for (const id of frequentChannels) {
    const ch = getChannelById(id)!;
    assert(ch.foxtyPolicy === 'Uso Frequente', `Channel ${ch.technicalName} policy is Uso Frequente`);
    assert(canFoxtyInteractInChannel(id, false) === true, `Spontaneous allowed in frequent channel ${ch.technicalName}`);
    assert(canFoxtyInteractInChannel(id, true) === true, `Mentions allowed in frequent channel ${ch.technicalName}`);
  }

  // Limited channels: Coordenadas, Assuntos Call, Ideias Call
  const limitedChannels = [
    CHERRY_PLACE_CHANNEL_IDS.COORDENADAS_IMPORTANTES,
    CHERRY_PLACE_CHANNEL_IDS.ASSUNTOS_PARA_FALAR_EM_CALLS,
    CHERRY_PLACE_CHANNEL_IDS.IDEIAS_PARA_FAZER_EM_CALL,
  ];
  for (const id of limitedChannels) {
    const ch = getChannelById(id)!;
    assert(ch.foxtyPolicy === 'Uso Limitado', `Channel ${ch.technicalName} policy is Uso Limitado`);
    assert(canFoxtyInteractInChannel(id, true) === true, `Mentions allowed in limited channel ${ch.technicalName}`);
  }

  // Active channels: Conversas Diárias, Conversas Cúbicas, Metas e Objetivos
  const activeChannels = [
    CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
    CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_CUBICAS,
    CHERRY_PLACE_CHANNEL_IDS.METAS_E_OBJETIVOS,
  ];
  for (const id of activeChannels) {
    const ch = getChannelById(id)!;
    assert(ch.foxtyPolicy === 'Uso Ativo', `Channel ${ch.technicalName} policy is Uso Ativo`);
    assert(canFoxtyInteractInChannel(id, true) === true, `Mentions allowed in active channel ${ch.technicalName}`);
  }

  // Group 8: Tool Registry Enforcement with Canonical Model
  console.log('\nGroup 8: Tool Registry Channel Policy Enforcement');
  const registry = new ToolRegistry();
  const blockedAvisos = getChannelById(CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES)!;
  const activeDaily = getChannelById(CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS)!;

  const msgInBlocked = registry.validate(
    { tool: 'send_message', arguments: { channel_id: blockedAvisos.id, content: 'Oi!' } },
    blockedAvisos
  );
  assert(msgInBlocked.valid === false, 'ToolRegistry rejects message in Uso Bloqueado channel');
  assert(Boolean(msgInBlocked.error?.includes('Uso Bloqueado')), 'Error message cites Uso Bloqueado policy');

  const reactInBlocked = registry.validate(
    { tool: 'react', arguments: { channel_id: blockedAvisos.id, message_id: '123', emoji: '🦊' } },
    blockedAvisos
  );
  assert(reactInBlocked.valid === false, 'ToolRegistry rejects reaction in Uso Bloqueado channel');

  const msgInActive = registry.validate(
    { tool: 'send_message', arguments: { channel_id: activeDaily.id, content: 'Oi Cherry Place!' } },
    activeDaily
  );
  assert(msgInActive.valid === true, 'ToolRegistry allows message in Uso Ativo channel');

  // Group 9: Personality Engine Silence Logic with Channel Policies
  console.log('\nGroup 9: Personality Engine Policy Alignment');
  const personality = new PersonalityEngine();
  const testState = {
    mood: 0.7,
    energy: 0.7,
    curiosity: 0.8,
    chaos: 0.4,
    drama: 0.3,
    talkativeness: 0.5,
    suspicion: 0.2,
  };

  // Blocked channel MUST silence even if mentioned
  const blockedSilence = personality.shouldStaySilent(testState, true, blockedAvisos);
  assert(blockedSilence === true, 'Personality stays silent in blocked channel even when mentioned');

  // Frequent channel NEVER silences even without mention
  const frequentJardim = getChannelById(CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY)!;
  const frequentSilence = personality.shouldStaySilent(testState, false, frequentJardim);
  assert(frequentSilence === false, 'Personality stays present in Uso Frequente channels');

  // Direct mention in active channel NEVER silences
  const mentionActiveSilence = personality.shouldStaySilent(testState, true, activeDaily);
  assert(mentionActiveSilence === false, 'Personality responds to direct mention in active channel');

  console.log('\n======================================================');
  console.log(`Model Suite Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run standalone if executed directly
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || 'test_server_model.ts')) {
  runServerModelTestSuite().catch((err) => {
    console.error('Fatal model test error:', err);
    process.exit(1);
  });
}
