import { useState, useEffect } from 'react';
import {
  Eye,
  Loader2,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVisibility } from '@/hooks/useVisibility';
import { VisibilityEvolution } from '@/components/VisibilityEvolution';
import { CompetitorRanking } from '@/components/CompetitorRanking';
import { CategoryScores } from '@/components/CategoryScores';
import { PromptPerformance } from '@/components/PromptPerformance';
import { SentimentOverview } from '@/components/SentimentOverview';

const LLM_COLORS = {
  'Perplexity Sonar': 'bg-blue-100 text-blue-800 border-blue-200',
  'Perplexity': 'bg-blue-100 text-blue-800 border-blue-200',
  'OpenAI GPT-4o': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'OpenAI': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Claude Sonnet': 'bg-orange-100 text-orange-800 border-orange-200',
  'Anthropic': 'bg-orange-100 text-orange-800 border-orange-200',
  'Gemini Pro': 'bg-purple-100 text-purple-800 border-purple-200',
  'Gemini': 'bg-purple-100 text-purple-800 border-purple-200',
  'Grok': 'bg-red-100 text-red-800 border-red-200',
};

function ScoreGauge({ score }) {
  const color =
    score >= 50
      ? 'text-green-600'
      : score >= 20
        ? 'text-orange-500'
        : 'text-red-500';
  return (
    <div className={`text-3xl font-bold ${color}`}>
      {score}
      <span className="text-sm font-normal text-muted-foreground">/100</span>
    </div>
  );
}

function LlmScoreCard({ data }) {
  const borderColor = (LLM_COLORS[data.llm_name] || '').split(' ').pop() || 'border-gray-200';
  const badgeClass = LLM_COLORS[data.llm_name] || 'bg-gray-100 text-gray-800';
  const scoreColor =
    data.score_moyen >= 50
      ? 'text-green-600'
      : data.score_moyen >= 20
        ? 'text-orange-500'
        : 'text-red-500';

  const trendIcon = data.tendance === 'hausse' ? '\u2191' : data.tendance === 'baisse' ? '\u2193' : '=';
  const trendColor = data.tendance === 'hausse' ? 'text-green-500' : data.tendance === 'baisse' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <div className={`rounded-lg border p-4 ${borderColor}`}>
      <div className="flex items-center justify-between">
        <Badge className={badgeClass}>{data.llm_name}</Badge>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${scoreColor}`}>{data.score_moyen}</span>
          <span className={`text-sm font-medium ${trendColor}`}>{trendIcon}</span>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Mentions</span>
          <span className="font-medium">{data.nb_mentions}/{data.nb_prompts}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Taux</span>
          <span className="font-medium">{data.taux_mention}%</span>
        </div>
        {data.avg_brand_rank > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rang moy.</span>
            <span className="font-medium">{data.avg_brand_rank}</span>
          </div>
        )}
        {data.top_competitor && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Top rival</span>
            <span className="font-medium text-xs capitalize">{data.top_competitor}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ result }) {
  const [open, setOpen] = useState(false);
  const mentionColor =
    result.mention_detected === 'oui'
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-500';
  const llmBadge = LLM_COLORS[result.llm_name] || 'bg-gray-100 text-gray-800';

  return (
    <div className="rounded border p-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left text-sm"
      >
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
        <Badge className={`${llmBadge} text-xs`}>{result.llm_name}</Badge>
        <span className="flex-1 truncate font-medium">
          {result.prompt_question}
        </span>
        <Badge className={mentionColor}>
          {result.mention_detected === 'oui' ? (
            <><CheckCircle className="mr-1 h-3 w-3" />Oui</>
          ) : (
            <><XCircle className="mr-1 h-3 w-3" />Non</>
          )}
        </Badge>
        {result.visibility_score > 0 && (
          <span className="text-xs font-medium text-green-600">
            {result.visibility_score}pts
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded bg-muted/30 p-3 text-sm">
          {result.mention_type !== 'none' && result.mention_type !== 'erreur' && (
            <div>
              <span className="font-medium">Type :</span> {result.mention_type}
              {result.mention_exact_text && (
                <> — &laquo; {result.mention_exact_text} &raquo;</>
              )}
            </div>
          )}
          {result.mention_context && (
            <div>
              <span className="font-medium">Contexte :</span>
              <p className="mt-1 italic text-muted-foreground">
                ...{result.mention_context}...
              </p>
            </div>
          )}
          {result.citations_urls && (
            <div>
              <span className="font-medium">Citations :</span>
              <p className="text-blue-600 break-all">{result.citations_urls}</p>
            </div>
          )}
          {result.mention_type === 'erreur' && (
            <p className="text-red-500">{result.response_text}</p>
          )}
          {result.response_text && result.mention_type !== 'erreur' && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Voir la reponse complete
              </summary>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line text-xs text-muted-foreground">
                {result.response_text}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function VisibilityPanel({ config, onConfigChange, shopifyConfig, analysisResults }) {
  const {
    scores,
    results,
    loading,
    scanning,
    error,
    scanResult,
    pollStatus,
    modifications,
    loadData,
    triggerScan,
    stopPolling,
  } = useVisibility();
  const [showConfig, setShowConfig] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [promptFilter, setPromptFilter] = useState('all'); // all | generique | marque

  const hasConfig = !!(config?.airtableToken && config?.n8nWebhookUrl);

  // Auto-load data when config is available
  useEffect(() => {
    if (config?.airtableToken) {
      loadData(config.airtableToken);
    }
  }, [config?.airtableToken, loadData]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Get latest scores (most recent date)
  const latestDate = scores?.length > 0 ? scores[0].date : null;
  const latestScores = scores?.filter((s) => s.date === latestDate) || [];
  const avgScore =
    latestScores.length > 0
      ? Math.round(
          latestScores.reduce((sum, s) => sum + (s.score_moyen || 0), 0) /
            latestScores.length
        )
      : 0;

  // Get latest results
  const latestResultDate = results?.length > 0 ? results[0].date_scan : null;
  const latestResults =
    results?.filter((r) => r.date_scan === latestResultDate) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Visibilité LLM</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Config */}
      {showConfig && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Token Airtable (PAT)</label>
            <Input
              type="password"
              placeholder="patXXX..."
              value={config?.airtableToken || ''}
              onChange={(e) =>
                onConfigChange({ ...config, airtableToken: e.target.value })
              }
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">URL Webhook n8n</label>
            <Input
              type="url"
              placeholder="https://n8n.xxx.cloud/webhook/visibility-scan"
              value={config?.n8nWebhookUrl || ''}
              onChange={(e) =>
                onConfigChange({ ...config, n8nWebhookUrl: e.target.value })
              }
              className="mt-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Les cles API LLM sont configurees dans les credentials n8n.
            La table Config Airtable contient : brand_names, domains, niche.
          </p>
        </div>
      )}

      {!hasConfig && !showConfig && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground">
            Configurez votre token Airtable et webhook n8n pour commencer.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setShowConfig(true)}
          >
            <Settings className="mr-1 h-4 w-4" /> Configurer
          </Button>
        </div>
      )}

      {hasConfig && (
        <>
          {/* Scan buttons + global score */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => triggerScan(config.n8nWebhookUrl, config.airtableToken, 5)}
              disabled={scanning}
              className="gap-2"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Scan en cours...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Scan rapide (5)
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => triggerScan(config.n8nWebhookUrl, config.airtableToken)}
              disabled={scanning}
              className="gap-2"
            >
              <Play className="h-4 w-4" /> Scan complet
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => loadData(config.airtableToken)}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>

            {latestScores.length > 0 && (
              <div className="ml-auto text-right">
                <ScoreGauge score={avgScore} />
                <p className="text-xs text-muted-foreground">
                  Dernier scan : {latestDate}
                </p>
              </div>
            )}
          </div>

          {/* Scan status */}
          {pollStatus === 'waiting' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scan en cours... Les resultats seront detectes automatiquement (polling toutes les 10s).
            </div>
          )}

          {/* Scan result message */}
          {scanResult && !scanResult.launched && (
            <div
              className={`rounded-lg border p-3 text-sm ${scanResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}
            >
              {scanResult.success
                ? `Scan termine : ${scanResult.nb_mentions} mentions sur ${scanResult.nb_results} requetes (score global : ${scanResult.score_global}/100)`
                : scanResult.message || `Erreur : ${scanResult.error}`}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">
                Chargement des donnees...
              </span>
            </div>
          )}

          {/* Sub-tabs : Dernier scan / Concurrence / Evolution */}
          <Tabs defaultValue="latest" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="latest">Dernier scan</TabsTrigger>
              <TabsTrigger value="competitive">Concurrence</TabsTrigger>
              <TabsTrigger value="evolution">Evolution</TabsTrigger>
            </TabsList>

            <TabsContent value="latest" className="mt-4 space-y-4">
              {/* LLM Score Cards */}
              {latestScores.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {latestScores.map((s, i) => (
                    <LlmScoreCard key={i} data={s} />
                  ))}
                </div>
              )}

              {/* Results list */}
              {latestResults.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowResults(!showResults)}
                    className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showResults ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {showResults ? 'Masquer' : 'Voir'} les {latestResults.length}{' '}
                    resultats detailles
                  </button>
                  {showResults && (
                    <div className="mt-2 max-h-[600px] overflow-y-auto space-y-1.5">
                      {latestResults.map((r, i) => (
                        <ResultRow key={i} result={r} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!loading && !scores && (
                <div className="py-8 text-center text-muted-foreground">
                  <p>
                    Aucun scan effectue. Lancez votre premier scan pour voir les
                    resultats.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="competitive" className="mt-4 space-y-6">
              {/* Filtre type de prompt */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtrer :</span>
                {[
                  { value: 'all', label: 'Tous les prompts' },
                  { value: 'generique', label: 'Génériques' },
                  { value: 'marque', label: 'Marque' },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    variant={promptFilter === opt.value ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setPromptFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <CategoryScores results={results} />
              <CompetitorRanking
                scores={scores}
                results={promptFilter === 'all' ? results : results?.filter(r => r.type_prompt === promptFilter)}
              />
              <PromptPerformance
                results={promptFilter === 'all' ? results : results?.filter(r => r.type_prompt === promptFilter)}
              />
              <SentimentOverview
                results={promptFilter === 'all' ? results : results?.filter(r => r.type_prompt === promptFilter)}
              />
              {!scores?.length && (
                <div className="py-8 text-center text-muted-foreground">
                  <p>Lancez un scan pour voir l'analyse concurrentielle.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="evolution" className="mt-4">
              <VisibilityEvolution scores={scores} results={results} modifications={modifications} shopifyConfig={shopifyConfig} analysisResults={analysisResults} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
