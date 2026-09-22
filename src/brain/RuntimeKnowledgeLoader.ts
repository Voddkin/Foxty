import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  CanonicalDocumentCategory,
  CanonicalDocumentInfo,
  CanonicalDocumentMetadata,
  RuntimeKnowledgeStatus,
} from '../types.js';
import { logger } from '../core/Logger.js';

export type { RuntimeKnowledgeStatus };

const __filename = typeof import.meta?.url === 'string' ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

export const CANONICAL_DOCUMENTS_METADATA: readonly CanonicalDocumentMetadata[] = [
  {
    id: '01',
    filename: '01_PROJECT_CHARTER.md',
    title: 'Project Charter & Character Identity',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Visão fundamental, personalidade residente, papel no Cherry Place e separação de escopo com SakuraMail.',
  },
  {
    id: '02',
    filename: '02_KRIS_RIELY_SHARED_CONTEXT.md',
    title: 'Kris & Riely Shared Context',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Histórico interpessoal, mundos Minecraft, rituais de call, dinâmicas de amizade e memórias compartilhadas.',
  },
  {
    id: '03',
    filename: '03_KRIS_RIELY_LINGUISTIC_SIGNATURES.md',
    title: 'Kris & Riely Linguistic Signatures',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Padrões de digitação, vocabulário característico, pontuação, emoticons e detecção de desvios de hábito.',
  },
  {
    id: '04',
    filename: '04_CHERRY_PLACE_SERVER_MODEL.md',
    title: 'Cherry Place Server Model & Channel Topology',
    category: 'ARCHITECTURE_AND_INFRASTRUCTURE',
    description: 'Topologia dos 15 canais, 6 categorias, propósitos canônicos e políticas de presença.',
  },
  {
    id: '05',
    filename: '05_FOXY_DISCORD_AUTONOMY_AND_ACTIONS.md',
    title: 'Foxty Discord Autonomy & Actions',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Níveis de autonomia, economia de presença, bursts controlados e regras de interação no Discord.',
  },
  {
    id: '06',
    filename: '06_FOXY_OBSERVATION_PRIVACY_AND_MEMORY_BOUNDARY.md',
    title: 'Observation, Privacy & Memory Boundaries',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Barreira inviolável do SakuraMail, proteção de dados privados e política de retenção/brincadeiras.',
  },
  {
    id: '07',
    filename: '07_BEHAVIORAL_PATTERNS_BY_SITUATION.md',
    title: 'Behavioral Patterns by Situation',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Matriz de comportamentos situacionais: conversas casuais, debates, momentos de silêncio, eventos.',
  },
  {
    id: '08',
    filename: '08_EVENT_ENGINE.md',
    title: 'Event Engine Architecture & Spontaneous Triggers',
    category: 'ARCHITECTURE_AND_INFRASTRUCTURE',
    description: 'Engine de eventos, cooldowns globais, rituais periódicos e gatilhos contextuais.',
  },
  {
    id: '09',
    filename: '09_COMMANDS_AND_UTILITY_SCOPE.md',
    title: 'Commands & Utility Scope (/foxty)',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Escopo dos comandos slash /foxty, respostas determinísticas, diagnósticos e atitudes teatrais.',
  },
  {
    id: '10',
    filename: '10_TECHNICAL_ARCHITECTURE.md',
    title: 'Technical Architecture & Pipeline Invariants',
    category: 'ARCHITECTURE_AND_INFRASTRUCTURE',
    description: 'Arquitetura Core, pipeline de 4 dimensões, soberania do código sobre LLMs e isolamento de falhas.',
  },
  {
    id: '11',
    filename: '11_DEEPSEEK_BRAIN_CONTRACT.md',
    title: 'DeepSeek Brain Cognitive Contract',
    category: 'BEHAVIOR_AND_IDENTITY',
    description: 'Contrato de interpretação e sugestão de ações em JSON puro sem autoridade executiva direta.',
  },
  {
    id: '12',
    filename: '12_BUILD_PHASE_01.md',
    title: 'Foxty Build Phase 01 & Skeleton Guidelines',
    category: 'ARCHITECTURE_AND_INFRASTRUCTURE',
    description: 'Diretrizes de desenvolvimento da Fase 1, esqueleto técnico, escopo do SakuraMail e segurança de secrets.',
  },
] as const;

export interface LoadedDocumentEntry {
  info: CanonicalDocumentInfo;
  content: string;
}

export class RuntimeKnowledgeLoader {
  private baseDir: string;
  private documentsMap: Map<string, LoadedDocumentEntry> = new Map();
  private constitutionPrompt: string = '';
  private constitutionHash: string = '';
  private loadedAt: Date = new Date();
  private missingDocs: string[] = [];
  private emptyDocs: string[] = [];

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || this.detectProjectRoot();
    this.loadAllDocuments();
  }

  /**
   * Automatically detects the project root containing the canonical markdown files.
   */
  private detectProjectRoot(): string {
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(__dirname, '..', '..'),
      path.resolve(__dirname, '..', '..', '..'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, '01_PROJECT_CHARTER.md'))) {
        return candidate;
      }
    }

    return process.cwd();
  }

  /**
   * Resolves the absolute path for a canonical filename.
   */
  public resolveFilePath(filename: string): string {
    return path.join(this.baseDir, filename);
  }

  /**
   * Computes a SHA-256 hash for a given string content.
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Reads and caches all 12 canonical documents from disk.
   */
  public loadAllDocuments(): RuntimeKnowledgeStatus {
    this.documentsMap.clear();
    this.missingDocs = [];
    this.emptyDocs = [];
    this.loadedAt = new Date();

    const hashCombiner = crypto.createHash('sha256');

    for (const meta of CANONICAL_DOCUMENTS_METADATA) {
      const filePath = this.resolveFilePath(meta.filename);
      let status: 'loaded' | 'missing' | 'empty' = 'loaded';
      let content = '';
      let docHash = '';
      let sizeBytes = 0;
      let charCount = 0;

      if (!fs.existsSync(filePath)) {
        status = 'missing';
        this.missingDocs.push(meta.filename);
      } else {
        try {
          content = fs.readFileSync(filePath, 'utf8');
          sizeBytes = Buffer.byteLength(content, 'utf8');
          charCount = content.length;

          if (charCount < 10) {
            status = 'empty';
            this.emptyDocs.push(meta.filename);
          } else {
            docHash = this.computeHash(content);
            hashCombiner.update(`${meta.id}:${docHash}:`);
          }
        } catch (readErr: any) {
          status = 'missing';
          this.missingDocs.push(`${meta.filename} (read error: ${readErr.message})`);
        }
      }

      const docInfo: CanonicalDocumentInfo = {
        ...meta,
        sizeBytes,
        charCount,
        hash: docHash,
        status,
        loadedAt: this.loadedAt.toISOString(),
        preview: content.length > 200 ? content.slice(0, 200) + '...' : content,
      };

      this.documentsMap.set(meta.id, { info: docInfo, content });
      this.documentsMap.set(meta.filename, { info: docInfo, content });
    }

    this.constitutionHash = hashCombiner.digest('hex');
    this.constitutionPrompt = this.renderFullConstitutionPrompt();

    logger.log({
      event: 'Runtime Knowledge Loaded',
      actionType: 'RUNTIME_KNOWLEDGE',
      decision: this.missingDocs.length === 0 && this.emptyDocs.length === 0 ? 'PERFECT_MATCH' : 'COMPLIANT_WITH_WARNINGS',
      success: this.missingDocs.length === 0 && this.emptyDocs.length === 0,
      aiUsed: false,
      durationMs: 0,
      details: `Loaded ${this.getLoadedCount()}/${CANONICAL_DOCUMENTS_METADATA.length} canonical documents. Constitution Hash: ${this.constitutionHash.slice(0, 12)}...`,
    });

    return this.getStatus();
  }

  /**
   * Forces a reload of the canonical documents from disk.
   */
  public reload(): RuntimeKnowledgeStatus {
    return this.loadAllDocuments();
  }

  /**
   * Returns how many documents are successfully loaded.
   */
  public getLoadedCount(): number {
    let count = 0;
    for (const meta of CANONICAL_DOCUMENTS_METADATA) {
      const entry = this.documentsMap.get(meta.id);
      if (entry && entry.info.status === 'loaded') {
        count++;
      }
    }
    return count;
  }

  /**
   * Renders the complete, authoritative constitution prompt that is placed as the
   * static prefix for the DeepSeek brain.
   */
  private renderFullConstitutionPrompt(): string {
    const loadedCount = this.getLoadedCount();
    const total = CANONICAL_DOCUMENTS_METADATA.length;

    // Filter by category
    const behaviorDocs = CANONICAL_DOCUMENTS_METADATA.filter(
      (m) => m.category === 'BEHAVIOR_AND_IDENTITY'
    );
    const archDocs = CANONICAL_DOCUMENTS_METADATA.filter(
      (m) => m.category === 'ARCHITECTURE_AND_INFRASTRUCTURE'
    );

    const formatDocBlock = (meta: CanonicalDocumentMetadata): string => {
      const entry = this.documentsMap.get(meta.id);
      const content = entry && entry.info.status === 'loaded' ? entry.content.trim() : `[ERROR: Document ${meta.filename} is unavailable or empty]`;
      return [
        `=== FOXY CANONICAL DOCUMENT ${meta.id} ===`,
        meta.filename,
        content,
        `=== END DOCUMENT ${meta.id} ===`,
      ].join('\n');
    };

    const behaviorSection = behaviorDocs.map(formatDocBlock).join('\n\n');
    const archSection = archDocs.map(formatDocBlock).join('\n\n');

    return `================================================================================
📜 FOXTY RUNTIME KNOWLEDGE & CONSTITUTIONAL KNOWLEDGE BASE (12 CANONICAL DOCUMENTS)
Constitution Hash: ${this.constitutionHash}
Loaded Documents: ${loadedCount}/${total}
Source: Canonical Repository Master
================================================================================

================================================================================
SECTION I: BEHAVIORAL & IDENTITY CONSTITUTION (CATEGORY A — DIRECT BEHAVIOR)
The following canonical documents define Foxty's core persona, linguistic signatures,
interpersonal dynamics between Kris and Riely, situational behavioral patterns,
observation privacy boundaries, commands utility scope, and cognitive brain contract.
You MUST embody these principles actively in every evaluation and response decision.
================================================================================

${behaviorSection}

================================================================================
SECTION II: ARCHITECTURE & INFRASTRUCTURE REFERENCE (CATEGORY B — CONTEXT ONLY)
The following canonical documents define the Cherry Place server model, event engine,
and technical architecture. They are provided as structural and environmental reference.
CRITICAL CONSTRAINT: The Core application code is the final and absolute authority
on permissions, rate limits, execution, and security. You CANNOT order the Core to bypass
rules or attempt to execute infrastructure responsibilities directly.
================================================================================

${archSection}

================================================================================
SECTION III: RUNTIME INSTRUCTIONS & COGNITIVE OPERATING DIRECTIVES
================================================================================
1. VOCÊ É O CÉREBRO LINGUÍSTICO E COMPORTAMENTAL DE FOXTY:
   Você é a inteligência que interpreta o ambiente, as pessoas, as conversas e as situações do Cherry Place.
2. OS DOCUMENTOS SÃO A CONSTITUIÇÃO VIVA DO PERSONAGEM:
   Os 12 documentos canônicos fornecidos acima são a verdade documental e comportamental de Foxty.
   Você deve utilizá-los ativamente para interpretar situações, reconhecer hábitos de Kris (OnlyKrisVK)
   e Riely (Kazelyx), escolher o tom exato e manter a coerência do personagem.
3. NÃO TRATE OS DOCUMENTOS COMO TEXTO DECORATIVO:
   Não ignore o contexto documentado. Use os conhecimentos sobre Minecraft, rituais de call, piadas internas,
   e dinâmicas sociais de forma inteligente e oportuna.
4. NUNCA INVENTE REGRAS QUE CONTRADIGAM OS DOCUMENTOS:
   Qualquer decisão que desrespeite as diretrizes constitucionais será corrigida ou rejeitada pelo Core.
5. NÃO SUBSTITUA OU DESRESPEITE POLÍTICAS DO CORE:
   O código do bot valida limites de burst, canais bloqueados e permissões. Suas mensagens devem
   se adequar à política do canal em que você está.
6. PRIVACIDADE TOTAL E INVIOLABILIDADE DO SAKURAMAIL:
   Nunca invente, divulgue, alucine ou exponha conteúdos de correspondências privadas do SakuraMail,
   senhas, tokens ou dados pessoais protegidos.
7. PROPOSIÇÃO ESTRUTURADA DE AÇÕES E FERRAMENTAS:
   Quando uma ação exigir envio de mensagem, reação, gravação de memória ou chamada de evento,
   proponha no schema JSON através de 'action', 'messages', 'reactions', 'tool_calls' ou 'memory_candidates'.
8. O CORE DECIDE A EXECUÇÃO FINAL:
   O Core analisa sua resposta contra guardrails de segurança, limites de frequência e sanitização
   antes de disparar qualquer ação real no Discord.`;
  }

  /**
   * Returns the cached full constitution prompt string to be injected into DeepSeek.
   */
  public getRenderedConstitutionPrompt(): string {
    if (!this.constitutionPrompt) {
      this.constitutionPrompt = this.renderFullConstitutionPrompt();
    }
    return this.constitutionPrompt;
  }

  /**
   * Returns a diagnostic status object with complete metadata of all 12 documents.
   */
  public getStatus(): RuntimeKnowledgeStatus {
    const docsList: CanonicalDocumentInfo[] = [];
    let totalBytes = 0;
    let totalChars = 0;

    for (const meta of CANONICAL_DOCUMENTS_METADATA) {
      const entry = this.documentsMap.get(meta.id);
      if (entry) {
        docsList.push(entry.info);
        if (entry.info.status === 'loaded') {
          totalBytes += entry.info.sizeBytes;
          totalChars += entry.info.charCount;
        }
      }
    }

    const loadedCount = this.getLoadedCount();
    const isComplete = loadedCount === CANONICAL_DOCUMENTS_METADATA.length && this.missingDocs.length === 0 && this.emptyDocs.length === 0;
    const estimatedTokens = Math.round(totalChars / 3.5);

    const summaryMarkdown = this.buildMarkdownSummary({
      isComplete,
      loadedCount,
      totalExpected: CANONICAL_DOCUMENTS_METADATA.length,
      constitutionHash: this.constitutionHash,
      loadedAt: this.loadedAt.toISOString(),
      documents: docsList,
      missingDocuments: [...this.missingDocs],
      emptyDocuments: [...this.emptyDocs],
      totalSizeBytes: totalBytes,
      totalCharCount: totalChars,
      estimatedTokens,
      constitutionInjected: isComplete,
      promptPrefixSize: this.constitutionPrompt.length,
    });

    return {
      isComplete,
      loadedCount,
      totalExpected: CANONICAL_DOCUMENTS_METADATA.length,
      constitutionHash: this.constitutionHash,
      loadedAt: this.loadedAt.toISOString(),
      documents: docsList,
      missingDocuments: [...this.missingDocs],
      emptyDocuments: [...this.emptyDocs],
      totalSizeBytes: totalBytes,
      totalCharCount: totalChars,
      estimatedTokens,
      constitutionInjected: isComplete,
      promptPrefixSize: this.constitutionPrompt.length,
      summaryMarkdown,
    };
  }

  /**
   * Generates a clear markdown diagnostic summary of the injected constitution.
   */
  public generateMarkdownSummary(): string {
    const status = this.getStatus();
    return status.summaryMarkdown;
  }

  private buildMarkdownSummary(status: Omit<RuntimeKnowledgeStatus, 'summaryMarkdown'>): string {
    const lines = [
      `# 📜 Foxty Runtime Knowledge & Constitution Status`,
      ``,
      `- **Status**: ${status.isComplete ? '✅ ALL 12 CANONICAL DOCUMENTS LOADED' : '⚠️ INCOMPLETE / DEGRADED'}`,
      `- **Documents Loaded**: ${status.loadedCount}/${status.totalExpected}`,
      `- **Constitution Hash**: \`${status.constitutionHash}\``,
      `- **Last Loaded**: ${status.loadedAt}`,
      `- **Total Size**: ${(status.totalSizeBytes / 1024).toFixed(1)} KB (${status.totalCharCount.toLocaleString()} chars)`,
      `- **Estimated Prompt Tokens**: ~${status.estimatedTokens.toLocaleString()}`,
      `- **DeepSeek Injected**: ${status.constitutionInjected ? 'YES (Active System Prefix)' : 'NO'}`,
      ``,
      `### Injected Canonical Documents List`,
      `| ID | Filename | Category | Size (KB) | Hash | Status |`,
      `| :--- | :--- | :--- | :--- | :--- | :--- |`,
    ];

    for (const doc of status.documents) {
      const catBadge = doc.category === 'BEHAVIOR_AND_IDENTITY' ? 'Behavior (A)' : 'Architecture (B)';
      const sizeKb = (doc.sizeBytes / 1024).toFixed(1);
      const shortHash = doc.hash ? doc.hash.slice(0, 10) + '...' : 'none';
      const statusIcon = doc.status === 'loaded' ? '✅ Loaded' : doc.status === 'empty' ? '⚠️ Empty' : '❌ Missing';
      lines.push(`| **${doc.id}** | \`${doc.filename}\` | ${catBadge} | ${sizeKb} KB | \`${shortHash}\` | ${statusIcon} |`);
    }

    if (status.missingDocuments.length > 0) {
      lines.push(``, `**Missing Documents**: ${status.missingDocuments.join(', ')}`);
    }
    if (status.emptyDocuments.length > 0) {
      lines.push(``, `**Empty Documents**: ${status.emptyDocuments.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Returns a diagnostic text proving which canonical documents are currently injected.
   */
  public getInjectedConstitutionSummary(): string {
    const status = this.getStatus();
    const docList = status.documents
      .map(
        (d) =>
          `  - [${d.id}] ${d.filename} (${d.category === 'BEHAVIOR_AND_IDENTITY' ? 'Cat. A - Behavior' : 'Cat. B - Architecture'}): ${d.sizeBytes} bytes, hash: ${d.hash.slice(0, 12)}... [${d.status.toUpperCase()}]`
      )
      .join('\n');

    return `These are the canonical documents currently injected into DeepSeek:
Constitution Hash: ${status.constitutionHash}
Loaded: ${status.loadedCount}/${status.totalExpected} (Complete: ${status.isComplete})
Timestamp: ${status.loadedAt}
Total Size: ${status.totalSizeBytes} bytes (~${status.estimatedTokens} tokens)
Documents:
${docList}`;
  }

  /**
   * Retrieves content of a single document by ID or filename.
   */
  public getDocumentContent(idOrFilename: string): string | undefined {
    const entry = this.documentsMap.get(idOrFilename);
    return entry ? entry.content : undefined;
  }

  /**
   * Retrieves info of a single document by ID or filename.
   */
  public getDocumentInfo(idOrFilename: string): CanonicalDocumentInfo | undefined {
    const entry = this.documentsMap.get(idOrFilename);
    return entry ? entry.info : undefined;
  }

  /**
   * Returns all loaded document entries.
   */
  public getAllDocuments(): LoadedDocumentEntry[] {
    const results: LoadedDocumentEntry[] = [];
    for (const meta of CANONICAL_DOCUMENTS_METADATA) {
      const entry = this.documentsMap.get(meta.id);
      if (entry) {
        results.push(entry);
      }
    }
    return results;
  }
}

// Global Singleton Instance
export const runtimeKnowledgeLoader = new RuntimeKnowledgeLoader();
