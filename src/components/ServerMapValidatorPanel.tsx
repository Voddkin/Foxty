import React, { useState, useEffect } from 'react';
import {
  ServerMapValidationReport,
  ValidationFinding,
  ValidationSeverity,
  DiscordServerSnapshot,
} from '../types.js';
import {
  Map,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Layers,
  Hash,
  Volume2,
  AlertCircle,
  Eye,
  Sliders,
  FolderTree,
  FileText,
  Sparkles,
} from 'lucide-react';

interface ServerMapValidatorPanelProps {
  onRefreshTrigger?: () => void;
}

export const ServerMapValidatorPanel: React.FC<ServerMapValidatorPanelProps> = ({
  onRefreshTrigger,
}) => {
  const [report, setReport] = useState<ServerMapValidationReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tree' | 'findings' | 'unexpected' | 'report' | 'simulator'>('tree');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'ERROR' | 'WARNING' | 'INFO'>('ALL');
  const [copied, setCopied] = useState<boolean>(false);
  const [simScenario, setSimScenario] = useState<string>('perfect');

  const fetchDiagnosticReport = async (customSnapshot?: DiscordServerSnapshot) => {
    setLoading(true);
    try {
      let res;
      if (customSnapshot) {
        res = await fetch('/api/diagnostics/server-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: customSnapshot }),
        });
      } else {
        res = await fetch('/api/diagnostics/server-map');
      }

      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to run server map diagnostic:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnosticReport();
  }, []);

  const handleCopyMarkdown = () => {
    if (!report?.summaryMarkdown) return;
    navigator.clipboard.writeText(report.summaryMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Preset scenarios for the simulator
  const handleRunSimulatorScenario = (scenarioKey: string) => {
    setSimScenario(scenarioKey);
    if (!report) return;

    // Build base canonical snapshot
    const baseSnapshot: DiscordServerSnapshot = {
      guildId: report.guildValidation.canonicalId,
      guildName: report.guildValidation.canonicalName,
      categories: report.categories.map((c, idx) => ({
        id: c.canonicalId,
        name: c.decoratedName,
        position: c.expectedOrder,
      })),
      channels: report.channels.map((ch, idx) => ({
        id: ch.canonicalId,
        name: ch.decoratedName,
        type: ch.expectedType,
        parentId: ch.expectedCategoryId,
        position: ch.expectedOrder,
      })),
    };

    if (scenarioKey === 'perfect') {
      fetchDiagnosticReport(baseSnapshot);
      return;
    }

    if (scenarioKey === 'wrong_guild') {
      baseSnapshot.guildId = '999999999999999999';
      baseSnapshot.guildName = 'Servidor Aleatório Discord';
      fetchDiagnosticReport(baseSnapshot);
      return;
    }

    if (scenarioKey === 'missing_channel') {
      // Remove caixa-de-correio (SakuraMail)
      baseSnapshot.channels = baseSnapshot.channels.filter(
        (ch) => !ch.name.toLowerCase().includes('correio') && ch.id !== '1549773486036226088'
      );
      fetchDiagnosticReport(baseSnapshot);
      return;
    }

    if (scenarioKey === 'wrong_parent') {
      // Move minigames-do-foxty to The Little Riri category instead of Praça Principal
      const minigame = baseSnapshot.channels.find((ch) => ch.id === '1550641600609263776');
      if (minigame) {
        minigame.parentId = '1550156142989148180'; // The Little Riri
      }
      fetchDiagnosticReport(baseSnapshot);
      return;
    }

    if (scenarioKey === 'wrong_type') {
      // Change conversas-diarias from text to voice
      const conv = baseSnapshot.channels.find((ch) => ch.id === '1550638996869222524');
      if (conv) {
        conv.type = 'voice';
      }
      fetchDiagnosticReport(baseSnapshot);
      return;
    }

    if (scenarioKey === 'unexpected_items') {
      // Add extra unexpected channels and categories
      baseSnapshot.categories.push({
        id: '888888888888888888',
        name: '🤖 Bots de Música Teste',
        position: 7,
      });
      baseSnapshot.channels.push({
        id: '777777777777777777',
        name: '🎵-comandos-musica',
        type: 'text',
        parentId: '888888888888888888',
        position: 1,
      });
      fetchDiagnosticReport(baseSnapshot);
      return;
    }

    if (scenarioKey === 'position_divergence') {
      // Invert order of channels in Praça Principal
      const pracaChannels = baseSnapshot.channels.filter((c) => c.parentId === '1550638853445001236');
      pracaChannels.forEach((ch, i) => {
        ch.position = 10 - i;
      });
      fetchDiagnosticReport(baseSnapshot);
      return;
    }
  };

  const filteredFindings = report?.allFindings.filter((f) => {
    if (severityFilter === 'ALL') return true;
    return f.severity === severityFilter;
  }) || [];

  const getStatusBadge = () => {
    if (!report) return null;
    if (report.status === 'PERFECT_MATCH') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          100% Conforme ao Modelo Canônico
        </span>
      );
    }
    if (report.status === 'COMPLIANT_WITH_WARNINGS') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60 shadow-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Conforme com Ressalvas ({report.metrics.warningsCount} alertas)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60 shadow-sm">
        <XCircle className="w-3.5 h-3.5 text-rose-400" />
        Divergências Críticas ({report.metrics.criticalErrorsCount} erros)
      </span>
    );
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-xl overflow-hidden shadow-xl text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-zinc-800/80 bg-gradient-to-r from-zinc-900 via-purple-950/20 to-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-purple-900/30 border border-purple-700/40 text-purple-300">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-zinc-100 text-base flex items-center gap-2">
                ServerMapValidator &bull; Cherry Place
              </h3>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Auditoria determinística e não-destrutiva entre o modelo canônico e o servidor Discord conectado
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchDiagnosticReport()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-medium text-white transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Auditando...' : 'Revalidar Servidor'}</span>
          </button>
        </div>
      </div>

      {/* Safety Notice Bar */}
      <div className="px-5 py-2.5 bg-zinc-950/60 border-b border-zinc-800/60 flex items-center justify-between gap-3 text-[11px] text-zinc-400 font-mono">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
          <span>
            <strong>Garantia Read-Only:</strong> O validador apenas inspeciona topologia. Nenhuma alteração automática é aplicada.
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-zinc-400">
          <span>Guild: <code className="text-purple-300">{report?.guildValidation.canonicalName}</code></span>
          <span>Score: <strong className="text-purple-300">{report?.metrics.complianceScore}%</strong></span>
        </div>
      </div>

      {/* Metrics Row */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 p-4 bg-zinc-950/30 border-b border-zinc-800/60 text-xs">
          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="text-zinc-500 font-medium">Categorias</div>
            <div className="text-sm font-semibold text-zinc-200 mt-0.5">
              {report.metrics.matchedCategories} / {report.metrics.totalExpectedCategories}
            </div>
            <div className="text-[10px] text-emerald-400">
              {report.metrics.missingCategories === 0 ? 'Todas presentes' : `${report.metrics.missingCategories} ausentes`}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="text-zinc-500 font-medium">Canais</div>
            <div className="text-sm font-semibold text-zinc-200 mt-0.5">
              {report.metrics.matchedChannels} / {report.metrics.totalExpectedChannels}
            </div>
            <div className="text-[10px] text-zinc-400">
              {report.metrics.missingChannels > 0 ? (
                <span className="text-rose-400">{report.metrics.missingChannels} ausentes</span>
              ) : (
                <span className="text-emerald-400">100% mapeados</span>
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="text-zinc-500 font-medium">Inesperados</div>
            <div className="text-sm font-semibold text-zinc-200 mt-0.5">
              {report.metrics.unexpectedChannelsCount + report.metrics.unexpectedCategoriesCount}
            </div>
            <div className="text-[10px] text-amber-400">
              {report.unexpectedEntities.length === 0 ? 'Nenhum intruso' : 'Itens extras no Discord'}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="text-zinc-500 font-medium">Erros Críticos</div>
            <div className="text-sm font-semibold text-rose-400 mt-0.5">
              {report.metrics.criticalErrorsCount}
            </div>
            <div className="text-[10px] text-zinc-500">Bloqueantes de mapa</div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="text-zinc-500 font-medium">Alertas / Avisos</div>
            <div className="text-sm font-semibold text-amber-400 mt-0.5">
              {report.metrics.warningsCount}
            </div>
            <div className="text-[10px] text-zinc-500">Posição / Nomes</div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="text-zinc-500 font-medium">Conformidade</div>
            <div className="text-sm font-semibold text-purple-300 mt-0.5">
              {report.metrics.complianceScore}%
            </div>
            <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  report.metrics.complianceScore >= 95
                    ? 'bg-emerald-500'
                    : report.metrics.complianceScore >= 70
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${report.metrics.complianceScore}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="px-5 pt-3 border-b border-zinc-800 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('tree')}
            className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'tree'
                ? 'border-purple-500 text-purple-200'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Árvore Canônica vs Discord</span>
          </button>

          <button
            onClick={() => setActiveTab('findings')}
            className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'findings'
                ? 'border-purple-500 text-purple-200'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Achados & Divergências ({report?.allFindings.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('unexpected')}
            className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'unexpected'
                ? 'border-purple-500 text-purple-200'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Inesperados ({report?.unexpectedEntities.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'report'
                ? 'border-purple-500 text-purple-200'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Relatório Markdown / Slash</span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'simulator'
                ? 'border-purple-500 text-purple-200'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Simulador de Cenários</span>
          </button>
        </div>

        {activeTab === 'report' && (
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1 px-2.5 py-1 mb-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="p-5 flex-1 max-h-[520px] overflow-y-auto font-sans">
        {/* TAB 1: Tree View */}
        {activeTab === 'tree' && report && (
          <div className="space-y-4">
            {/* Guild validation line */}
            <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">🏰</span>
                <div>
                  <span className="font-semibold text-zinc-200">Guild Conectada: </span>
                  <span className="text-purple-300 font-mono">{report.guildValidation.actualName || 'Cherry Place'}</span>
                  <span className="text-zinc-500 font-mono ml-2">({report.guildValidation.actualId})</span>
                </div>
              </div>
              <div>
                {report.guildValidation.isGuildIdMatch ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ID Canônico Conforme
                  </span>
                ) : (
                  <span className="text-rose-400 font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> ID Divergente
                  </span>
                )}
              </div>
            </div>

            {/* Categories & Channels Tree */}
            <div className="space-y-3">
              {report.categories.map((category) => {
                const categoryChannels = report.channels.filter(
                  (ch) => ch.expectedCategoryId === category.canonicalId
                );

                return (
                  <div
                    key={category.canonicalId}
                    className="border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-950/40"
                  >
                    {/* Category Header */}
                    <div className="px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {category.status === 'MATCH' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : category.status === 'MISSING' ? (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span className="font-semibold text-zinc-100">{category.decoratedName}</span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          (ID: {category.canonicalId} • Ordem #{category.expectedOrder})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                        <span>
                          {category.channelsSummary.matched} / {category.channelsSummary.totalExpected} canais conformes
                        </span>
                      </div>
                    </div>

                    {/* Channels inside this category */}
                    <div className="divide-y divide-zinc-800/40">
                      {categoryChannels.map((channel) => {
                        const isVoice = channel.expectedType === 'voice';

                        return (
                          <div
                            key={channel.canonicalId}
                            className="px-4 py-2 flex items-center justify-between text-xs hover:bg-zinc-900/40 transition pl-8"
                          >
                            <div className="flex items-center gap-2.5">
                              {channel.status === 'MATCH' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : channel.status === 'MISSING' ? (
                                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}

                              <div className="flex items-center gap-1.5 text-zinc-400">
                                {isVoice ? (
                                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                                ) : (
                                  <Hash className="w-3.5 h-3.5 text-zinc-400" />
                                )}
                              </div>

                              <div>
                                <span className="font-medium text-zinc-200">{channel.decoratedName}</span>
                                <span className="text-[11px] font-mono text-zinc-500 ml-2">
                                  #{channel.technicalName} ({channel.canonicalId})
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {channel.status === 'MISSING' && (
                                <span className="px-2 py-0.5 text-[10px] rounded bg-rose-950/80 text-rose-300 border border-rose-800">
                                  Ausente no Discord
                                </span>
                              )}
                              {channel.status === 'DIVERGENT' && (
                                <span className="px-2 py-0.5 text-[10px] rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                                  {channel.findings.map((f) => f.code).join(', ')}
                                </span>
                              )}
                              {channel.status === 'MATCH' && (
                                <span className="text-[11px] text-zinc-500 font-mono">
                                  Ordem #{channel.expectedOrder}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: Findings List */}
        {activeTab === 'findings' && report && (
          <div className="space-y-3">
            {/* Filter buttons */}
            <div className="flex items-center gap-2 pb-2">
              <span className="text-xs text-zinc-400 font-medium">Filtrar por severidade:</span>
              {(['ALL', 'ERROR', 'WARNING', 'INFO'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                    severityFilter === sev
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            {filteredFindings.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-medium text-zinc-200">Nenhum achado para o filtro selecionado.</p>
                <p className="text-xs text-zinc-500">O servidor reflete com fidelidade as regras canônicas.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFindings.map((finding, idx) => {
                  const isError = finding.severity === 'ERROR';
                  const isWarning = finding.severity === 'WARNING';

                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                        isError
                          ? 'bg-rose-950/20 border-rose-900/50'
                          : isWarning
                          ? 'bg-amber-950/20 border-amber-900/50'
                          : 'bg-zinc-900/40 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                              isError
                                ? 'bg-rose-900/60 text-rose-200'
                                : isWarning
                                ? 'bg-amber-900/60 text-amber-200'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {finding.severity}
                          </span>
                          <span className="font-mono text-zinc-300 font-semibold">{finding.code}</span>
                          <span className="text-zinc-500 text-[11px]">[{finding.targetType}]</span>
                        </div>
                        {finding.targetId && (
                          <span className="font-mono text-[10px] text-zinc-500">ID: {finding.targetId}</span>
                        )}
                      </div>

                      <p className="text-zinc-300">{finding.message}</p>

                      {(finding.expected !== undefined || finding.actual !== undefined) && (
                        <div className="pt-1 text-[11px] font-mono text-zinc-400 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-950/50 p-2 rounded">
                          <div>
                            <span className="text-zinc-500">Esperado: </span>
                            <span className="text-emerald-400">{String(finding.expected)}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Atual: </span>
                            <span className="text-rose-400">{String(finding.actual ?? 'Nulo / Ausente')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Unexpected Entities */}
        {activeTab === 'unexpected' && report && (
          <div className="space-y-3">
            {report.unexpectedEntities.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-medium text-zinc-200">Nenhum canal ou categoria inesperada encontrada.</p>
                <p className="text-xs text-zinc-500">O servidor Discord não possui nenhum elemento fora do escopo canônico.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Os seguintes itens estão presentes no Discord conectado, mas não constam no modelo canônico de Cherry Place:
                </p>
                {report.unexpectedEntities.map((unexp, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-medium text-zinc-200">{unexp.name}</span>
                        <span className="text-zinc-500 font-mono ml-2">(ID: {unexp.id})</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-400 font-mono uppercase">
                      {unexp.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Markdown Summary Report */}
        {activeTab === 'report' && report && (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed selection:bg-purple-900 selection:text-purple-100">
              {report.summaryMarkdown}
            </div>
          </div>
        )}

        {/* TAB 5: Simulator Sandbox */}
        {activeTab === 'simulator' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-purple-950/20 border border-purple-800/40 text-xs text-zinc-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-purple-200">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Simulador de Auditoria & Injeção de Divergências</span>
              </div>
              <p className="text-zinc-400 text-[11px]">
                Teste o comportamento do <code className="text-purple-300">ServerMapValidator</code> injetando cenários de divergência sintéticos sem alterar o servidor real.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                {
                  id: 'perfect',
                  title: '✨ 100% Conforme',
                  desc: 'Snapshot canônico idêntico ao modelo Cherry Place',
                },
                {
                  id: 'wrong_guild',
                  title: '❌ Guild ID Divergente',
                  desc: 'Simula bot conectado a um servidor Discord errado',
                },
                {
                  id: 'missing_channel',
                  title: '❌ Canal Ausente',
                  desc: 'Simula remoção da caixa-de-correio (SakuraMail)',
                },
                {
                  id: 'wrong_parent',
                  title: '📁 Categoria Pai Incorreta',
                  desc: 'Simula minigames-do-foxty movido para categoria errada',
                },
                {
                  id: 'wrong_type',
                  title: '🔊 Tipo Incorreto (Voz vs Texto)',
                  desc: 'Simula conversas-diarias transformado em voz',
                },
                {
                  id: 'unexpected_items',
                  title: '➕ Canais Inesperados',
                  desc: 'Simula criação de canais de bots estranhos no Discord',
                },
                {
                  id: 'position_divergence',
                  title: '⚠️ Inversão de Posição',
                  desc: 'Simula canais com ordem trocada na Praça Principal',
                },
              ].map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => handleRunSimulatorScenario(sc.id)}
                  className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                    simScenario === sc.id
                      ? 'bg-purple-900/30 border-purple-500 shadow-md'
                      : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-zinc-100">{sc.title}</div>
                  <div className="text-[11px] text-zinc-400 mt-1">{sc.desc}</div>
                  <div className="mt-2 text-[10px] font-mono text-purple-400 flex items-center gap-1">
                    <span>Testar este cenário &rarr;</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-950/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono">
        <div>
          Comando Discord: <code className="text-purple-300">/foxty acao:diagnostico</code> ou <code className="text-purple-300">/foxty mapa</code>
        </div>
        <div>
          Última validação: {report ? new Date(report.timestamp).toLocaleTimeString('pt-BR') : 'Nunca'}
        </div>
      </div>
    </div>
  );
};
