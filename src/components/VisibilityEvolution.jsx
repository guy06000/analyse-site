import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Award, BarChart3, Calendar, Hash } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvolutionChart } from '@/components/EvolutionChart';
import { LlmComparisonBar } from '@/components/LlmComparisonBar';
import { PromptHeatmap } from '@/components/PromptHeatmap';
import { InsightsPanel } from '@/components/InsightsPanel';

const PERIODS = [
  { value: '7', label: '7 derniers jours' },
  { value: '30', label: '30 derniers jours' },
  { value: '90', label: '90 derniers jours' },
  { value: 'all', label: 'Tout' },
];

function filterByPeriod(data, periodDays, dateField = 'date') {
  if (!data?.length || periodDays === 'all') return data;

  const days = parseInt(periodDays, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return data.filter((item) => (item[dateField] || '') >= cutoffStr);
}

export function VisibilityEvolution({ scores, results, modifications, shopifyConfig, analysisResults }) {
  const [period, setPeriod] = useState('all');

  // Filtrer par periode
  const filteredScores = useMemo(
    () => filterByPeriod(scores, period, 'date'),
    [scores, period]
  );
  const filteredResults = useMemo(
    () => filterByPeriod(results, period, 'date_scan'),
    [results, period]
  );
  const filteredModifications = useMemo(
    () => filterByPeriod(modifications, period, 'date'),
    [modifications, period]
  );

  // KPI : calculs
  const kpis = useMemo(() => {
    if (!filteredScores?.length) return null;

    // Deduplication par (date, llm_name)
    const deduped = {};
    for (const s of filteredScores) {
      const key = `${s.date}|${s.llm_name}`;
      if (!deduped[key] || (s.nb_prompts || 0) > (deduped[key].nb_prompts || 0)) {
        deduped[key] = s;
      }
    }
    const allScores = Object.values(deduped);

    // Dates distinctes
    const dates = [...new Set(allScores.map((s) => s.date))].sort();
    const latestDate = dates[dates.length - 1];
    const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;

    // Scores du dernier scan
    const latestScores = allScores.filter((s) => s.date === latestDate);
    const prevScores = prevDate ? allScores.filter((s) => s.date === prevDate) : [];

    // Score global moyen
    const avgScore = latestScores.length
      ? Math.round(latestScores.reduce((sum, s) => sum + (s.score_moyen || 0), 0) / latestScores.length)
      : 0;
    const prevAvgScore = prevScores.length
      ? Math.round(prevScores.reduce((sum, s) => sum + (s.score_moyen || 0), 0) / prevScores.length)
      : null;
    const delta = prevAvgScore !== null ? avgScore - prevAvgScore : null;

    // Meilleur LLM
    const bestLlm = latestScores.reduce(
      (best, s) => (s.score_moyen > (best?.score_moyen || -1) ? s : best),
      null
    );

    // Taux mention global
    const totalMentions = latestScores.reduce((sum, s) => sum + (s.nb_mentions || 0), 0);
    const totalPrompts = latestScores.reduce((sum, s) => sum + (s.nb_prompts || 0), 0);
    const globalMentionRate = totalPrompts > 0 ? Math.round((totalMentions / totalPrompts) * 100) : 0;

    // Rang moyen
    const rankedScores = latestScores.filter(s => s.avg_brand_rank > 0);
    const avgRank = rankedScores.length > 0
      ? Math.round(rankedScores.reduce((sum, s) => sum + s.avg_brand_rank, 0) / rankedScores.length * 10) / 10
      : 0;

    return {
      avgScore,
      delta,
      bestLlm: bestLlm?.llm_name || '\u2014',
      bestLlmScore: bestLlm?.score_moyen || 0,
      mentionRate: globalMentionRate,
      nbScans: dates.length,
      avgRank,
    };
  }, [filteredScores]);

  if (!scores?.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p>Aucune donnee historique disponible.</p>
        <p className="mt-1 text-xs">Lancez des scans depuis l'onglet "Dernier scan" pour commencer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selecteur de periode */}
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Periode :</span>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {/* Score global */}
          <Card className="py-4">
            <CardContent className="px-4">
              <p className="text-xs font-medium text-muted-foreground">Score global</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${kpis.avgScore >= 50 ? 'text-green-600' : kpis.avgScore >= 20 ? 'text-orange-500' : 'text-red-500'}`}>
                  {kpis.avgScore}
                </span>
                <span className="text-sm text-muted-foreground">/100</span>
                {kpis.delta !== null ? (
                  <span className={`flex items-center text-xs font-medium ${kpis.delta > 0 ? 'text-green-600' : kpis.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {kpis.delta > 0 ? (
                      <><TrendingUp className="mr-0.5 h-3 w-3" />+{kpis.delta}</>
                    ) : kpis.delta < 0 ? (
                      <><TrendingDown className="mr-0.5 h-3 w-3" />{kpis.delta}</>
                    ) : (
                      '='
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Meilleur LLM */}
          <Card className="py-4">
            <CardContent className="px-4">
              <p className="text-xs font-medium text-muted-foreground">Meilleur LLM</p>
              <div className="mt-1">
                <p className="text-sm font-bold">{kpis.bestLlm}</p>
                <p className="text-xs text-muted-foreground">{kpis.bestLlmScore} pts</p>
              </div>
            </CardContent>
          </Card>

          {/* Taux mention */}
          <Card className="py-4">
            <CardContent className="px-4">
              <p className="text-xs font-medium text-muted-foreground">Taux mention</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold">{kpis.mentionRate}</span>
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </CardContent>
          </Card>

          {/* Rang moyen */}
          <Card className="py-4">
            <CardContent className="px-4">
              <p className="text-xs font-medium text-muted-foreground">Rang moyen</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{kpis.avgRank > 0 ? kpis.avgRank : '\u2014'}</span>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          {/* Nb scans */}
          <Card className="py-4">
            <CardContent className="px-4">
              <p className="text-xs font-medium text-muted-foreground">Nb scans</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{kpis.nbScans}</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Graphique evolution */}
      <div className="rounded-lg border p-4">
        <EvolutionChart scores={filteredScores} modifications={filteredModifications} />
      </div>

      {/* Comparaison LLMs */}
      <div className="rounded-lg border p-4">
        <LlmComparisonBar scores={filteredScores} />
      </div>

      {/* Heatmap prompts */}
      <div className="rounded-lg border p-4">
        <PromptHeatmap results={filteredResults} />
      </div>

      {/* Recommandations */}
      <div className="rounded-lg border p-4">
        <InsightsPanel scores={filteredScores} results={filteredResults} modifications={filteredModifications} shopifyConfig={shopifyConfig} analysisResults={analysisResults} />
      </div>
    </div>
  );
}
