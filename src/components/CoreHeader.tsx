import React from 'react';
import { Shield, Radio, Cpu, Activity } from 'lucide-react';

interface CoreHeaderProps {
  status: any;
  onRefresh: () => void;
  loading: boolean;
}

export const CoreHeader: React.FC<CoreHeaderProps> = ({ status, onRefresh, loading }) => {
  const isDiscordConnected = status?.discord?.connected;
  const hasDiscordToken = status?.discord?.hasToken;
  const deepSeekActive = status?.deepSeekConfigured;

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-2xl shadow-inner">
            🦊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-semibold text-zinc-100 tracking-tight">FOxty Core Engine</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                v0.1.0 Phase 1
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans">
              Cherry Place Resident Character • Discord Autonomous Bot &amp; DeepSeek Brain
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* Discord Status */}
          <div
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
              isDiscordConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : hasDiscordToken
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>
              {isDiscordConnected
                ? `Discord: ${status?.discord?.botUser || 'Online'}`
                : hasDiscordToken
                ? 'Discord: Connecting...'
                : 'Discord: Standalone / Test'}
            </span>
          </div>

          {/* DeepSeek Brain Status */}
          <div
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
              deepSeekActive
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{deepSeekActive ? `DeepSeek: ${status?.deepSeekModel}` : 'Brain: Heuristic Mock'}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Activity className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>
    </header>
  );
};
