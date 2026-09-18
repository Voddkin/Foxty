import React from 'react';
import { Sparkles, Flame, Eye, Shuffle, Drama, MessageSquare, ShieldAlert } from 'lucide-react';
import { FoxtyState } from '../types.js';

interface PersonalityPanelProps {
  state?: FoxtyState;
}

export const PersonalityPanel: React.FC<PersonalityPanelProps> = ({ state }) => {
  if (!state) return null;

  const vectors: Array<{
    key: keyof FoxtyState;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    color: string;
    value: number;
  }> = [
    {
      key: 'curiosity',
      label: 'Curiosidade',
      sublabel: 'Atenção aos detalhes e observação',
      icon: <Eye className="w-4 h-4 text-cyan-400" />,
      color: 'bg-cyan-500',
      value: state.curiosity,
    },
    {
      key: 'energy',
      label: 'Energia',
      sublabel: 'Disposição para interagir e se mover',
      icon: <Flame className="w-4 h-4 text-amber-400" />,
      color: 'bg-amber-500',
      value: state.energy,
    },
    {
      key: 'mood',
      label: 'Humor',
      sublabel: 'Estado afetivo da raposa',
      icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
      color: 'bg-emerald-500',
      value: state.mood,
    },
    {
      key: 'chaos',
      label: 'Caos',
      sublabel: 'Imprevisibilidade e peraltices',
      icon: <Shuffle className="w-4 h-4 text-rose-400" />,
      color: 'bg-rose-500',
      value: state.chaos,
    },
    {
      key: 'drama',
      label: 'Teatralidade',
      sublabel: 'Exagero dramático nas respostas',
      icon: <Drama className="w-4 h-4 text-purple-400" />,
      color: 'bg-purple-500',
      value: state.drama,
    },
    {
      key: 'talkativeness',
      label: 'Verborragia',
      sublabel: 'Econômico vs comunicativo',
      icon: <MessageSquare className="w-4 h-4 text-blue-400" />,
      color: 'bg-blue-500',
      value: state.talkativeness,
    },
    {
      key: 'suspicion',
      label: 'Suspeita',
      sublabel: 'Cautela e desconfiança sutil',
      icon: <ShieldAlert className="w-4 h-4 text-orange-400" />,
      color: 'bg-orange-500',
      value: state.suspicion,
    },
  ];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span>🎭 Estado Emocional &amp; Vetores de Personalidade</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Vetores dinâmicos que modulam o tom, a economia de palavras e a espontaneidade.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {vectors.map((v) => {
          const percentage = Math.round(v.value * 100);
          return (
            <div key={v.key} className="bg-zinc-950/70 border border-zinc-800/60 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {v.icon}
                  <span className="text-xs font-medium text-zinc-200">{v.label}</span>
                </div>
                <span className="text-xs font-mono font-semibold text-zinc-300">{percentage}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${v.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5 truncate">{v.sublabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
