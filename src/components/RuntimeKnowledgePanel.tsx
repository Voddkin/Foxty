import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Hash,
  FileText,
  Layers,
  Eye,
  Shield,
  Copy,
  Check,
  Cpu,
  X,
  Code,
} from 'lucide-react';
import { CanonicalDocumentInfo, RuntimeKnowledgeStatus } from '../types.js';

interface RuntimeKnowledgePanelProps {
  onKnowledgeReloaded?: () => void;
}

export const RuntimeKnowledgePanel: React.FC<RuntimeKnowledgePanelProps> = ({
  onKnowledgeReloaded,
}) => {
  const [knowledge, setKnowledge] = useState<RuntimeKnowledgeStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [reloading, setReloading] = useState<boolean>(false);
  const [selectedDoc, setSelectedDoc] = useState<CanonicalDocumentInfo | null>(null);
  const [selectedDocContent, setSelectedDocContent] = useState<string>('');
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'BEHAVIOR' | 'ARCHITECTURE'>('ALL');
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [promptPrefixText, setPromptPrefixText] = useState<string>('');
  const [loadingPrompt, setLoadingPrompt] = useState<boolean>(false);

  const fetchKnowledgeStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/diagnostics/knowledge');
      const data = await res.json();
      setKnowledge(data);
    } catch (err) {
      console.error('Failed fetching runtime knowledge diagnostics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      const res = await fetch('/api/diagnostics/knowledge/reload', { method: 'POST' });
      const data = await res.json();
      setKnowledge(data);
      if (onKnowledgeReloaded) {
        onKnowledgeReloaded();
      }
    } catch (err) {
      console.error('Failed reloading runtime knowledge:', err);
    } finally {
      setReloading(false);
    }
  };

  const handleInspectDoc = async (doc: CanonicalDocumentInfo) => {
    setSelectedDoc(doc);
    setLoadingDoc(true);
    try {
      const res = await fetch(`/api/diagnostics/knowledge/documents/${doc.id}`);
      const data = await res.json();
      setSelectedDocContent(data.content || '');
    } catch (err) {
      console.error(`Failed to fetch document ${doc.id}:`, err);
      setSelectedDocContent('Erro ao carregar conteúdo do documento.');
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleOpenPromptPrefix = async () => {
    setShowPromptModal(true);
    setLoadingPrompt(true);
    try {
      const res = await fetch('/api/diagnostics/constitution');
      const data = await res.json();
      setPromptPrefixText(data.promptPrefix || '');
    } catch (err) {
      console.error('Failed to load system prompt prefix:', err);
      setPromptPrefixText('Erro ao carregar o prompt do sistema.');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  useEffect(() => {
    fetchKnowledgeStatus();
  }, []);

  const filteredDocs = (knowledge?.documents || []).filter((doc) => {
    if (filterCategory === 'BEHAVIOR') return doc.category === 'BEHAVIOR_AND_IDENTITY';
    if (filterCategory === 'ARCHITECTURE') return doc.category === 'ARCHITECTURE_AND_INFRASTRUCTURE';
    return true;
  });

  const behaviorCount = (knowledge?.documents || []).filter(
    (d) => d.category === 'BEHAVIOR_AND_IDENTITY' && d.status === 'loaded'
  ).length;
  const archCount = (knowledge?.documents || []).filter(
    (d) => d.category === 'ARCHITECTURE_AND_INFRASTRUCTURE' && d.status === 'loaded'
  ).length;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-zinc-100 text-sm sm:text-base">
                Runtime Knowledge &amp; Prompt Constitution
              </h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                  knowledge?.isComplete
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }`}
              >
                {knowledge ? `${knowledge.loadedCount}/${knowledge.totalExpected} Documentos` : 'Carregando...'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              11 Documentos Canônicos injetados deterministicamente como prefixo no DeepSeek Brain.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleOpenPromptPrefix}
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Ver o prompt do sistema gerado com os 11 documentos"
          >
            <Code className="w-3.5 h-3.5 text-purple-400" />
            <span>Ver Prefixo Injetado</span>
          </button>

          <button
            onClick={handleReload}
            disabled={reloading || loading}
            className="px-2.5 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 rounded-lg text-xs text-purple-200 font-mono flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Recarregar arquivos Markdown do disco"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${reloading ? 'animate-spin' : ''}`} />
            <span>Recarregar Disco</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Status Constituição</span>
          </div>
          <div className="text-sm font-semibold text-zinc-100 mt-1">
            {knowledge?.isComplete ? '100% Completa (11/11)' : 'Degradada'}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            Cat. A ({behaviorCount}) • Cat. B ({archCount})
          </div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-purple-400" />
            <span>Hash da Constituição</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs font-mono text-purple-300 truncate max-w-[120px]">
              {knowledge?.constitutionHash ? knowledge.constitutionHash.slice(0, 12) + '...' : '---'}
            </span>
            {knowledge?.constitutionHash && (
              <button
                onClick={() => copyToClipboard(knowledge.constitutionHash)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5 transition-colors cursor-pointer"
                title="Copiar Hash SHA-256 Completo"
              >
                {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">SHA-256 Determinístico</div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Tamanho do Contexto</span>
          </div>
          <div className="text-sm font-semibold text-zinc-100 mt-1">
            {knowledge ? `${(knowledge.totalSizeBytes / 1024).toFixed(1)} KB` : '---'}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            ~{knowledge?.estimatedTokens.toLocaleString()} tokens estimados
          </div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>Injeção DeepSeek</span>
          </div>
          <div className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Ativa (Prefix Cache)</span>
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Delimitadores Canônicos</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-xs font-mono">
          <button
            onClick={() => setFilterCategory('ALL')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              filterCategory === 'ALL'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            Todos ({knowledge?.documents.length || 0})
          </button>
          <button
            onClick={() => setFilterCategory('BEHAVIOR')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              filterCategory === 'BEHAVIOR'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            Cat. A: Comportamento ({behaviorCount})
          </button>
          <button
            onClick={() => setFilterCategory('ARCHITECTURE')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              filterCategory === 'ARCHITECTURE'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            Cat. B: Infra/Estrutura ({archCount})
          </button>
        </div>
      </div>

      {/* Document Table / List */}
      <div className="border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-950/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">ID</th>
                <th className="py-2.5 px-3">Documento Canônico</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Tamanho</th>
                <th className="py-2.5 px-3">Hash SHA-256</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredDocs.map((doc) => {
                const isBehavior = doc.category === 'BEHAVIOR_AND_IDENTITY';
                return (
                  <tr key={doc.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-2.5 px-3 text-center font-bold text-purple-300">
                      {doc.id}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-zinc-200">{doc.filename}</div>
                      <div className="text-[11px] font-sans text-zinc-400 line-clamp-1">
                        {doc.title} — {doc.description}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${
                          isBehavior
                            ? 'bg-purple-950/40 text-purple-300 border-purple-800/40'
                            : 'bg-blue-950/40 text-blue-300 border-blue-800/40'
                        }`}
                      >
                        {isBehavior ? 'Cat. A (Comportamento)' : 'Cat. B (Estrutura)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      {(doc.sizeBytes / 1024).toFixed(1)} KB
                      <span className="text-zinc-500 text-[10px] block font-sans">
                        {doc.charCount.toLocaleString()} chars
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                      {doc.hash ? doc.hash.slice(0, 10) + '...' : '---'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {doc.status === 'loaded' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 text-[10px]">
                          <AlertTriangle className="w-3 h-3" /> {doc.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleInspectDoc(doc)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded border border-zinc-700 text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-purple-400" />
                        <span>Inspecionar</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Inspector Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-semibold text-sm text-zinc-100 font-mono">
                    === FOXY CANONICAL DOCUMENT {selectedDoc.id} === ({selectedDoc.filename})
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {selectedDoc.title} &bull; SHA-256: <code className="text-purple-300 font-mono">{selectedDoc.hash}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-zinc-950 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {loadingDoc ? (
                <div className="flex items-center justify-center py-12 text-zinc-500">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2 text-purple-400" />
                  Carregando conteúdo canônico...
                </div>
              ) : (
                <>
                  <div className="text-purple-400 font-bold mb-2">
                    === FOXY CANONICAL DOCUMENT {selectedDoc.id} ===<br />
                    {selectedDoc.filename}
                  </div>
                  {selectedDocContent}
                  <div className="text-purple-400 font-bold mt-4">
                    === END DOCUMENT {selectedDoc.id} ===
                  </div>
                </>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between text-xs font-mono text-zinc-400">
              <span>Tamanho: {selectedDoc.charCount.toLocaleString()} caracteres ({selectedDoc.sizeBytes} bytes)</span>
              <button
                onClick={() => copyToClipboard(selectedDocContent)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-purple-400" />
                <span>Copiar Conteúdo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Prompt Prefix Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-semibold text-sm text-zinc-100 font-mono">
                    DeepSeek Injected System Prompt Prefix (Deterministic Constitution)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Este é o prefixo estático exatamente como é enviado para a API do DeepSeek a cada chamada.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-zinc-950 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {loadingPrompt ? (
                <div className="flex items-center justify-center py-12 text-zinc-500">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2 text-purple-400" />
                  Carregando prompt do sistema...
                </div>
              ) : (
                promptPrefixText
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between text-xs font-mono text-zinc-400">
              <span>Tamanho do Prefixo: {promptPrefixText.length.toLocaleString()} caracteres</span>
              <button
                onClick={() => copyToClipboard(promptPrefixText)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-purple-400" />
                <span>Copiar Prompt Completo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
