// ============================================================================
// SERVER MAP VALIDATOR TEST SUITE
// Verifies all diagnostic rules: Guild, Categories, Channels, IDs, Parents,
// Types, Missing, Unexpected, Positions, Safety, and Slash Command Diagnostics.
// ============================================================================

import { ServerMapValidator } from '../src/validator/ServerMapValidator.js';
import {
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_CATEGORIES,
  CHERRY_PLACE_CHANNELS,
  CHERRY_PLACE_CATEGORY_IDS,
  CHERRY_PLACE_CHANNEL_IDS,
} from '../src/config/cherryPlaceModel.js';
import { DiscordServerSnapshot } from '../src/types.js';
import { FoxtyCore } from '../src/core/FoxtyCore.js';
import { loadConfig } from '../src/config/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, message?: string) {
  if (condition) {
    console.log(`    ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`    ❌ FAIL: ${testName}${message ? ` - ${message}` : ''}`);
    failed++;
  }
}

export async function runServerMapValidatorTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================');
  console.log('🧪 ServerMapValidator Diagnostic Test Suite');
  console.log('======================================================\n');

  const validator = new ServerMapValidator();

  // Test 1: Canonical Snapshot Baseline (100% Perfect Match)
  console.log('Test 1: Canonical Baseline Snapshot Validation');
  const canonicalSnapshot = ServerMapValidator.getCanonicalSnapshot();
  const perfectReport = validator.validate(canonicalSnapshot);

  assert(perfectReport.status === 'PERFECT_MATCH', 'Canonical state yields PERFECT_MATCH status');
  assert(perfectReport.metrics.complianceScore === 100, 'Compliance score is 100%');
  assert(perfectReport.metrics.criticalErrorsCount === 0, 'Zero critical errors on canonical state');
  assert(perfectReport.metrics.warningsCount === 0, 'Zero warnings on canonical state');
  assert(perfectReport.metrics.missingChannels === 0, 'Zero missing channels');
  assert(perfectReport.metrics.missingCategories === 0, 'Zero missing categories');
  assert(perfectReport.metrics.unexpectedChannelsCount === 0, 'Zero unexpected channels');
  assert(perfectReport.metrics.matchedCategories === 6, 'All 6 canonical categories matched');
  assert(perfectReport.metrics.matchedChannels === 15, 'All 15 canonical channels matched');
  assert(perfectReport.isSafeAndNonDestructive === true, 'Safe & non-destructive flag affirmed');

  // Test 2: Guild Identification Validation
  console.log('\nTest 2: Guild Validation (Correct ID & Name Check)');
  const wrongGuildSnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    guildId: '999999999999999999',
    guildName: 'Servidor Aleatório',
  };
  const wrongGuildReport = validator.validate(wrongGuildSnapshot);
  assert(wrongGuildReport.status === 'CRITICAL_DIVERGENCES', 'Wrong guild ID causes CRITICAL_DIVERGENCES');
  assert(wrongGuildReport.guildValidation.isGuildIdMatch === false, 'Guild ID match correctly flagged false');
  assert(
    wrongGuildReport.allFindings.some((f) => f.code === 'GUILD_ID_MISMATCH'),
    'GUILD_ID_MISMATCH finding generated'
  );

  // Test 3: Missing Categories Detection
  console.log('\nTest 3: Missing Categories Detection');
  const missingCategorySnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    categories: canonicalSnapshot.categories.filter((c) => c.id !== CHERRY_PLACE_CATEGORY_IDS.CORRESPONDENCIAS),
  };
  const missingCatReport = validator.validate(missingCategorySnapshot);
  assert(missingCatReport.metrics.missingCategories === 1, 'Detected 1 missing category');
  assert(
    missingCatReport.allFindings.some(
      (f) => f.code === 'CATEGORY_MISSING' && f.targetId === CHERRY_PLACE_CATEGORY_IDS.CORRESPONDENCIAS
    ),
    'CATEGORY_MISSING finding for Correspondências generated'
  );

  // Test 4: Missing Channels Detection
  console.log('\nTest 4: Missing Channels Detection');
  const missingChannelSnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    channels: canonicalSnapshot.channels.filter((ch) => ch.id !== CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO),
  };
  const missingChReport = validator.validate(missingChannelSnapshot);
  assert(missingChReport.metrics.missingChannels === 1, 'Detected 1 missing channel');
  assert(
    missingChReport.allFindings.some(
      (f) => f.code === 'CHANNEL_MISSING' && f.targetId === CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO
    ),
    'CHANNEL_MISSING finding for caixa-de-correio generated'
  );

  // Test 5: Channel Parent Category Mismatch Detection
  console.log('\nTest 5: Channel Parent Category Mismatch Detection');
  const wrongParentSnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    channels: canonicalSnapshot.channels.map((ch) => {
      if (ch.id === CHERRY_PLACE_CHANNEL_IDS.MINIGAMES_DO_FOXTY) {
        // Displace minigames from Praça Principal to The Little Riri
        return { ...ch, parentId: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI };
      }
      return ch;
    }),
  };
  const wrongParentReport = validator.validate(wrongParentSnapshot);
  assert(
    wrongParentReport.allFindings.some(
      (f) => f.code === 'CHANNEL_PARENT_MISMATCH' && f.targetId === CHERRY_PLACE_CHANNEL_IDS.MINIGAMES_DO_FOXTY
    ),
    'CHANNEL_PARENT_MISMATCH finding generated for displaced channel'
  );

  // Test 6: Channel Type Mismatch Detection (Text vs Voice)
  console.log('\nTest 6: Channel Type Mismatch Detection (Voice vs Text)');
  const wrongTypeSnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    channels: canonicalSnapshot.channels.map((ch) => {
      if (ch.id === CHERRY_PLACE_CHANNEL_IDS.THE_LITTLE_TALKING_RIRI) {
        // Change voice channel to text
        return { ...ch, type: 'text' };
      }
      return ch;
    }),
  };
  const wrongTypeReport = validator.validate(wrongTypeSnapshot);
  assert(
    wrongTypeReport.allFindings.some(
      (f) => f.code === 'CHANNEL_TYPE_MISMATCH' && f.targetId === CHERRY_PLACE_CHANNEL_IDS.THE_LITTLE_TALKING_RIRI
    ),
    'CHANNEL_TYPE_MISMATCH finding generated for voice channel wrongly typed as text'
  );

  // Test 7: Unexpected Entities Detection (Extra Channels and Categories)
  console.log('\nTest 7: Unexpected Extra Entities Detection');
  const unexpectedSnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    categories: [
      ...canonicalSnapshot.categories,
      { id: '999000111', name: '🤖 Categoria Teste Bot', position: 7 },
    ],
    channels: [
      ...canonicalSnapshot.channels,
      { id: '888000222', name: 'spam-bot', type: 'text', parentId: '999000111', position: 1 },
    ],
  };
  const unexpectedReport = validator.validate(unexpectedSnapshot);
  assert(unexpectedReport.metrics.unexpectedCategoriesCount === 1, 'Unexpected category count detected');
  assert(unexpectedReport.metrics.unexpectedChannelsCount === 1, 'Unexpected channel count detected');
  assert(
    unexpectedReport.allFindings.some((f) => f.code === 'UNEXPECTED_CATEGORY'),
    'UNEXPECTED_CATEGORY finding generated'
  );
  assert(
    unexpectedReport.allFindings.some((f) => f.code === 'UNEXPECTED_CHANNEL'),
    'UNEXPECTED_CHANNEL finding generated'
  );

  // Test 8: Position & Order Divergences Detection
  console.log('\nTest 8: Position Order Divergence Detection');
  const positionDisplacedSnapshot: DiscordServerSnapshot = {
    ...canonicalSnapshot,
    categories: canonicalSnapshot.categories.map((c) => {
      if (c.id === CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES) {
        return { ...c, position: 5 }; // Displace from 1 to 5
      }
      return c;
    }),
    channels: canonicalSnapshot.channels.map((ch) => {
      if (ch.id === CHERRY_PLACE_CHANNEL_IDS.BOAS_VINDAS) {
        return { ...ch, position: 3 }; // Displace from 1 to 3
      }
      return ch;
    }),
  };
  const positionReport = validator.validate(positionDisplacedSnapshot);
  assert(
    positionReport.allFindings.some((f) => f.code === 'CATEGORY_POSITION_DIVERGENCE'),
    'CATEGORY_POSITION_DIVERGENCE detected'
  );
  assert(
    positionReport.allFindings.some((f) => f.code === 'CHANNEL_POSITION_DIVERGENCE'),
    'CHANNEL_POSITION_DIVERGENCE detected'
  );

  // Test 9: Markdown Diagnostic Report Generation
  console.log('\nTest 9: Markdown Diagnostic Report Output Quality');
  const md = perfectReport.summaryMarkdown;
  assert(md.includes('Diagnóstico do Mapa do Servidor'), 'Markdown contains report title');
  assert(md.includes('Cherry Place'), 'Markdown contains server name');
  assert(md.includes('Garantia Não-Destrutiva'), 'Markdown confirms non-destructive safety guarantee');
  assert(md.includes('Score: **100%**'), 'Markdown contains score');

  // Test 10: Administrative Diagnostic Slash Command Execution (/foxty diagnostico)
  console.log('\nTest 10: Administrative Slash Command Diagnostic Execution');
  const config = loadConfig();
  const core = new FoxtyCore(config);

  const diagSlashResult = await core.handleSlashCommand({
    commandName: 'foxty',
    subcommand: 'diagnostico',
    author: 'Kris',
    channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
  });

  assert(
    diagSlashResult.reply.includes('Diagnóstico do Mapa') && diagSlashResult.reply.includes('Cherry Place'),
    'Slash command /foxty subcommand:diagnostico returns diagnostic summary'
  );
  assert(diagSlashResult.decision.decision === 'respond', 'Slash command decision is respond');

  const mapaSlashResult = await core.handleSlashCommand({
    commandName: 'foxty',
    subcommand: 'mapa',
    author: 'Kris',
    channelId: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
  });

  assert(
    mapaSlashResult.reply.includes('Diagnóstico do Mapa'),
    'Slash command /foxty subcommand:mapa executes validator'
  );

  return { passed, failed };
}
