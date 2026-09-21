import { FirestoreMemoryStore } from '../src/memory/FirestoreMemoryStore.js';
import { PersistentMemoryStore } from '../src/memory/PersistentMemoryStore.js';
import { InMemoryStore } from '../src/memory/InMemoryStore.js';
import { ContextualRetriever } from '../src/memory/ContextualRetriever.js';
import { MigrationTool } from '../src/memory/MigrationTool.js';
import { MemoryItem } from '../src/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

/**
 * Mock Firestore in-memory backend for deterministic CI & local tests.
 */
class MockFirestoreCollection {
  public docs: Map<string, any> = new Map();

  doc(id: string) {
    return {
      set: async (data: any) => {
        this.docs.set(id, { ...data, id });
      },
      get: async () => {
        const data = this.docs.get(id);
        return {
          exists: !!data,
          id,
          data: () => data,
        };
      },
      delete: async () => {
        this.docs.delete(id);
      },
    };
  }

  where(field: string, op: string, val: any) {
    const matchingDocs: any[] = [];
    for (const [id, doc] of this.docs.entries()) {
      if (op === '==' && doc[field] === val) {
        matchingDocs.push({ id, data: () => doc });
      }
    }
    return {
      where: (f2: string, op2: string, val2: any) => this.where(f2, op2, val2),
      get: async () => ({ docs: matchingDocs, size: matchingDocs.length }),
    };
  }

  async get() {
    const list: any[] = [];
    for (const [id, data] of this.docs.entries()) {
      list.push({ id, data: () => data });
    }
    return { docs: list, size: list.length };
  }

  count() {
    return {
      get: async () => ({
        data: () => ({ count: this.docs.size }),
      }),
    };
  }
}

export async function runFirestoreMemoryTestSuite() {
  console.log('======================================================');
  console.log('🔥 Test Suite: Real Firestore Persistent Memory & Retrieval');
  console.log('======================================================');

  const mockDb = {
    collection: (name: string) => new MockFirestoreCollection(),
  };

  const mockCollection = new MockFirestoreCollection();
  const firestoreStore = new FirestoreMemoryStore({
    projectId: 'foxty-test-project',
    databaseId: '(default)',
    collectionName: 'foxty_memories_test',
    customFirestoreInstance: {
      collection: () => mockCollection,
    },
  });

  // ----------------------------------------------------
  // Group 1: Basic CRUD Operations
  // ----------------------------------------------------
  console.log('\nGroup 1: Basic Save, Get, Count & Delete in Firestore');

  const saved1 = await firestoreStore.save({
    content: 'Kris construiu uma fazenda automática de ferro na base principal.',
    type: 'project',
    importance: 0.9,
    confidence: 0.95,
    safeForTeasing: true,
    targetUser: 'Kris',
    tags: ['minecraft', 'ferro', 'base'],
  });

  assert(!!saved1.id, 'Memory was saved with a unique ID');
  assert(saved1.type === 'project', 'Saved memory has type project');
  assert(saved1.targetUser === 'Kris', 'Saved memory targetUser is Kris');

  const fetched1 = await firestoreStore.get(saved1.id);
  assert(fetched1 !== null, 'Fetched memory is not null');
  assert(fetched1?.content === saved1.content, 'Fetched content matches saved content');
  assert(fetched1?.importance === 0.9, 'Fetched importance is 0.9');

  const countAfter1 = await firestoreStore.count();
  assert(countAfter1 === 1, `Count after 1 item is 1 (got ${countAfter1})`);

  // Save 2nd memory
  const saved2 = await firestoreStore.save({
    content: 'Riely caiu na lava enquanto explorava o Nether procurando netherite.',
    type: 'episodic',
    importance: 0.8,
    confidence: 0.9,
    safeForTeasing: true,
    targetUser: 'Riely',
    tags: ['nether', 'lava', 'morte'],
  });

  const countAfter2 = await firestoreStore.count();
  assert(countAfter2 === 2, `Count after 2 items is 2 (got ${countAfter2})`);

  // Delete 1st memory
  const deleted = await firestoreStore.delete(saved1.id);
  assert(deleted === true, 'Delete returns true');
  const fetchedDeleted = await firestoreStore.get(saved1.id);
  assert(fetchedDeleted === null, 'Deleted memory is null on get');

  // ----------------------------------------------------
  // Group 2: Filtered & Text Search
  // ----------------------------------------------------
  console.log('\nGroup 2: Multi-criteria Search & Filtering');

  // Re-save diverse memories
  await firestoreStore.save({
    id: 'mem-kris-portal',
    content: 'Kris perdeu as coordenadas da fortaleza do Nether.',
    type: 'episodic',
    importance: 0.85,
    confidence: 0.9,
    safeForTeasing: true,
    targetUser: 'Kris',
    tags: ['nether', 'coordenadas'],
  });

  await firestoreStore.save({
    id: 'mem-riely-secret',
    content: 'Riely tem uma fobia secreta de aranhas cavernícolas.',
    type: 'behavioral',
    importance: 0.7,
    confidence: 0.8,
    safeForTeasing: false, // NOT safe for teasing
    targetUser: 'Riely',
    tags: ['aranhas', 'comportamento'],
  });

  await firestoreStore.save({
    id: 'mem-server-cherry',
    content: 'O servidor Cherry Place comemora 1 ano no próximo sábado.',
    type: 'server',
    importance: 0.95,
    confidence: 1.0,
    safeForTeasing: true,
    tags: ['aniversario', 'evento'],
  });

  // Search by query text
  const searchNether = await firestoreStore.search('nether');
  assert(searchNether.length >= 2, `Search "nether" returned >=2 results (got ${searchNether.length})`);

  // Filter safeForTeasingOnly
  const searchSafe = await firestoreStore.search(undefined, { safeForTeasingOnly: true });
  assert(searchSafe.every((m) => m.safeForTeasing === true), 'All returned items are safeForTeasing');
  assert(!searchSafe.some((m) => m.id === 'mem-riely-secret'), 'Restricted item excluded when safeOnly is true');

  // Filter by targetUser
  const searchKris = await firestoreStore.search(undefined, { targetUser: 'Kris' });
  assert(searchKris.every((m) => m.targetUser === 'Kris'), 'All returned items target Kris');

  // Filter by minImportance
  const searchHighImp = await firestoreStore.search(undefined, { minImportance: 0.9 });
  assert(searchHighImp.every((m) => m.importance >= 0.9), 'All returned items have importance >= 0.9');

  // ----------------------------------------------------
  // Group 3: Expiration & Time-To-Live
  // ----------------------------------------------------
  console.log('\nGroup 3: Expiration & Retention Lifecycle');

  const pastDate = new Date(Date.now() - 10000).toISOString();
  const futureDate = new Date(Date.now() + 100000).toISOString();

  await firestoreStore.save({
    id: 'mem-temp-expired',
    content: 'Lembrete temporário de evento expirado',
    type: 'temporary',
    importance: 0.5,
    confidence: 0.8,
    safeForTeasing: true,
    expiresAt: pastDate,
    tags: ['temp'],
  });

  await firestoreStore.save({
    id: 'mem-temp-future',
    content: 'Lembrete futuro válido',
    type: 'temporary',
    importance: 0.5,
    confidence: 0.8,
    safeForTeasing: true,
    expiresAt: futureDate,
    tags: ['temp'],
  });

  const expiredCount = await firestoreStore.expire();
  assert(expiredCount === 1, `expire() purged 1 expired memory (got ${expiredCount})`);
  const checkExpired = await firestoreStore.get('mem-temp-expired');
  assert(checkExpired === null, 'Expired memory was deleted');
  const checkFuture = await firestoreStore.get('mem-temp-future');
  assert(checkFuture !== null, 'Future memory remains active');

  // ----------------------------------------------------
  // Group 4: Health Diagnostics & Observability
  // ----------------------------------------------------
  console.log('\nGroup 4: Memory Health & Diagnostics');

  const health = await firestoreStore.getHealth();
  assert(health.provider === 'firestore', 'Health reports provider as firestore');
  assert(health.connected === true, 'Health reports connected = true');
  assert(health.readOk === true, 'Health reports readOk = true');
  assert(health.writeOk === true, 'Health reports writeOk = true');
  assert(health.storagePath.includes('firestore://foxty-test-project'), 'StoragePath contains project ID');
  assert(health.collection === 'foxty_memories_test', 'Health contains collection name');

  // ----------------------------------------------------
  // Group 5: Privacy Boundary & SakuraMail Isolation (Document 06)
  // ----------------------------------------------------
  console.log('\nGroup 5: Privacy Barrier & SakuraMail Isolation');

  const privateLetterMemory = await firestoreStore.save({
    content: 'Carta secreta do SakuraMail de Kris para Riely sobre sentimentos confidenciais',
    type: 'episodic',
    importance: 0.9,
    confidence: 0.9,
    safeForTeasing: true, // Should be forcefully set to false by privacy firewall
    source: 'sakuramail_private',
    tags: ['sakuramail'],
  });

  assert(
    privateLetterMemory.safeForTeasing === false,
    'Privacy firewall forced safeForTeasing = false for SakuraMail content'
  );

  const tokenLeakMemory = await firestoreStore.save({
    content: 'O token de acesso secreto é token: MTU1MDc0MTE1MTE3NzUwNjg1Ng.Gv9Klm.abcdefghijklmn',
    type: 'episodic',
    importance: 0.5,
    confidence: 0.5,
    safeForTeasing: false,
    tags: ['secret'],
  });

  assert(
    !tokenLeakMemory.content.includes('MTU1MDc0MTE1MTE3NzUwNjg1Ng.Gv9Klm'),
    'Sensitive token stripped before persisting'
  );

  // ----------------------------------------------------
  // Group 6: Contextual Retriever (Multi-factor Ranking)
  // ----------------------------------------------------
  console.log('\nGroup 6: Contextual Retriever Scoring');

  const retriever = new ContextualRetriever();
  const scoredResults = await retriever.retrieve(firestoreStore, {
    queryText: 'ponte no nether e coordenadas',
    currentSpeaker: 'Kris',
    safeForTeasingRequired: true,
    limit: 3,
  });

  assert(scoredResults.length > 0, 'Contextual retriever returned scored memories');
  assert(
    scoredResults[0].score >= scoredResults[scoredResults.length - 1].score,
    'Results are sorted descending by calculated score'
  );
  assert(
    scoredResults.every((r) => r.memory.safeForTeasing === true),
    'Contextual retriever strictly enforced safeForTeasingRequired'
  );
  assert(
    scoredResults[0].breakdown.textMatchScore !== undefined,
    'Score contains detailed breakdown (textMatchScore)'
  );
  assert(
    scoredResults[0].breakdown.recencyScore !== undefined,
    'Score contains detailed breakdown (recencyScore)'
  );

  // ----------------------------------------------------
  // Group 7: SQLite to Firestore Migration Tool
  // ----------------------------------------------------
  console.log('\nGroup 7: SQLite -> Firestore Migration Tool');

  const sqliteMemorySource = new InMemoryStore(false);
  await sqliteMemorySource.save({
    id: 'sqlite-mem-1',
    content: 'Kris gosta de construir vilas temáticas medievais.',
    type: 'behavioral',
    importance: 0.8,
    confidence: 0.9,
    safeForTeasing: true,
    targetUser: 'Kris',
    tags: ['medieval', 'construcao'],
  });
  await sqliteMemorySource.save({
    id: 'sqlite-mem-2',
    content: 'Riely organizou os baús da sala de armazenamento.',
    type: 'episodic',
    importance: 0.75,
    confidence: 0.85,
    safeForTeasing: true,
    targetUser: 'Riely',
    tags: ['organizacao', 'baus'],
  });
  await sqliteMemorySource.save({
    id: 'sqlite-mem-private',
    content: 'SakuraMail: carta confidencial privada entre amigos',
    type: 'episodic',
    importance: 0.9,
    confidence: 0.9,
    safeForTeasing: false,
    source: 'sakuramail_private',
    tags: ['sakuramail'],
  });

  const targetMockCollection = new MockFirestoreCollection();
  const targetFirestore = new FirestoreMemoryStore({
    customFirestoreInstance: {
      collection: () => targetMockCollection,
    },
  });

  const migration = new MigrationTool();
  const report = await migration.migrate(sqliteMemorySource, targetFirestore, {
    overwrite: false,
    filterSakuraMail: true,
  });

  assert(report.totalRead === 3, `Migration read 3 source records (got ${report.totalRead})`);
  assert(report.migratedCount === 2, `Migrated 2 valid records (got ${report.migratedCount})`);
  assert(
    report.privacyFilteredCount === 1,
    `Filtered 1 private SakuraMail record (got ${report.privacyFilteredCount})`
  );
  assert(report.errors.length === 0, 'Zero migration errors');

  // Verify migrated record in target
  const checkMigrated = await targetFirestore.get('sqlite-mem-1');
  assert(checkMigrated !== null, 'Target store has migrated record sqlite-mem-1');
  assert(checkMigrated?.targetUser === 'Kris', 'Migrated record targetUser is preserved');
  assert(checkMigrated?.safeForTeasing === true, 'Migrated record safeForTeasing is preserved');

  console.log(`\nFirestore Memory Test Suite: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    throw new Error(`Firestore Memory Test Suite failed: ${failed} errors`);
  }
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runFirestoreMemoryTestSuite().catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
  });
}
