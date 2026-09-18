import React, { useState, useEffect } from 'react';
import { Database, Search, ShieldCheck, ShieldAlert, Plus, Trash2 } from 'lucide-react';
import { MemoryItem } from '../types.js';

export const MemoryInspector: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState<string>('');
  const [safeOnly, setSafeOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newContent, setNewContent] = useState<string>('');
  const [newSafe, setNewSafe] = useState<boolean>(true);
  const [newType, setNewType] = useState<string>('episodic');

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (safeOnly) params.set('safeOnly', 'true');

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
    fetchMemories();
  }, [safeOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMemories();
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      fetchMemories();
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
          tags: ['manual-entry'],
        }),
      });
      setNewContent('');
      setShowAddForm(false);
      fetchMemories();
    } catch (err) {
      console.error('Failed creating memory:', err);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Fronteira de Memória &amp; Privacidade (Observation Boundary)</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Preserva continuidade e fatos seguros. A regra <code className="text-emerald-300">safeForTeasing</code> impede uso de assuntos sensíveis em provocações.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-mono flex items-center gap-1.5 self-start cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Memória</span>
        </button>
      </div>

      {/* Add Memory Modal / Inline Form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2.5">
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

              <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSafe}
                  onChange={(e) => setNewSafe(e.target.checked)}
                  className="rounded border-zinc-700 text-purple-600 focus:ring-0"
                />
                <span>safe_for_teasing (Pode usar em humor)</span>
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
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-3">
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

        <label className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono cursor-pointer shrink-0 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <input
            type="checkbox"
            checked={safeOnly}
            onChange={(e) => setSafeOnly(e.target.checked)}
            className="rounded border-zinc-700 text-purple-600 focus:ring-0"
          />
          <span>Apenas Seguras para Humor</span>
        </label>
      </div>

      {/* Memories List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-xs text-zinc-500 font-mono py-4 text-center">Consultando armazenamento de memória...</p>
        ) : memories.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono py-4 text-center">Nenhuma memória encontrada com esses critérios.</p>
        ) : (
          memories.map((mem) => (
            <div
              key={mem.id}
              className="bg-zinc-950/70 border border-zinc-800/60 rounded-lg p-3 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
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
