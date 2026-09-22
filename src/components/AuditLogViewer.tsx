import React, { useState, useEffect } from 'react';
import { ScrollText, RefreshCw, CheckCircle2, XCircle, Info } from 'lucide-react';
import { AuditLogEntry } from '../types.js';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs?limit=40');
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
      setHasError(false);
    } catch (err) {
      setHasError(true);
      console.warn('AuditLogViewer: Waiting for Foxty Core server initialization...', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            <span>Auditoria Operacional &amp; Logs do Sistema</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Registro estruturado de decisões do Core, validações de segurança e chamadas de ferramenta.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-md border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
          title="Atualizar Logs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto font-mono text-[11px] pr-1">
        {hasError ? (
          <div className="text-center py-6 text-zinc-500 flex flex-col items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <p className="font-medium text-zinc-400">Aguardando inicialização do servidor Foxty...</p>
            <p className="text-[10px] text-zinc-600">Reconectando automaticamente em alguns segundos.</p>
          </div>
        ) : logs.length === 0 ? (
          <p className="text-zinc-600 text-center py-4">Nenhum evento registrado ainda.</p>
        ) : (
          logs.map((log) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div
                key={log.id}
                className="bg-zinc-950/80 border border-zinc-800/50 rounded px-2.5 py-1.5 flex items-start justify-between gap-3 text-zinc-300"
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {log.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="truncate">
                    <span className="text-zinc-500 mr-2">{time}</span>
                    <span className="font-semibold text-purple-400 mr-1.5">[{log.actionType}]</span>
                    <span className="text-zinc-200">{log.event}</span>
                    {log.decision && (
                      <span className="text-zinc-400 ml-1.5">→ Decisão: {log.decision}</span>
                    )}
                    {log.error && <span className="text-rose-400 ml-1.5">Erro: {log.error}</span>}
                    {log.details && <span className="text-zinc-500 ml-1.5">({log.details})</span>}
                  </div>
                </div>

                <div className="shrink-0 text-zinc-500 text-[10px]">
                  {log.durationMs}ms {log.aiUsed ? '• AI' : ''}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
