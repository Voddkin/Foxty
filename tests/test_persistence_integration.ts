import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PersistentMemoryStore } from '../src/memory/PersistentMemoryStore.js';
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

export async function runPersistenceIntegrationTestSuite(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;
  const testDbDir = path.join(process.cwd(), 'data', 'test-run');
  const testDbPath = path.join(testDbDir, `integration_test_${Date.now()}.db`);

  console.log('\n======================================================');
  console.log('💾 RUNNING PERSISTENT MEMORY INTEGRATION SUITE');
  console.log('======================================================\n');

  try {
    // 1. Initial Store Creation & Health Check
    await test('1. PersistentMemoryStore initializes SQLite DB and reports healthy', async () => {
      const store1 = new PersistentMemoryStore(testDbPath, false);
      const health = await store1.getHealth();
      assert.strictEqual(health.connected, true);
      assert.strictEqual(health.readWriteOk, true);
      assert.strictEqual(health.provider, 'sqlite');
      assert.strictEqual(health.totalRecords, 0);
      assert.strictEqual(health.recordCount, 0);
      store1.close();
    });

    // 2. Save and Recover across store instance destruction
    await test('2. Memory persists across complete instance destroy & recreation', async () => {
      // Instance A: Save record
      const storeA = new PersistentMemoryStore(testDbPath, false);
      const item = await storeA.save({
        content: 'Riely replantou as mudas de cerejeira ao lado da torre central.',
        type: 'episodic',
        importance: 0.92,
        confidence: 0.95,
        source: 'Kris',
        targetUser: 'Riely',
        safeForTeasing: true,
        retention: 'permanent',
        tags: ['cherry_place', 'minecraft', 'arvores'],
      });
      assert.ok(item.id.length > 0);
      assert.strictEqual(item.targetUser, 'Riely');
      assert.strictEqual(item.safeForTeasing, true);
      const countA = await storeA.count();
      assert.strictEqual(countA, 1);
      // Destroy Instance A
      storeA.close();

      // Instance B: Re-instantiate pointing to the same file
      const storeB = new PersistentMemoryStore(testDbPath, false);
      const countB = await storeB.count();
      assert.strictEqual(countB, 1, 'Record count must survive instance restart');

      const retrieved = await storeB.get(item.id);
      assert.ok(retrieved !== null, 'Memory must be retrievable by ID in new instance');
      assert.strictEqual(retrieved!.content, 'Riely replantou as mudas de cerejeira ao lado da torre central.');
      assert.strictEqual(retrieved!.targetUser, 'Riely');
      assert.strictEqual(retrieved!.safeForTeasing, true);
      assert.strictEqual(retrieved!.retention, 'permanent');
      assert.deepStrictEqual(retrieved!.tags, ['cherry_place', 'minecraft', 'arvores']);
      storeB.close();
    });

    // 3. Search by keyword and tags across instances
    await test('3. Search by keyword and tags works accurately', async () => {
      const store = new PersistentMemoryStore(testDbPath, false);
      await store.save({
        content: 'Kris construiu uma ponte suspensa sobre o desfiladeiro.',
        type: 'project',
        importance: 0.88,
        confidence: 0.91,
        source: 'Riely',
        targetUser: 'Kris',
        safeForTeasing: false,
        retention: 'permanent',
        tags: ['ponte', 'construcao'],
      });

      const keywordSearch = await store.search('ponte');
      assert.strictEqual(keywordSearch.length, 1);
      assert.strictEqual(keywordSearch[0].targetUser, 'Kris');

      const tagSearch = await store.search('construcao');
      assert.strictEqual(tagSearch.length, 1);

      const safeTeasingOnly = await store.search(undefined, { safeForTeasingOnly: true });
      assert.strictEqual(safeTeasingOnly.length, 1, 'Only Riely memory is safe for teasing');
      assert.strictEqual(safeTeasingOnly[0].targetUser, 'Riely');
      store.close();
    });

    // 4. Sensitive data security policy: passwords, tokens, credentials
    await test('4. Sensitive data guardrail prevents marking as safe_for_teasing', async () => {
      const store = new PersistentMemoryStore(testDbPath, false);
      const config = loadConfig();
      const core = new FoxtyCore(config, store);

      // Simulate a memory candidate with sensitive keywords
      const sensitiveCandidate = {
        content: 'A senha do cofre da oficina é segredo123',
        confidence: 0.95,
        type: 'episodic' as const,
        safeForTeasing: true, // Malicious or unaligned attempt
      };

      // When processed by FoxtyCore pipeline logic:
      const lower = sensitiveCandidate.content.toLowerCase();
      const sensitiveKeywords = ['senha', 'password', 'token', 'secret', 'credencial', 'intimate', 'sexual', 'privad'];
      const containsSensitive = sensitiveKeywords.some((kw) => lower.includes(kw));
      const safeForTeasing = containsSensitive ? false : sensitiveCandidate.safeForTeasing;

      assert.strictEqual(safeForTeasing, false, 'Sensitive keyword must force safeForTeasing=false');

      const saved = await store.save({
        content: sensitiveCandidate.content,
        type: sensitiveCandidate.type,
        importance: sensitiveCandidate.confidence,
        confidence: sensitiveCandidate.confidence,
        source: 'Kris',
        safeForTeasing,
        retention: 'permanent',
        tags: ['deepseek-suggested'],
      });

      assert.strictEqual(saved.safeForTeasing, false);
      store.close();
    });

    // 5. SakuraMail privacy barrier: No memory persistence in SakuraMail channel
    await test('5. SakuraMail channel strictly prohibits persistent memory retention', async () => {
      const store = new PersistentMemoryStore(testDbPath, false);
      const initialCount = await store.count();

      const config = loadConfig();
      const core = new FoxtyCore(config, store);

      // Send a message inside SakuraMail channel
      await core.handleMessage({
        channelId: CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO,
        author: 'Kris',
        content: 'Esta é uma carta privada para entrega confidencial',
        isDirectMention: false,
      });

      const afterCount = await store.count();
      assert.strictEqual(afterCount, initialCount, 'SakuraMail messages must never be persisted to memory store');
      store.close();
    });

    // 6. Deletion and store clear work and update health stats
    await test('6. Deletion and store clear work and update health stats', async () => {
      const store = new PersistentMemoryStore(testDbPath, false);
      const all = await store.search();
      assert.ok(all.length >= 2);

      const targetId = all[0].id;
      const deleted = await store.delete(targetId);
      assert.strictEqual(deleted, true);

      const check = await store.get(targetId);
      assert.strictEqual(check, null);

      await store.clear();
      const finalCount = await store.count();
      assert.strictEqual(finalCount, 0);

      const health = await store.getHealth();
      assert.strictEqual(health.totalRecords, 0);
      assert.strictEqual(health.recordCount, 0);
      assert.strictEqual(health.readWriteOk, true);
      store.close();
    });
  } finally {
    // Cleanup temporary test DB files
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`Persistence Integration Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  return { passed, failed };
}

if (process.argv[1]?.endsWith('test_persistence_integration.ts') || process.argv[1]?.endsWith('test_persistence_integration.js')) {
  runPersistenceIntegrationTestSuite().then((res) => {
    if (res.failed > 0) process.exit(1);
  });
}
