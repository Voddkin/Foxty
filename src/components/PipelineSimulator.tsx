import React, { useState } from 'react';
import { Send, Terminal, ShieldCheck, ShieldAlert, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { ChannelInfo } from '../types.js';

interface PipelineSimulatorProps {
  channels: ChannelInfo[];
  onInteractionComplete: () => void;
}

export const PipelineSimulator: React.FC<PipelineSimulatorProps> = ({ channels, onInteractionComplete }) => {
  const [mode, setMode] = useState<'chat' | 'command'>('chat');
  const [selectedChannel, setSelectedChannel] = useState<string>(channels[0]?.id || 'ch-daily-talk');
  const [speaker, setSpeaker] = useState<string>('Riely');
  const [content, setContent] = useState<string>('a base de minecraft ficou tão linda com as cerejeiras KKKKKKK');
  const [isDirectMention, setIsDirectMention] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const activeChannel = channels.find((c) => c.id === selectedChannel);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      if (mode === 'chat') {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: selectedChannel,
            author: speaker,
            content,
            isDirectMention,
          }),
        });
        const data = await res.json();
        setLastResult({ type: 'chat', data });
      } else {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subcommand: content === 'status' ? 'status' : undefined,
            prompt: content === 'status' ? undefined : content,
            author: speaker,
            channelId: selectedChannel,
          }),
        });
        const data = await res.json();
        setLastResult({ type: 'command', data });
      }

      onInteractionComplete();
    } catch (err: any) {
      setLastResult({ type: 'error', error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span>Simulador de Pipeline &amp; Slash Command /foxty</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Testa o fluxo completo: Context Builder → Análise Comportamental → DeepSeek → Validador de Ferramentas.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-1 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setMode('chat')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === 'chat' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Chat Natural
          </button>
          <button
            type="button"
            onClick={() => setMode('command')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === 'command' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            /foxty [Comando]
          </button>
        </div>
      </div>

      {/* Channel Warning if protected */}
      {activeChannel?.isProtected && (
        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            <strong>Canal com Proteção Ativa:</strong> {activeChannel.name}. Políticas de fronteira de privacidade serão rigorosamente aplicadas pelo Core.
          </span>
        </div>
      )}

      {/* Form Controls */}
      <form onSubmit={handleRun} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Speaker Select */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Interlocutor</label>
            <select
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            >
              <option value="Riely">Riely (Assinatura: risos, caminhos, cerejeiras)</option>
              <option value="Kris">Kris (Assinatura: escadas, infraestrutura, exploração)</option>
              <option value="Visitante">Visitante / Convidado</option>
            </select>
          </div>

          {/* Channel Select */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Canal de Cherry Place</label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isProtected ? '🔒 [Protegido]' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Input Text */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-zinc-400">
              {mode === 'chat' ? 'Mensagem no Discord' : 'Parâmetro do /foxty'}
            </label>
            {mode === 'chat' && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDirectMention}
                  onChange={(e) => setIsDirectMention(e.target.checked)}
                  className="rounded border-zinc-700 text-purple-600 focus:ring-0"
                />
                <span>Mencionar Foxty (@Foxty)</span>
              </label>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={mode === 'chat' ? 'Escreva algo como se estivesse no Discord...' : 'status ou pergunta livre...'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-24 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 font-mono"
            />
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>{loading ? 'Processando' : 'Executar'}</span>
            </button>
          </div>

          {/* Quick preset tests */}
          <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] font-mono text-zinc-400">
            <span className="text-zinc-500">Cenários:</span>
            <button
              type="button"
              onClick={() => {
                setSpeaker('Riely');
                setContent('naum tá pronto ainda -&) :3 ksksks');
                setIsDirectMention(true);
              }}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-purple-300"
            >
              Riely (Marcadores)
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeaker('Kris');
                setContent('NÃO É POSSÍVEL que vocês ainda estão mexendo nisso... cadê a escada?');
                setIsDirectMention(true);
              }}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-cyan-300"
            >
              Kris (Exagero Teatral)
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeaker('Riely');
                setContent('então, eu estive pensando muito detalhadamente sobre como nós deveríamos estruturar a ala leste da base de cerejeiras, incluindo todos os baús de minérios e as mudas de árvores que nós trouxemos do bioma vizinho');
                setIsDirectMention(true);
              }}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-amber-300"
            >
              Riely (Desvio de Padrão)
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeaker('Kris');
                setContent('boa noite, dorme bem');
                setIsDirectMention(true);
              }}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-emerald-300"
            >
              Ciclo (Despedida)
            </button>
          </div>
        </div>
      </form>

      {/* Pipeline Execution Details Output */}
      {lastResult && (
        <div className="mt-5 border-t border-zinc-800/80 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Resultado da Inspeção do Pipeline
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {lastResult.data?.aiUsed ? 'DeepSeek LLM Utilizado' : 'Brain Heurístico Determinístico'}
            </span>
          </div>

          {/* Foxty Response Bubble */}
          <div className="bg-purple-950/20 border border-purple-800/40 rounded-lg p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🦊</span>
              <span className="text-xs font-semibold text-purple-300">Foxty</span>
              {lastResult.data?.decision?.tone && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                  tom: {lastResult.data.decision.tone}
                </span>
              )}
              {lastResult.data?.decision?.mode && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                  modo: {lastResult.data.decision.mode}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="space-y-1.5 font-sans text-sm text-zinc-200">
              {lastResult.data?.decision?.messages?.length > 0 ? (
                lastResult.data.decision.messages.map((m: string, idx: number) => (
                  <p key={idx} className="leading-relaxed bg-zinc-900/60 border border-zinc-800/50 rounded px-3 py-1.5">
                    {m}
                  </p>
                ))
              ) : lastResult.data?.reply ? (
                <p className="whitespace-pre-line leading-relaxed">{lastResult.data.reply}</p>
              ) : (
                <p className="text-zinc-500 italic text-xs">
                  *Foxty decidiu permanecer em silêncio (economia de palavras ou canal restrito)*
                </p>
              )}
            </div>

            {/* Reactions if any */}
            {lastResult.data?.decision?.reactions?.length > 0 && (
              <div className="mt-2 flex items-center gap-1">
                <span className="text-[10px] text-zinc-500">Reações Propostas:</span>
                {lastResult.data.decision.reactions.map((r: string, i: number) => (
                  <span key={i} className="text-sm px-1.5 py-0.5 bg-zinc-800/80 rounded border border-zinc-700">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Diagnostic breakdown tabs: Behavioral observations + Tool Validations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Behavioral signals */}
            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3 font-mono">
              <span className="text-zinc-400 block font-semibold mb-1">🔍 Sinais Comportamentais Detectados:</span>
              {lastResult.data?.observations?.[0]?.signals?.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {lastResult.data.observations[0].signals.map((sig: string, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                      {sig}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-zinc-600">Nenhum sinal específico detectado</span>
              )}
              {lastResult.data?.observations?.[0]?.detectedHabit && (
                <p className="text-purple-300 text-[11px] mt-1.5">
                  Padrão: {lastResult.data.observations[0].detectedHabit}
                </p>
              )}
              {lastResult.data?.observations?.[0]?.patternDeviation && (
                <div className="mt-2 p-1.5 rounded bg-amber-950/40 border border-amber-800/50 text-[10px] text-amber-200">
                  <span className="font-bold block text-amber-400">⚠️ Desvio de Padrão Detectado:</span>
                  <span>{lastResult.data.observations[0].patternDeviation.subject}: de "{lastResult.data.observations[0].patternDeviation.baseline}" para "{lastResult.data.observations[0].patternDeviation.observed}"</span>
                </div>
              )}
              {lastResult.data?.observations?.[0]?.conversationCycle && (
                <div className="mt-2 p-1.5 rounded bg-blue-950/40 border border-blue-800/50 text-[10px] text-blue-200">
                  <span className="font-bold block text-blue-400">🔄 Ciclo Conversacional:</span>
                  <span>Tipo: {lastResult.data.observations[0].conversationCycle.cycleType} (Iniciador: {lastResult.data.observations[0].conversationCycle.initiator})</span>
                </div>
              )}
            </div>

            {/* Tool Validation status */}
            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3 font-mono">
              <span className="text-zinc-400 block font-semibold mb-1">🛡️ Validação de Ferramentas (Security):</span>
              {lastResult.data?.toolResults?.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {lastResult.data.toolResults.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      {t.success ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className={t.success ? 'text-emerald-300' : 'text-rose-300'}>
                        {t.tool}: {t.success ? 'Aprovado & Executado' : t.error}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-zinc-600">Nenhuma ação direta de ferramenta disparada</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
