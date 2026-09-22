import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RuntimeKnowledgeLoader,
  CANONICAL_DOCUMENTS_METADATA,
} from '../src/brain/RuntimeKnowledgeLoader.js';
import { DeepSeekAdapter } from '../src/brain/DeepSeekAdapter.js';

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

export async function runRuntimeKnowledgeTestSuite(): Promise<{ passed: number; failed: number }> {
  console.log('\n========================================================');
  console.log('📜 Test Suite: Runtime Knowledge / 12 Canonical Documents');
  console.log('========================================================\n');

  // Test 1: Instantiation and Complete Loading of 12 Documents
  console.log('Group 1: Discovery & Complete Loading of Canonical Files');
  const loader = new RuntimeKnowledgeLoader();
  const status = loader.getStatus();

  assert(status.isComplete === true, 'All 12 canonical documents loaded completely');
  assert(status.loadedCount === 12, 'Loaded count equals 12');
  assert(status.totalExpected === 12, 'Total expected equals 12');
  assert(status.missingDocuments.length === 0, 'No missing documents in repository root');
  assert(status.emptyDocuments.length === 0, 'No empty documents found in repository root');
  assert(status.totalSizeBytes > 40000, `Total bytes loaded (${status.totalSizeBytes}) > 40KB`);
  assert(status.estimatedTokens > 10000, `Estimated tokens (${status.estimatedTokens}) > 10,000`);

  // Test 2: Document Verification per metadata item
  console.log('\nGroup 2: Per-Document Integrity and SHA-256 Hashes');
  for (const meta of CANONICAL_DOCUMENTS_METADATA) {
    const docInfo = loader.getDocumentInfo(meta.id);
    const docContent = loader.getDocumentContent(meta.id);

    assert(Boolean(docInfo), `Metadata for doc ${meta.id} (${meta.filename}) found`);
    assert(docInfo?.status === 'loaded', `Doc ${meta.id} status is 'loaded'`);
    assert(typeof docInfo?.hash === 'string' && docInfo.hash.length === 64, `Doc ${meta.id} has 64-char SHA-256 hash`);
    assert(Boolean(docContent && docContent.length > 500), `Doc ${meta.id} content is non-trivial (>500 chars)`);
  }

  // Test 3: Constitution Hash Determinism and Change Detection
  console.log('\nGroup 3: Constitution Hash Calculation & Change Sensitivity');
  const initialHash = status.constitutionHash;
  assert(typeof initialHash === 'string' && initialHash.length === 64, 'Constitution hash is valid SHA-256 string');

  // Create temporary directory to test mutation and hash change
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxty-test-knowledge-'));
  try {
    // Copy all 11 documents into tempDir
    for (const meta of CANONICAL_DOCUMENTS_METADATA) {
      const srcPath = loader.resolveFilePath(meta.filename);
      const destPath = path.join(tempDir, meta.filename);
      fs.copyFileSync(srcPath, destPath);
    }

    const tempLoader = new RuntimeKnowledgeLoader(tempDir);
    const tempStatus = tempLoader.getStatus();
    assert(tempStatus.constitutionHash === initialHash, 'Cloned folder produces identical constitution hash');

    // Mutate one file and reload
    const charterPath = path.join(tempDir, '01_PROJECT_CHARTER.md');
    fs.appendFileSync(charterPath, '\n<!-- mutated test content -->');
    const mutatedStatus = tempLoader.reload();
    assert(mutatedStatus.constitutionHash !== initialHash, 'Constitution hash changes deterministically when a document is modified');
  } finally {
    // Cleanup temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Test 4: Document Delimitation and Boundary Integrity
  console.log('\nGroup 4: Clear Boundary Delimiters in Constitution Prompt');
  const renderedPrompt = loader.getRenderedConstitutionPrompt();

  for (const meta of CANONICAL_DOCUMENTS_METADATA) {
    const startDelimiter = `=== FOXY CANONICAL DOCUMENT ${meta.id} ===`;
    const endDelimiter = `=== END DOCUMENT ${meta.id} ===`;

    assert(renderedPrompt.includes(startDelimiter), `Prompt contains start delimiter: ${startDelimiter}`);
    assert(renderedPrompt.includes(meta.filename), `Prompt explicitly names file: ${meta.filename}`);
    assert(renderedPrompt.includes(endDelimiter), `Prompt contains end delimiter: ${endDelimiter}`);
  }

  // Test 5: Category Separation (Category A: Behavior vs Category B: Infrastructure)
  console.log('\nGroup 5: Priority Separation (Category A vs Category B)');
  assert(
    renderedPrompt.includes('SECTION I: BEHAVIORAL & IDENTITY CONSTITUTION (CATEGORY A — DIRECT BEHAVIOR)'),
    'Prompt includes explicit Section I for Category A'
  );
  assert(
    renderedPrompt.includes('SECTION II: ARCHITECTURE & INFRASTRUCTURE REFERENCE (CATEGORY B — CONTEXT ONLY)'),
    'Prompt includes explicit Section II for Category B'
  );
  assert(
    renderedPrompt.includes('SECTION III: RUNTIME INSTRUCTIONS & COGNITIVE OPERATING DIRECTIVES'),
    'Prompt includes explicit Section III for Runtime Instructions'
  );
  assert(
    renderedPrompt.includes('O CORE DECIDE A EXECUÇÃO FINAL'),
    'Runtime instructions mandate Core sovereign execution'
  );
  assert(
    renderedPrompt.includes('INVIOLABILIDADE DO SAKURAMAIL'),
    'Runtime instructions strictly forbid leaking SakuraMail'
  );

  // Test 6: DeepSeekAdapter System Prompt Prefix Placement
  console.log('\nGroup 6: DeepSeekAdapter System Prompt Prefix Placement');
  const adapter = new DeepSeekAdapter({
    apiKey: 'test-key',
    model: 'deepseek-chat',
    knowledgeLoader: loader,
  });

  const adapterSystemPrompt = adapter.buildSystemPrompt();
  assert(
    adapterSystemPrompt.startsWith('================================================================================\n📜 FOXTY RUNTIME KNOWLEDGE'),
    'System prompt begins with the static constitution prefix for DeepSeek prefix caching'
  );
  assert(
    adapterSystemPrompt.includes('SECTION IV: MANDATORY STRUCTURED OUTPUT FORMAT (PURE JSON)'),
    'System prompt concludes with the structured output schema instructions'
  );

  const injectedSummary = adapter.getInjectedConstitutionSummary();
  assert(injectedSummary.includes('These are the canonical documents currently injected into DeepSeek:'), 'Diagnostic summary formatted correctly');
  assert(injectedSummary.includes(status.constitutionHash), 'Diagnostic summary includes active constitution hash');

  // Test 7: Missing / Empty File Graceful Handling
  console.log('\nGroup 7: Resilience & Missing File Handling');
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxty-test-empty-'));
  try {
    const emptyLoader = new RuntimeKnowledgeLoader(emptyTempDir);
    const emptyStatus = emptyLoader.getStatus();

    assert(emptyStatus.isComplete === false, 'isComplete is false when canonical files are missing');
    assert(emptyStatus.loadedCount === 0, 'Loaded count is 0 in empty folder');
    assert(emptyStatus.missingDocuments.length === 12, 'All 12 files detected as missing');
    assert(emptyLoader.getRenderedConstitutionPrompt().includes('[ERROR: Document'), 'Prompt marks missing documents with clear error block without crashing');
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }

  console.log(`\nRuntime Knowledge Test Suite Complete: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed };
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('test_runtime_knowledge.ts') || process.argv[1]?.endsWith('test_runtime_knowledge.js')) {
  runRuntimeKnowledgeTestSuite().then((res) => {
    if (res.failed > 0) {
      process.exit(1);
    }
  });
}
