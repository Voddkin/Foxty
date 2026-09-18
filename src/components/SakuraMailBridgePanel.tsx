import React, { useState, useEffect } from 'react';
import { Mail, ShieldCheck, AlertTriangle, Send, RefreshCw, Lock } from 'lucide-react';
import { SakuraMailAbstractEvent } from '../types.js';

export const SakuraMailBridgePanel: React.FC = () => {
  const [events, setEvents] = useState<SakuraMailAbstractEvent[]>([]);
  const [eventType, setEventType] = useState<'letter_opened' | 'letter_sent' | 'mailbox_checked'>('letter_opened');
  const [user, setUser] = useState<'Kris' | 'Riely'>('Kris');
  const [simulatedSecretText, setSimulatedSecretText] = useState('Confissão secreta: estou escondendo 64 blocos de diamante sob a cerejeira');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/sakuramail/events');
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed fetching SakuraMail events:', err);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleSimulateDelivery = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sakuramail/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: eventType,
          user,
          // Intentionally providing sensitive text to prove the firewall strips it!
          letter_text: simulatedSecretText,
          content: 'Confidential content payload',
        }),
      });
      const data = await res.json();
      setResult(data);
      fetchEvents();
    } catch (err: any) {
      setResult({ accepted: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Mail className="w-4 h-4 text-pink-400" />
            <span>SakuraMail Privacy Barrier &amp; Bridge (Doc 06 &amp; 08)</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Firewall estrito: Foxty observa o <em>fato</em> da correspondência, nunca o <em>conteúdo</em> das cartas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-pink-500/10 border border-pink-500/30 text-pink-300 font-mono text-[11px]">
            <Lock className="w-3 h-3 text-pink-400" />
            <span>Zero-Content Firewall Ativo</span>
          </div>
          <button
            onClick={fetchEvents}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
            title="Atualizar eventos"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Simulator Form */}
      <div className="bg-zinc-950/70 border border-zinc-800/60 rounded-lg p-3.5 mb-4 space-y-3">
        <div className="text-xs font-mono text-zinc-300 font-semibold flex items-center gap-2">
          <span>🧪 Testar Firewall de Privacidade (Injeção de Dados Confidenciais)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Tipo de Acontecimento</label>
            <select
              value={eventType}
              onChange={(e: any) => setEventType(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
            >
              <option value="letter_opened">letter_opened (Carta aberta)</option>
              <option value="letter_sent">letter_sent (Carta enviada)</option>
              <option value="mailbox_checked">mailbox_checked (Checagem de caixa)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Participante</label>
            <select
              value={user}
              onChange={(e: any) => setUser(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
            >
              <option value="Kris">Kris</option>
              <option value="Riely">Riely</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Texto Secreto Simulado</label>
            <input
              type="text"
              value={simulatedSecretText}
              onChange={(e) => setSimulatedSecretText(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 text-xs"
              placeholder="Digite um segredo..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSimulateDelivery}
            disabled={loading}
            className="px-3 py-1.5 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/40 text-pink-300 rounded text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            <span>Ingerir via SakuraMailBridge</span>
          </button>
        </div>

        {result && (
          <div className="p-3 bg-zinc-900/90 border border-zinc-700 rounded text-xs font-mono space-y-1 mt-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Resultado da Ingestão no Core:</span>
            </div>
            {result.privacyWarning && (
              <div className="flex items-center gap-1.5 text-amber-300 text-[11px] bg-amber-950/30 p-1.5 rounded border border-amber-800/40">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{result.privacyWarning}</span>
              </div>
            )}
            <div className="text-zinc-300 text-[11px]">
              <strong>Objeto Abstrato Salvo (Conteúdo removido com segurança):</strong>
              <pre className="mt-1 bg-zinc-950 p-2 rounded text-zinc-400 overflow-x-auto text-[10px]">
                {JSON.stringify(result.abstractEvent, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Recent Abstract Events List */}
      <div>
        <div className="text-xs font-mono text-zinc-400 mb-2">
          Histórico de Eventos Abstratos Conhecidos ({events.length})
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono italic">Nenhum evento abstrato registrado ainda.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {events.slice(0, 10).map((evt, idx) => (
              <div
                key={idx}
                className="bg-zinc-950/60 border border-zinc-800/60 rounded p-2 text-xs font-mono flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-pink-400">✉️ {evt.type}</span>
                  <span className="text-zinc-300">por {evt.user}</span>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
