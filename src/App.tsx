import React, { useState, useEffect } from 'react';
import { CoreHeader } from './components/CoreHeader.js';
import { PersonalityPanel } from './components/PersonalityPanel.js';
import { RuntimeKnowledgePanel } from './components/RuntimeKnowledgePanel.js';
import { PipelineSimulator } from './components/PipelineSimulator.js';
import { EventEnginePanel } from './components/EventEnginePanel.js';
import { SakuraMailBridgePanel } from './components/SakuraMailBridgePanel.js';
import { ServerMapValidatorPanel } from './components/ServerMapValidatorPanel.js';
import { MemoryInspector } from './components/MemoryInspector.js';
import { AuditLogViewer } from './components/AuditLogViewer.js';
import { ChannelInfo } from './types.js';
import { Terminal, Shield, BookOpen } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<any>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [resStatus, resChannels] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/channels'),
      ]);
      if (!resStatus.ok || !resChannels.ok) {
        throw new Error('Server starting up...');
      }
      const dataStatus = await resStatus.json();
      const dataChannels = await resChannels.json();
      setStatus(dataStatus);
      setChannels(Array.isArray(dataChannels) ? dataChannels : []);
    } catch (err) {
      console.warn('App: Foxty Core backend is offline or starting up, retrying shortly...', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll status to auto-reconnect and refresh states
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-purple-500/30 selection:text-purple-200">
      <CoreHeader status={status} onRefresh={fetchStatus} loading={loading} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Discord Setup Banner if Standalone */}
        {!status?.discord?.hasToken && (
          <div className="bg-gradient-to-r from-purple-950/40 via-zinc-900/60 to-zinc-900/40 border border-purple-800/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🦊</span>
              <div>
                <p className="font-semibold text-purple-200">
                  Foxty está em modo de teste e diagnóstico autônomo (Phase 01)
                </p>
                <p className="text-zinc-400 mt-0.5">
                  Para conectar o bot a um servidor real do Discord, adicione <code className="text-purple-300 font-mono">DISCORD_TOKEN</code> e <code className="text-purple-300 font-mono">DISCORD_CLIENT_ID</code> nas variáveis de ambiente.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto font-mono text-[11px] text-zinc-400 bg-zinc-950/80 px-3 py-1.5 rounded-lg border border-zinc-800">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              <span>Sem Tokens no Código • 100% Determinístico</span>
            </div>
          </div>
        )}

        {/* Personality State Vectors */}
        <PersonalityPanel state={status?.state} />

        {/* Runtime Knowledge & Canonical Constitution (12 Documents Prefix Injection) */}
        <RuntimeKnowledgePanel onKnowledgeReloaded={fetchStatus} />

        {/* Server Map Canonical Topology Validator (New Diagnostic Module) */}
        <ServerMapValidatorPanel onRefreshTrigger={fetchStatus} />

        {/* Two-Column Grid: Pipeline Simulator + Event Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PipelineSimulator channels={channels} onInteractionComplete={fetchStatus} />
          <EventEnginePanel channels={channels} onEventTriggered={fetchStatus} />
        </div>

        {/* SakuraMail Privacy Firewall Panel */}
        <SakuraMailBridgePanel />

        {/* Two-Column Grid: Memory Inspector + Audit Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MemoryInspector />
          <AuditLogViewer />
        </div>

        {/* Footer info adhering strictly to 12_BUILD_PHASE_01.md */}
        <footer className="border-t border-zinc-800/80 pt-4 pb-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500 font-mono">
          <div>
            Foxty Phase 01: Esqueleto Técnico &bull; Cherry Place Server Model
          </div>
          <div>
            AI interpreta &bull; Core valida &bull; Tools executam &bull; Memória persiste
          </div>
        </footer>
      </main>
    </div>
  );
}
