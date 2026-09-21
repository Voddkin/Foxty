import { IMemoryStore } from './MemoryStore.js';
import { MemoryItem, MigrationReport } from '../types.js';
import { logger, sanitizeSensitiveData } from '../core/Logger.js';

export interface MigrationOptions {
  overwrite?: boolean;
  filterSakuraMail?: boolean;
  batchSize?: number;
}

export class MigrationTool {
  /**
   * Migrates memories from a source store (e.g. SQLite PersistentMemoryStore) to a target store (e.g. FirestoreMemoryStore).
   * Preserves IDs, timestamps, privacy flags, and tags. Does not delete source data.
   */
  public async migrate(
    sourceStore: IMemoryStore,
    targetStore: IMemoryStore,
    options: MigrationOptions = {}
  ): Promise<MigrationReport> {
    const startTime = Date.now();
    const errors: string[] = [];

    const sourceHealth = await sourceStore.getHealth();
    const targetHealth = await targetStore.getHealth();

    logger.info(
      'MEMORY_MIGRATION',
      `Starting migration from [${sourceHealth.provider}] to [${targetHealth.provider}]`
    );

    let totalRead = 0;
    let migratedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;
    let privacyFilteredCount = 0;

    try {
      const allMemories = await sourceStore.getAll();
      totalRead = allMemories.length;

      for (const memory of allMemories) {
        try {
          // 1. SakuraMail Privacy Firewall check (Document 06)
          const lowerContent = memory.content.toLowerCase();
          const isSakuraMailLetter =
            lowerContent.includes('sakuramail') ||
            lowerContent.includes('carta secreta') ||
            lowerContent.includes('correspondência privada') ||
            memory.source === 'sakuramail_private';

          if (isSakuraMailLetter && !memory.safeForTeasing && options.filterSakuraMail !== false) {
            privacyFilteredCount++;
            logger.warn(
              'MIGRATION_PRIVACY',
              `Skipped private SakuraMail item ${memory.id} during migration`
            );
            continue;
          }

          // 2. Check for duplicate / existing in target if overwrite is disabled
          if (!options.overwrite) {
            const existing = await targetStore.get(memory.id);
            if (existing) {
              duplicateCount++;
              continue;
            }
          }

          // 3. Save to target preserving exact IDs, timestamps, and parameters
          await targetStore.save({
            id: memory.id,
            content: memory.content,
            type: memory.type,
            importance: memory.importance,
            confidence: memory.confidence,
            source: memory.source,
            targetUser: memory.targetUser,
            lastConfirmed: memory.lastConfirmed,
            expiresAt: memory.expiresAt,
            safeForTeasing: memory.safeForTeasing,
            retention: memory.retention,
            tags: memory.tags,
            scope: memory.scope,
            metadata: memory.metadata,
          });

          migratedCount++;
        } catch (itemErr: any) {
          skippedCount++;
          const errStr = `Error migrating memory ${memory.id}: ${sanitizeSensitiveData(itemErr.message)}`;
          errors.push(errStr);
          logger.error('MEMORY_MIGRATION', errStr);
        }
      }
    } catch (err: any) {
      const fatalErr = `Fatal migration error: ${sanitizeSensitiveData(err.message)}`;
      errors.push(fatalErr);
      logger.error('MEMORY_MIGRATION', fatalErr);
    }

    const durationMs = Date.now() - startTime;
    const report: MigrationReport = {
      totalRead,
      migratedCount,
      skippedCount,
      duplicateCount,
      privacyFilteredCount,
      errors,
      timestamp: new Date().toISOString(),
      durationMs,
      sourceProvider: sourceHealth.provider,
      targetProvider: targetHealth.provider,
    };

    logger.info(
      'MEMORY_MIGRATION',
      `Migration complete in ${durationMs}ms: ${migratedCount} migrated, ${duplicateCount} duplicates, ${privacyFilteredCount} privacy-filtered, ${errors.length} errors.`
    );

    return report;
  }
}

export const migrationTool = new MigrationTool();
