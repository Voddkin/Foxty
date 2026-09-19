// ============================================================================
// CHERRY PLACE SERVER MAP VALIDATOR
// Read-only diagnostic tool that compares Discord server state with canonical model
// ============================================================================

import {
  CHERRY_PLACE_SERVER,
  CHERRY_PLACE_CATEGORIES,
  CHERRY_PLACE_CHANNELS,
  CherryPlaceCategory,
  CherryPlaceChannel,
} from '../config/cherryPlaceModel.js';
import {
  CategoryValidationResult,
  ChannelValidationResult,
  DiscordServerSnapshot,
  ServerMapValidationReport,
  UnexpectedEntity,
  ValidationFinding,
  ValidationSeverity,
} from '../types.js';

export class ServerMapValidator {
  /**
   * Generates a canonical baseline snapshot representing the expected state.
   */
  public static getCanonicalSnapshot(): DiscordServerSnapshot {
    return {
      guildId: CHERRY_PLACE_SERVER.id,
      guildName: CHERRY_PLACE_SERVER.name,
      categories: CHERRY_PLACE_CATEGORIES.map((cat) => ({
        id: cat.id,
        name: cat.decoratedName,
        position: cat.order,
      })),
      channels: CHERRY_PLACE_CHANNELS.map((ch) => ({
        id: ch.id,
        name: ch.decoratedName,
        type: ch.type,
        parentId: ch.categoryId,
        position: ch.order,
      })),
    };
  }

  /**
   * Performs complete non-destructive validation comparing actual Discord server snapshot
   * against the canonical Cherry Place model.
   *
   * @param actual Actual Discord server snapshot or live data
   */
  public validate(actual: DiscordServerSnapshot): ServerMapValidationReport {
    const timestamp = new Date().toISOString();
    const findings: ValidationFinding[] = [];

    // 1. Guild Validation
    const isGuildIdMatch = actual.guildId === CHERRY_PLACE_SERVER.id;
    const isGuildNameMatch =
      actual.guildName.toLowerCase().includes('cherry place') ||
      actual.guildName === CHERRY_PLACE_SERVER.name ||
      actual.guildName === CHERRY_PLACE_SERVER.decoratedName;

    const guildFindings: ValidationFinding[] = [];
    if (!isGuildIdMatch) {
      const f: ValidationFinding = {
        code: 'GUILD_ID_MISMATCH',
        severity: 'ERROR',
        targetType: 'guild',
        targetId: actual.guildId,
        targetName: actual.guildName,
        expected: CHERRY_PLACE_SERVER.id,
        actual: actual.guildId,
        message: `Guild ID '${actual.guildId}' não corresponde ao ID canônico de Cherry Place ('${CHERRY_PLACE_SERVER.id}').`,
      };
      guildFindings.push(f);
      findings.push(f);
    }

    if (!isGuildNameMatch) {
      const f: ValidationFinding = {
        code: 'GUILD_NAME_MISMATCH',
        severity: 'WARNING',
        targetType: 'guild',
        targetId: actual.guildId,
        targetName: actual.guildName,
        expected: CHERRY_PLACE_SERVER.name,
        actual: actual.guildName,
        message: `Nome do servidor '${actual.guildName}' difere do padrão canônico 'Cherry Place'.`,
      };
      guildFindings.push(f);
      findings.push(f);
    }

    // Maps for fast lookup
    const actualCatById = new Map<string, { id: string; name: string; position?: number }>();
    const actualCatByName = new Map<string, { id: string; name: string; position?: number }>();
    for (const c of actual.categories) {
      actualCatById.set(c.id, c);
      const norm = this.normalizeName(c.name);
      if (norm) {
        actualCatByName.set(norm, c);
      }
    }

    const actualChById = new Map<string, { id: string; name: string; type: string; parentId?: string | null; position?: number }>();
    const actualChByName = new Map<string, { id: string; name: string; type: string; parentId?: string | null; position?: number }>();
    for (const ch of actual.channels) {
      actualChById.set(ch.id, ch);
      const norm = this.normalizeName(ch.name);
      if (norm) {
        actualChByName.set(norm, ch);
      }
    }

    // 2. Validate Categories
    const categoryResults: CategoryValidationResult[] = [];
    const matchedCategoryIds = new Set<string>();

    for (const canonicalCat of CHERRY_PLACE_CATEGORIES) {
      const catFindings: ValidationFinding[] = [];
      const foundById = actualCatById.get(canonicalCat.id);
      const normName = this.normalizeName(canonicalCat.name);
      const normDecorated = this.normalizeName(canonicalCat.decoratedName);
      const foundByName = (normName ? actualCatByName.get(normName) : undefined) ||
                          (normDecorated ? actualCatByName.get(normDecorated) : undefined);

      const matchedCat = foundById || foundByName;

      if (!matchedCat) {
        const f: ValidationFinding = {
          code: 'CATEGORY_MISSING',
          severity: 'ERROR',
          targetType: 'category',
          targetId: canonicalCat.id,
          targetName: canonicalCat.name,
          expected: canonicalCat.id,
          actual: null,
          message: `Categoria canônica '${canonicalCat.name}' (ID: ${canonicalCat.id}) está ausente no servidor Discord.`,
        };
        catFindings.push(f);
        findings.push(f);

        categoryResults.push({
          canonicalId: canonicalCat.id,
          canonicalName: canonicalCat.name,
          decoratedName: canonicalCat.decoratedName,
          expectedOrder: canonicalCat.order,
          status: 'MISSING',
          channelsSummary: { totalExpected: 0, matched: 0, missing: 0, divergent: 0 },
          findings: catFindings,
        });
        continue;
      }

      matchedCategoryIds.add(matchedCat.id);

      // Check ID
      if (matchedCat.id !== canonicalCat.id) {
        const f: ValidationFinding = {
          code: 'CATEGORY_ID_MISMATCH',
          severity: 'ERROR',
          targetType: 'category',
          targetId: matchedCat.id,
          targetName: matchedCat.name,
          expected: canonicalCat.id,
          actual: matchedCat.id,
          message: `Categoria '${canonicalCat.name}' encontrada com ID divergente '${matchedCat.id}' (esperado: '${canonicalCat.id}').`,
        };
        catFindings.push(f);
        findings.push(f);
      }

      // Check Name formatting
      if (
        matchedCat.name !== canonicalCat.decoratedName &&
        matchedCat.name !== canonicalCat.name &&
        this.normalizeName(matchedCat.name) !== this.normalizeName(canonicalCat.name)
      ) {
        const f: ValidationFinding = {
          code: 'CATEGORY_NAME_FORMAT_DIVERGENCE',
          severity: 'INFO',
          targetType: 'category',
          targetId: matchedCat.id,
          targetName: matchedCat.name,
          expected: canonicalCat.decoratedName,
          actual: matchedCat.name,
          message: `Nome da categoria '${matchedCat.name}' difere do padrão decorado canônico '${canonicalCat.decoratedName}'.`,
        };
        catFindings.push(f);
        findings.push(f);
      }

      // Check Position
      if (typeof matchedCat.position === 'number' && matchedCat.position !== canonicalCat.order) {
        const f: ValidationFinding = {
          code: 'CATEGORY_POSITION_DIVERGENCE',
          severity: 'WARNING',
          targetType: 'category',
          targetId: matchedCat.id,
          targetName: matchedCat.name,
          expected: canonicalCat.order,
          actual: matchedCat.position,
          message: `Posição da categoria '${canonicalCat.name}' está em #${matchedCat.position} (ordem canônica esperada: #${canonicalCat.order}).`,
        };
        catFindings.push(f);
        findings.push(f);
      }

      const hasError = catFindings.some((f) => f.severity === 'ERROR');
      const hasWarning = catFindings.some((f) => f.severity === 'WARNING' || f.severity === 'INFO');

      categoryResults.push({
        canonicalId: canonicalCat.id,
        canonicalName: canonicalCat.name,
        decoratedName: canonicalCat.decoratedName,
        expectedOrder: canonicalCat.order,
        status: hasError ? 'DIVERGENT' : hasWarning ? 'DIVERGENT' : 'MATCH',
        actualId: matchedCat.id,
        actualName: matchedCat.name,
        actualPosition: matchedCat.position,
        channelsSummary: { totalExpected: 0, matched: 0, missing: 0, divergent: 0 },
        findings: catFindings,
      });
    }

    // 3. Validate Channels
    const channelResults: ChannelValidationResult[] = [];
    const matchedChannelIds = new Set<string>();

    for (const canonicalCh of CHERRY_PLACE_CHANNELS) {
      const chFindings: ValidationFinding[] = [];
      const foundById = actualChById.get(canonicalCh.id);
      const foundByName = actualChByName.get(this.normalizeName(canonicalCh.technicalName)) ||
                          actualChByName.get(this.normalizeName(canonicalCh.name)) ||
                          actualChByName.get(this.normalizeName(canonicalCh.decoratedName));

      const matchedCh = foundById || foundByName;

      if (!matchedCh) {
        const f: ValidationFinding = {
          code: 'CHANNEL_MISSING',
          severity: 'ERROR',
          targetType: 'channel',
          targetId: canonicalCh.id,
          targetName: canonicalCh.name,
          expected: canonicalCh.id,
          actual: null,
          message: `Canal canônico '${canonicalCh.name}' (#${canonicalCh.technicalName}, ID: ${canonicalCh.id}) está ausente no servidor.`,
        };
        chFindings.push(f);
        findings.push(f);

        channelResults.push({
          canonicalId: canonicalCh.id,
          canonicalName: canonicalCh.name,
          technicalName: canonicalCh.technicalName,
          decoratedName: canonicalCh.decoratedName,
          expectedType: canonicalCh.type,
          expectedCategoryId: canonicalCh.categoryId,
          expectedCategoryName: canonicalCh.categoryName,
          expectedOrder: canonicalCh.order,
          status: 'MISSING',
          findings: chFindings,
        });
        continue;
      }

      matchedChannelIds.add(matchedCh.id);

      // Check ID
      if (matchedCh.id !== canonicalCh.id) {
        const f: ValidationFinding = {
          code: 'CHANNEL_ID_MISMATCH',
          severity: 'ERROR',
          targetType: 'channel',
          targetId: matchedCh.id,
          targetName: matchedCh.name,
          expected: canonicalCh.id,
          actual: matchedCh.id,
          message: `Canal '${canonicalCh.name}' encontrado com ID divergente '${matchedCh.id}' (esperado: '${canonicalCh.id}').`,
        };
        chFindings.push(f);
        findings.push(f);
      }

      // Check Channel Type (text vs voice)
      const normalizedActualType = this.normalizeChannelType(matchedCh.type);
      if (normalizedActualType !== canonicalCh.type) {
        const f: ValidationFinding = {
          code: 'CHANNEL_TYPE_MISMATCH',
          severity: 'ERROR',
          targetType: 'channel',
          targetId: matchedCh.id,
          targetName: matchedCh.name,
          expected: canonicalCh.type,
          actual: normalizedActualType,
          message: `Tipo do canal '${canonicalCh.name}' é '${normalizedActualType}', mas esperado canônico é '${canonicalCh.type}'.`,
        };
        chFindings.push(f);
        findings.push(f);
      }

      // Check Parent Category
      if (matchedCh.parentId !== canonicalCh.categoryId) {
        const expectedParent = CHERRY_PLACE_CATEGORIES.find((c) => c.id === canonicalCh.categoryId);
        const actualParent = actualCatById.get(matchedCh.parentId || '');
        const f: ValidationFinding = {
          code: 'CHANNEL_PARENT_MISMATCH',
          severity: 'ERROR',
          targetType: 'channel',
          targetId: matchedCh.id,
          targetName: matchedCh.name,
          expected: `${expectedParent?.name || canonicalCh.categoryId} (${canonicalCh.categoryId})`,
          actual: matchedCh.parentId ? `${actualParent?.name || matchedCh.parentId} (${matchedCh.parentId})` : 'Nenhuma (sem categoria)',
          message: `Canal '${canonicalCh.name}' está sob a categoria pai '${actualParent?.name || matchedCh.parentId || 'Nenhuma'}', esperado '${expectedParent?.name || canonicalCh.categoryId}'.`,
        };
        chFindings.push(f);
        findings.push(f);
      }

      // Check Name format
      if (
        matchedCh.name !== canonicalCh.decoratedName &&
        matchedCh.name !== canonicalCh.technicalName &&
        this.normalizeName(matchedCh.name) !== this.normalizeName(canonicalCh.technicalName)
      ) {
        const f: ValidationFinding = {
          code: 'CHANNEL_NAME_FORMAT_DIVERGENCE',
          severity: 'INFO',
          targetType: 'channel',
          targetId: matchedCh.id,
          targetName: matchedCh.name,
          expected: canonicalCh.decoratedName,
          actual: matchedCh.name,
          message: `Nome do canal '${matchedCh.name}' difere do padrão canônico '${canonicalCh.decoratedName}'.`,
        };
        chFindings.push(f);
        findings.push(f);
      }

      // Check Position within category
      if (typeof matchedCh.position === 'number' && matchedCh.position !== canonicalCh.order) {
        const f: ValidationFinding = {
          code: 'CHANNEL_POSITION_DIVERGENCE',
          severity: 'WARNING',
          targetType: 'channel',
          targetId: matchedCh.id,
          targetName: matchedCh.name,
          expected: canonicalCh.order,
          actual: matchedCh.position,
          message: `Posição do canal '${canonicalCh.name}' está em #${matchedCh.position} (ordem canônica esperada: #${canonicalCh.order}).`,
        };
        chFindings.push(f);
        findings.push(f);
      }

      const hasError = chFindings.some((f) => f.severity === 'ERROR');
      const hasWarning = chFindings.some((f) => f.severity === 'WARNING' || f.severity === 'INFO');

      channelResults.push({
        canonicalId: canonicalCh.id,
        canonicalName: canonicalCh.name,
        technicalName: canonicalCh.technicalName,
        decoratedName: canonicalCh.decoratedName,
        expectedType: canonicalCh.type,
        expectedCategoryId: canonicalCh.categoryId,
        expectedCategoryName: canonicalCh.categoryName,
        expectedOrder: canonicalCh.order,
        status: hasError ? 'DIVERGENT' : hasWarning ? 'DIVERGENT' : 'MATCH',
        actualId: matchedCh.id,
        actualName: matchedCh.name,
        actualType: normalizedActualType,
        actualParentId: matchedCh.parentId,
        actualPosition: matchedCh.position,
        findings: chFindings,
      });
    }

    // 4. Update Category Channels Summaries
    for (const catRes of categoryResults) {
      const channelsInCat = channelResults.filter((ch) => ch.expectedCategoryId === catRes.canonicalId);
      catRes.channelsSummary = {
        totalExpected: channelsInCat.length,
        matched: channelsInCat.filter((c) => c.status === 'MATCH').length,
        missing: channelsInCat.filter((c) => c.status === 'MISSING').length,
        divergent: channelsInCat.filter((c) => c.status === 'DIVERGENT').length,
      };
    }

    // 5. Detect Unexpected Entities (Channels & Categories present in Discord but not canonical)
    const unexpectedEntities: UnexpectedEntity[] = [];

    for (const actualCat of actual.categories) {
      if (!matchedCategoryIds.has(actualCat.id)) {
        const unexp: UnexpectedEntity = {
          id: actualCat.id,
          name: actualCat.name,
          type: 'category',
          position: actualCat.position,
        };
        unexpectedEntities.push(unexp);

        const f: ValidationFinding = {
          code: 'UNEXPECTED_CATEGORY',
          severity: 'WARNING',
          targetType: 'category',
          targetId: actualCat.id,
          targetName: actualCat.name,
          expected: 'Não constar no mapa canônico',
          actual: `Presente: '${actualCat.name}' (${actualCat.id})`,
          message: `Categoria inesperada encontrada no servidor Discord: '${actualCat.name}' (ID: ${actualCat.id}).`,
        };
        findings.push(f);
      }
    }

    for (const actualCh of actual.channels) {
      if (!matchedChannelIds.has(actualCh.id)) {
        const unexp: UnexpectedEntity = {
          id: actualCh.id,
          name: actualCh.name,
          type: 'channel',
          parentId: actualCh.parentId,
          channelType: this.normalizeChannelType(actualCh.type),
          position: actualCh.position,
        };
        unexpectedEntities.push(unexp);

        const f: ValidationFinding = {
          code: 'UNEXPECTED_CHANNEL',
          severity: 'WARNING',
          targetType: 'channel',
          targetId: actualCh.id,
          targetName: actualCh.name,
          expected: 'Não constar no mapa canônico',
          actual: `Presente: '${actualCh.name}' (${actualCh.id})`,
          message: `Canal inesperado encontrado no servidor Discord: '${actualCh.name}' (ID: ${actualCh.id}).`,
        };
        findings.push(f);
      }
    }

    // 6. Metrics & Final Compliance Score
    const totalExpectedCategories = CHERRY_PLACE_CATEGORIES.length;
    const matchedCategories = categoryResults.filter((c) => c.status === 'MATCH').length;
    const missingCategories = categoryResults.filter((c) => c.status === 'MISSING').length;

    const totalExpectedChannels = CHERRY_PLACE_CHANNELS.length;
    const matchedChannels = channelResults.filter((c) => c.status === 'MATCH').length;
    const missingChannels = channelResults.filter((c) => c.status === 'MISSING').length;

    const criticalErrorsCount = findings.filter((f) => f.severity === 'ERROR').length;
    const warningsCount = findings.filter((f) => f.severity === 'WARNING').length;

    // Compliance Score: Max 100
    // Guild match: 10 pts
    // Categories matched: up to 30 pts
    // Channels matched: up to 60 pts
    // Deduct for unexpected entities / warnings
    let rawScore = 0;
    if (isGuildIdMatch) rawScore += 10;
    rawScore += (matchedCategories / totalExpectedCategories) * 30;
    rawScore += (matchedChannels / totalExpectedChannels) * 60;
    rawScore -= unexpectedEntities.length * 3;
    rawScore -= warningsCount * 2;
    const complianceScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    let status: ServerMapValidationReport['status'] = 'PERFECT_MATCH';
    if (criticalErrorsCount > 0) {
      status = 'CRITICAL_DIVERGENCES';
    } else if (warningsCount > 0 || unexpectedEntities.length > 0 || complianceScore < 100) {
      status = 'COMPLIANT_WITH_WARNINGS';
    }

    const report: ServerMapValidationReport = {
      timestamp,
      status,
      isSafeAndNonDestructive: true,
      guildValidation: {
        canonicalId: CHERRY_PLACE_SERVER.id,
        canonicalName: CHERRY_PLACE_SERVER.name,
        actualId: actual.guildId,
        actualName: actual.guildName,
        isGuildIdMatch,
        isGuildNameMatch,
        findings: guildFindings,
      },
      metrics: {
        totalExpectedCategories,
        matchedCategories,
        missingCategories,
        totalExpectedChannels,
        matchedChannels,
        missingChannels,
        unexpectedChannelsCount: unexpectedEntities.filter((e) => e.type === 'channel').length,
        unexpectedCategoriesCount: unexpectedEntities.filter((e) => e.type === 'category').length,
        criticalErrorsCount,
        warningsCount,
        complianceScore,
      },
      categories: categoryResults,
      channels: channelResults,
      unexpectedEntities,
      allFindings: findings,
      summaryMarkdown: '',
    };

    report.summaryMarkdown = this.formatMarkdownReport(report);
    return report;
  }

  /**
   * Generates a readable Discord / Terminal Markdown summary report.
   */
  public formatMarkdownReport(report: ServerMapValidationReport): string {
    const statusEmoji =
      report.status === 'PERFECT_MATCH'
        ? '✅'
        : report.status === 'COMPLIANT_WITH_WARNINGS'
        ? '⚠️'
        : '❌';

    const statusTitle =
      report.status === 'PERFECT_MATCH'
        ? '100% CANÔNICO (PERFEITO)'
        : report.status === 'COMPLIANT_WITH_WARNINGS'
        ? 'CONFORME COM RESSALVAS'
        : 'DIVERGÊNCIAS CRÍTICAS DETECTADAS';

    let md = `## 🗺️ **Diagnóstico do Mapa do Servidor — Cherry Place**\n`;
    md += `**Status Global**: ${statusEmoji} **${statusTitle}** (Score: **${report.metrics.complianceScore}%**)\n`;
    md += `*Auditoria não-destrutiva executada em ${new Date(report.timestamp).toLocaleString('pt-BR')}*\n\n`;

    // Guild Check
    const guildOk = report.guildValidation.isGuildIdMatch && report.guildValidation.isGuildNameMatch;
    md += `### 🏰 **1. Guild / Servidor**\n`;
    md += `• **Esperado**: \`${CHERRY_PLACE_SERVER.name}\` (\`${CHERRY_PLACE_SERVER.id}\`)\n`;
    md += `• **Conectado**: \`${report.guildValidation.actualName || 'Desconhecido'}\` (\`${report.guildValidation.actualId || 'Sem ID'}\`)\n`;
    md += `• **Status**: ${guildOk ? '✅ Identificação Canônica Confirmada' : '❌ Divergência de Servidor'}\n\n`;

    // Metrics Summary
    md += `### 📊 **2. Métricas de Conformidade**\n`;
    md += `• **Categorias**: ${report.metrics.matchedCategories}/${report.metrics.totalExpectedCategories} conformes`;
    if (report.metrics.missingCategories > 0) md += ` (⚠️ ${report.metrics.missingCategories} ausentes)`;
    md += `\n• **Canais**: ${report.metrics.matchedChannels}/${report.metrics.totalExpectedChannels} conformes`;
    if (report.metrics.missingChannels > 0) md += ` (❌ ${report.metrics.missingChannels} ausentes)`;
    if (report.metrics.unexpectedChannelsCount > 0) md += ` (➕ ${report.metrics.unexpectedChannelsCount} inesperados)`;
    md += `\n• **Erros Críticos**: \`${report.metrics.criticalErrorsCount}\` | **Alertas**: \`${report.metrics.warningsCount}\`\n\n`;

    // Categories and Channels breakdown
    md += `### 📂 **3. Estrutura por Categorias e Canais**\n`;
    for (const cat of report.categories) {
      const catIcon = cat.status === 'MATCH' ? '📁' : cat.status === 'MISSING' ? '❌' : '⚠️';
      md += `${catIcon} **${cat.canonicalName}** \`[ID: ${cat.canonicalId}]\` — *${cat.channelsSummary.matched}/${cat.channelsSummary.totalExpected} canais*\n`;

      const catChannels = report.channels.filter((ch) => ch.expectedCategoryId === cat.canonicalId);
      for (const ch of catChannels) {
        const chIcon = ch.status === 'MATCH' ? '✅' : ch.status === 'MISSING' ? '❌' : '⚠️';
        const typeBadge = ch.expectedType === 'voice' ? '🔊 [Voz]' : '💬 [Texto]';
        md += `  └─ ${chIcon} ${typeBadge} **${ch.canonicalName}** (\`#${ch.technicalName}\` — \`${ch.canonicalId}\`)`;
        if (ch.status === 'MISSING') {
          md += ` **[AUSENTE]**`;
        } else if (ch.status === 'DIVERGENT') {
          const errCodes = ch.findings.map((f) => f.code).join(', ');
          md += ` *(${errCodes})*`;
        }
        md += `\n`;
      }
    }

    // Unexpected items
    if (report.unexpectedEntities.length > 0) {
      md += `\n### ➕ **4. Entidades Inesperadas (Fora do Modelo Canônico)**\n`;
      for (const unexp of report.unexpectedEntities) {
        md += `• ⚠️ **${unexp.type === 'category' ? 'Categoria' : 'Canal'}**: \`${unexp.name}\` (\`${unexp.id}\`)\n`;
      }
    }

    // Findings List
    if (report.allFindings.length > 0) {
      md += `\n### 🔍 **5. Lista Detalhada de Achados (${report.allFindings.length})**\n`;
      for (const f of report.allFindings) {
        const fIcon = f.severity === 'ERROR' ? '❌' : f.severity === 'WARNING' ? '⚠️' : 'ℹ️';
        md += `• ${fIcon} **[${f.code}]** ${f.message}\n`;
      }
    } else {
      md += `\n> ✨ **Perfeito! Nenhuma inconsistência encontrada. A topologia do Discord reflete 100% o modelo canônico de Cherry Place.**\n`;
    }

    md += `\n🔒 *Garantia Não-Destrutiva: Nenhuma modificação automática foi aplicada ao servidor.*`;
    return md;
  }

  /**
   * Helper to normalize text names for fuzzy matching.
   */
  private normalizeName(name: string): string {
    if (!name) return '';
    return name
      .normalize('NFKD') // Compatibility decomposition (handles mathematical styled fonts & accents)
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^\w\s-]/g, '') // remove remaining non-alphanumeric symbols/emojis
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '') // strip leading/trailing hyphens
      .trim();
  }

  /**
   * Normalizes Discord channel types into 'text' | 'voice'.
   */
  private normalizeChannelType(type: string | number | undefined): 'text' | 'voice' {
    if (type === 'voice' || type === 2 || type === 'GuildVoice' || type === 'GUILD_VOICE') {
      return 'voice';
    }
    return 'text';
  }
}
