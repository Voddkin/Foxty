import React, { useState, useEffect } from 'react';
import {
  Database,
  Search,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  RefreshCw,
  ArrowRightLeft,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Server,
  Sparkles,
} from 'lucide-react';
import { MemoryItem, MigrationReport, ContextualScoredMemory } from '../types.js';

interface MemoryHealthData {
  provider: 'sqlite' | 'firestore' | 'in-memory';
  connected: boolean;
  available: boolean;
  readOk: boolean;
  writeOk: boolean;
  readWriteOk: boolean;
  recordCount: number;
  totalRecords: number;
  lastOperation: string;
  lastOperationTime?: string;
  storagePath: string;
  collection?: string;
  projectId?: string;
  databaseId?: string;
  error: string | null;
}

export const MemoryInspector: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [health, setHealth] = useState<MemoryHealthData | null>(null);
  const [query, setQuery] = useState<string>('');
  const [safeOnly, setSafeOnly] = useState<boolean>(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newContent, setNewContent] = useState<string>('');
  const [newSafe, setNewSafe] = useState<boolean>(true);
  const [newType, setNewType] = useState<string>('episodic');
  const [newTargetUser, setNewTargetUser] = useState<string>('all');

  // Migration State
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);
  const [showMigrationModal, setShowMigrationModal] = useState<boolean>(false);

  // Contextual Retrieval Simulator State
  const [showRetrievalTest, setShowRetrievalTest] = useState<boolean>(false);
  const [retrievalPrompt, setRetrievalPrompt] = useState<string>('construção da ponte de cerejeiras no nether');
  const [retrievalSpeaker, setRetrievalSpeaker] = useState<string>('Kris');
  const [retrievalResults, setRetrievalResults] = useState<ContextualScoredMemory[]>([]);
  const [retrievalLoading, setRetrievalLoading] = useState<boolean>(false);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health/memory');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Failed fetching memory health:', err);
    }
  };

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (safeOnly) params.set('safeOnly', 'true');
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (userFilter !== 'all') params.set('targetUser', userFilter);

      const res = await fetch(`/api/memories?${params.toString()}`);
      const data = await res.json();
      setMemories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed fetching memories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchMemories();
  }, [safeOnly, typeFilter, userFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMemories();
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      fetchMemories();
      fetchHealth();
    } catch (err) {
      console.error('Failed deleting memory:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          type: newType,
          importance: 0.85,
          confidence: 0.9,
          safeForTeasing: newSafe,
          targetUser: newTargetUser === 'all' ? undefined : newTargetUser,
          tags: ['manual-entry'],
        }),
      });
      setNewContent('');
      setShowAddForm(false);
      fetchMemories();
      fetchHealth();
    } catch (err) {
      console.error('Failed creating memory:', err);
    }
  };

  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationReport(null);
    try {
      const res = await fetch('/api/memory/migrate/sqlite-to-firestore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overwrite: false, filterSakuraMail: true }),
      });
      const data = await res.json();
      setMigrationReport(data);
      fetchMemories();
      fetchHealth();
    } catch (err: any) {
      console.error('Migration failed:', err);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleRunRetrieval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retrievalPrompt.trim()) return;
    setRetrievalLoading(true);
    try {
      const res = await fetch('/api/memory/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryText: retrievalPrompt,
          currentSpeaker: retrievalSpeaker,
          safeForTeasingRequired: true,
          limit: 5,
        }),
      });
      const data = await res.json();
      setRetrievalResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Contextual retrieval failed:', err);
    } finally {
      setRetrievalLoading(false);
    }
  };

  const isFirestore = health?.provider === 'firestore';

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm space-y-4">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Memória Persistente &amp; Retrieval Contextual</span>
            </h2>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${
                isFirestore
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              Provider: {health?.provider || 'carregando...'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Camada server-side com separação entre <strong>Persistência</strong> (Firestore/SQLite) e <strong>Retrieval</strong> (Scoring Contextual).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRetrievalTest(!showRetrievalTest)}
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Simular busca contextual inteligente"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Testar Retrieval</span>
          </button>

          <button
            onClick={() => setShowMigrationModal(true)}
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-600/40 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Migrar dados do SQLite local para o Firestore"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Migração</span>
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Memória</span>
          </button>
        </div>
      </div>

      {/* Provider Health Diagnostic Card */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">CONEXÃO</span>
            <span className="flex items-center gap-1 font-semibold text-zinc-200">
              {health.connected ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-rose-400" />
              )}
              {health.connected ? 'OK' : 'ERROR'}
            </span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">LEITURA / ESCRITA</span>
            <span className="text-zinc-200 font-semibold">
              R: <span className={health.readOk ? 'text-emerald-400' : 'text-rose-400'}>{health.readOk ? 'OK' : 'ERR'}</span> | W: <span className={health.writeOk ? 'text-emerald-400' : 'text-rose-400'}>{health.writeOk ? 'OK' : 'ERR'}</span>
            </span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">REGISTROS</span>
            <span className="text-emerald-400 font-semibold">{health.recordCount} memórias</span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">ÚLTIMA OPERAÇÃO</span>
            <span className="text-zinc-300 font-semibold">{health.lastOperation.toUpperCase()}</span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">COLEÇÃO / STORAGE</span>
            <span className="text-zinc-300 truncate block" title={health.storagePath}>
              {health.collection || 'sqlite_db'}
            </span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">PROJETO</span>
            <span className="text-zinc-300 truncate block" title={health.projectId || 'local'}>
              {health.projectId || 'local-sqlite'}
            </span>
          </div>
        </div>
      )}

      {/* Contextual Retrieval Simulator Dropdown */}
      {showRetrievalTest && (
        <div className="bg-purple-950/20 border border-purple-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-semibold text-purple-200 uppercase font-mono">
                Simulador de Retrieval Contextual (Multi-Fator)
              </h3>
            </div>
            <span className="text-[10px] text-purple-300 font-mono">
              Tokens + Recência + Alvo + Tags
            </span>
          </div>

          <form onSubmit={handleRunRetrieval} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={retrievalPrompt}
              onChange={(e) => setRetrievalPrompt(e.target.value)}
              placeholder="Digite um tópico ou frase falada no chat..."
              className="flex-1 bg-zinc-950 border border-purple-900/60 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-400 font-sans"
            />
            <select
              value={retrievalSpeaker}
              onChange={(e) => setRetrievalSpeaker(e.target.value)}
              className="bg-zinc-950 border border-purple-900/60 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
            >
              <option value="Kris">Autor: Kris</option>
              <option value="Riely">Autor: Riely</option>
              <option value="Other">Outro Membro</option>
            </select>
            <button
              type="submit"
              disabled={retrievalLoading}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-mono font-medium cursor-pointer"
            >
              {retrievalLoading ? 'Calculando...' : 'Buscar'}
            </button>
          </form>

          {retrievalResults.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-purple-900/40">
              <span className="text-[11px] font-mono text-purple-300">Memórias Ranqueadas:</span>
              {retrievalResults.map((item, idx) => (
                <div
                  key={item.memory.id || idx}
                  className="bg-zinc-950/80 border border-purple-900/30 rounded p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-emerald-400 font-semibold text-[11px]">
                      Score: {(item.score * 100).toFixed(1)}%
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      Match: {(item.breakdown.textMatchScore * 100).toFixed(0)}% | Recência: {(item.breakdown.recencyScore * 100).toFixed(0)}% | Alvo: +{item.breakdown.targetUserBonus.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-zinc-200 font-sans">{item.memory.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Migration Modal */}
      {showMigrationModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                <span>Migração: SQLite &rarr; Cloud Firestore</span>
              </h3>
              <button
                onClick={() => setShowMigrationModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Esta ferramenta copia todos os registros de memória do banco <strong>SQLite local</strong> para a coleção <code className="text-amber-300">foxty_memories</code> no <strong>Cloud Firestore</strong>, preservando IDs, timestamps, tags e regras de privacidade do Documento 06 (isolando correspondências SakuraMail). O arquivo SQLite original não será apagado.
            </p>

            {migrationReport ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Migração Concluída com Sucesso</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-zinc-300 pt-1">
                  <div>Lidos no SQLite: <strong className="text-zinc-100">{migrationReport.totalRead}</strong></div>
                  <div>Migrados no Firestore: <strong className="text-emerald-400">{migrationReport.migratedCount}</strong></div>
                  <div>Duplicados ignorados: <strong className="text-zinc-400">{migrationReport.duplicateCount}</strong></div>
                  <div>Filtrados (Privacidade): <strong className="text-purple-400">{migrationReport.privacyFilteredCount}</strong></div>
                  <div>Duração: <strong className="text-zinc-200">{migrationReport.durationMs}ms</strong></div>
                  <div>Erros: <strong className={migrationReport.errors.length ? 'text-rose-400' : 'text-emerald-400'}>{migrationReport.errors.length}</strong></div>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowMigrationModal(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={handleRunMigration}
                disabled={isMigrating}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-mono font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isMigrating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Migrando...</span>
                  </>
                ) : (
                  <span>Iniciar Migração</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Memory Modal / Inline Form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2.5">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">Conteúdo do Registro</label>
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Ex: Kris construiu um portal para o Nether perto da base..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 font-sans"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
              >
                <option value="episodic">Episódica</option>
                <option value="behavioral">Comportamental</option>
                <option value="server">Servidor / Lore</option>
                <option value="project">Projeto</option>
              </select>

              <select
                value={newTargetUser}
                onChange={(e) => setNewTargetUser(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
              >
                <option value="all">Sem usuário fixo</option>
                <option value="Kris">Alvo: Kris</option>
                <option value="Riely">Alvo: Riely</option>
              </select>

              <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSafe}
                  onChange={(e) => setNewSafe(e.target.checked)}
                  className="rounded border-zinc-700 text-purple-600 focus:ring-0"
                />
                <span>safe_for_teasing (Permite zoar)</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium cursor-pointer"
              >
                Salvar Memória
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por termo, tag ou usuário..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 font-mono"
          />
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 font-mono"
          >
            <option value="all">Todos os Tipos</option>
            <option value="episodic">Episódica</option>
            <option value="behavioral">Comportamental</option>
            <option value="server">Servidor</option>
            <option value="project">Projeto</option>
          </select>

          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 font-mono"
          >
            <option value="all">Todos os Alvos</option>
            <option value="Kris">Kris</option>
            <option value="Riely">Riely</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono cursor-pointer shrink-0 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <input
              type="checkbox"
              checked={safeOnly}
              onChange={(e) => setSafeOnly(e.target.checked)}
              className="rounded border-zinc-700 text-purple-600 focus:ring-0"
            />
            <span className="hidden md:inline">Seguras p/ Humor</span>
          </label>
        </div>
      </div>

      {/* Memories List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-xs text-zinc-500 font-mono py-4 text-center">Consultando {health?.provider}...</p>
        ) : memories.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono py-4 text-center">Nenhuma memória encontrada com esses critérios.</p>
        ) : (
          memories.map((mem) => (
            <div
              key={mem.id}
              className="bg-zinc-950/70 border border-zinc-800/60 rounded-lg p-3 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase">
                    {mem.type}
                  </span>
                  {mem.targetUser && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                      Alvo: {mem.targetUser}
                    </span>
                  )}
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                      mem.safeForTeasing
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {mem.safeForTeasing ? (
                      <>
                        <ShieldCheck className="w-3 h-3" /> safe_for_teasing
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3 h-3" /> restrito (não zoar)
                      </>
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    relevância: {Math.round(mem.importance * 100)}%
                  </span>
                  {mem.tags && mem.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {mem.tags.map((t, idx) => (
                        <span key={idx} className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-1 py-0.2 rounded border border-zinc-800">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-zinc-200 font-sans leading-relaxed">{mem.content}</p>
              </div>

              <button
                onClick={() => handleDelete(mem.id)}
                className="text-zinc-600 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer shrink-0"
                title="Excluir memória"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
