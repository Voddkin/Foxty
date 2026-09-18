import React, { useState, useEffect } from 'react';
import { Zap, Clock, ShieldCheck, Play, CheckCircle, Sparkles } from 'lucide-react';
import { ChannelInfo, FoxtyEvent } from '../types.js';

interface EventEnginePanelProps {
  channels: ChannelInfo[];
  onEventTriggered: () => void;
}

export const EventEnginePanel: React.FC<EventEnginePanelProps> = ({ channels, onEventTriggered }) => {
  const [selectedChannel, setSelectedChannel] = useState<string>('ch-daily-talk');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [events, setEvents] = useState<FoxtyEvent[]>([]);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed fetching events:', err);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleTrigger = async (eventId?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/trigger-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          channelId: selectedChannel,
        }),
      });
      const data = await res.json();
      setResult(data);
      onEventTriggered();
    } catch (err: any) {
      setResult({ triggered: false, reason: err.message });
    } finally {
      setLoading(false);
    }
  };

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'uncommon':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'rare':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'very_rare':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'legendary':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'anomalous':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Motor de Eventos Espontâneos &amp; Raridade</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Orquestrador determinístico de acontecimentos esporádicos com respeito a cooldowns e canais protegidos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 font-mono"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleTrigger()}
            disabled={loading}
            className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>trigger_test_event()</span>
          </button>
        </div>
      </div>

      {/* Trigger result feedback */}
      {result && (
        <div
          className={`mb-4 p-3 rounded-lg border text-xs font-mono ${
            result.triggered
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
              : 'bg-rose-950/30 border-rose-800/50 text-rose-200'
          }`}
        >
          {result.triggered ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Evento Disparado com Sucesso: {result.event?.name}</span>
              </div>
              <p className="text-zinc-300 font-sans mt-1">
                <strong>Mensagens:</strong> {result.messages?.join(' • ')}
              </p>
            </div>
          ) : (
            <div>
              <strong>Falha / Bloqueio:</strong> {result.reason}
            </div>
          )}
        </div>
      )}

      {/* Catalog of Events */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(events.length > 0 ? events : []).map((evt) => (
          <div key={evt.id} className="bg-zinc-950/70 border border-zinc-800/60 rounded-lg p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-medium text-zinc-200 truncate" title={evt.name}>{evt.name}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold border ${getRarityBadge(
                    evt.rarity
                  )}`}
                >
                  {evt.rarity.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans leading-snug">{evt.description}</p>
            </div>

            <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {evt.cooldownMinutes}m &bull; {(evt.chance * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => handleTrigger(evt.id)}
                className="text-purple-400 hover:text-purple-300 cursor-pointer underline"
              >
                Disparar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
