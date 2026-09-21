import { PersistentMemoryStore } from '../src/memory/PersistentMemoryStore.js';
import { FirestoreMemoryStore } from '../src/memory/FirestoreMemoryStore.js';
import { MigrationTool } from '../src/memory/MigrationTool.js';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  console.log('======================================================');
  console.log('📦 Foxty SQLite -> Firestore Memory Migration Tool');
  console.log('======================================================\n');

  const sqliteStore = new PersistentMemoryStore();
  const firestoreStore = new FirestoreMemoryStore();

  const sqliteHealth = await sqliteStore.getHealth();
  const firestoreHealth = await firestoreStore.getHealth();

  console.log(`- Source (SQLite): ${sqliteHealth.recordCount} memories found in ${sqliteHealth.storagePath}`);
  console.log(`- Target (Firestore): ${firestoreHealth.storagePath}`);
  console.log(`- Connected: ${firestoreHealth.connected ? 'YES' : 'NO'}\n`);

  const tool = new MigrationTool();
  console.log('Starting migration...');
  const report = await tool.migrate(sqliteStore, firestoreStore, {
    overwrite: false,
    filterSakuraMail: true,
  });

  console.log('\n======================================================');
  console.log('📊 Migration Report');
  console.log('======================================================');
  console.log(`- Total Read: ${report.totalRead}`);
  console.log(`- Successfully Migrated: ${report.migratedCount}`);
  console.log(`- Duplicates Skipped: ${report.duplicateCount}`);
  console.log(`- Privacy Filtered (SakuraMail): ${report.privacyFilteredCount}`);
  console.log(`- Errors: ${report.errors.length}`);
  console.log(`- Duration: ${report.durationMs}ms`);
  console.log('======================================================\n');

  if (report.errors.length > 0) {
    console.error('Errors encountered:');
    report.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('✅ Migration finished successfully without data loss.');
    process.exit(0);
  }
}

runMigration().catch((err) => {
  console.error('Migration failed with unhandled exception:', err);
  process.exit(1);
});
