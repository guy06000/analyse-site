import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Wrench,
  ArrowRight,
  Code2,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateActions, buildGeoAdvisorContext } from '@/lib/insightActions';

const GEO_ADVISOR_URL = 'https://n8n.srv756714.hstgr.cloud/webhook/geo-advisor';
const JSONLD_GENERATOR_URL = 'https://n8n.srv756714.hstgr.cloud/webhook/generate-jsonld';

const IMPACT_COLORS = {
  fort: 'bg-red-100 text-red-700 border-red-200',
  moyen: 'bg-amber-100 text-amber-700 border-amber-200',
  faible: 'bg-green-100 text-green-700 border-green-200',
};

const DIFFICULTY_COLORS = {
  facile: 'text-green-600',
  moyen: 'text-amber-600',
  difficile: 'text-red-600',
};

function ActionItem({ action }) {
  return (
    <div className="flex items-start gap-2 rounded border bg-white/60 p-2">
      <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{action.label}</span>
          {action.impact && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${IMPACT_COLORS[action.impact] || ''}`}>
              {action.impact}
            </Badge>
          )}
          {action.fixId && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
              fix auto
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{action.detail}</p>
      </div>
    </div>
  );
}

function AiAdviceCard({ advice }) {
  if (!advice) return null;

  return (
    <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-600" />
        <span className="text-sm font-semibold text-purple-800">Analyse IA GEO</span>
      </div>
      {advice.analysis && (
        <p className="text-sm text-purple-900/80">{advice.analysis}</p>
      )}
      {advice.actions?.length > 0 && (
        <div className="space-y-2">
          {advice.actions.map((a, i) => (
            <div key={i} className="rounded border border-purple-200 bg-white/70 p-2">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 shrink-0 text-purple-500" />
                <span className="text-sm font-medium">{a.title}</span>
                {a.impact && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${IMPACT_COLORS[a.impact] || ''}`}>
                    {a.impact}
                  </Badge>
                )}
                {a.difficulty && (
                  <span className={`text-[10px] ${DIFFICULTY_COLORS[a.difficulty] || ''}`}>
                    {a.difficulty}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
              {a.timeline && (
                <p className="text-[10px] text-purple-600 mt-1">Delai : {a.timeline}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JsonLdOptimizer({ shopifyConfig }) {
  const [state, setState] = useState('generating');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showCode, setShowCode] = useState(false);

  const generate = useCallback(async () => {
    setState('generating');
    setError(null);
    try {
      const res = await fetch(JSONLD_GENERATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
          shopUrl: `https://${shopifyConfig.store}`,
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result = await res.json();
      if (!result.liquidCode) throw new Error('Pas de code Liquid genere');
      setData(result);
      setState('preview');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }, [shopifyConfig]);

  useEffect(() => {
    generate();
  }, [generate]);

  const handleApply = async () => {
    setState('applying');
    try {
      const res = await fetch('/.netlify/functions/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixId: 'seo-json-ld-geo',
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
          customSnippet: data.liquidCode,
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Erreur application');
      setState('applied');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-800">JSON-LD GEO Optimizer</span>
      </div>

      {state === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des donnees Shopify et generation par GPT-4o...
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">Erreur : {error}</p>
          <Button variant="outline" size="sm" onClick={generate}>Reessayer</Button>
        </div>
      )}

      {state === 'preview' && data && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {data.schemas?.map((s) => (
              <Badge key={s} variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-200">
                {s}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground self-center ml-1">
              {data.schemas?.length || 0} schemas
            </span>
          </div>

          <div>
            <button
              onClick={() => setShowCode(!showCode)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              {showCode ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showCode ? 'Masquer' : 'Voir'} le code Liquid
            </button>
            {showCode && (
              <pre className="mt-2 max-h-60 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                {data.liquidCode}
              </pre>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700" onClick={handleApply}>
              <Check className="h-3.5 w-3.5" />
              Appliquer sur Shopify
            </Button>
          </div>
        </div>
      )}

      {state === 'applying' && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Application du snippet sur Shopify...
        </div>
      )}

      {state === 'applied' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <Check className="h-4 w-4" />
          JSON-LD GEO applique avec succes ! Le cache Shopify peut mettre 1-2 min a se rafraichir.
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, scores, results, shopifyConfig }) {
  const [expanded, setExpanded] = useState(false);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showJsonLdOptimizer, setShowJsonLdOptimizer] = useState(false);

  const actions = useMemo(
    () => generateActions(insight.type, insight.context),
    [insight.type, insight.context]
  );

  const hasJsonLdAction = useMemo(
    () => actions.some((a) => a.fixId === 'seo-json-ld'),
    [actions]
  );

  const handleAiAdvice = useCallback(async () => {
    if (aiAdvice) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const payload = buildGeoAdvisorContext(insight, scores, results);
      const res = await fetch(GEO_ADVISOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setAiAdvice(data);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }, [insight, scores, results, aiAdvice]);

  const hasContent = actions.length > 0;

  return (
    <div className={`rounded-lg border ${insight.bg}`}>
      <button
        onClick={() => hasContent && setExpanded(!expanded)}
        className={`flex w-full items-start gap-3 p-3 text-left ${hasContent ? 'cursor-pointer' : ''}`}
      >
        <insight.icon className={`mt-0.5 h-4 w-4 shrink-0 ${insight.color}`} />
        <p className="flex-1 text-sm">{insight.message}</p>
        {hasContent && (
          <span className="shrink-0 mt-0.5">
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {/* Actions statiques */}
          {actions.map((action, i) => (
            <ActionItem key={i} action={action} />
          ))}

          {/* Boutons IA */}
          <div className="pt-1 flex flex-wrap gap-2">
            {/* JSON-LD Optimizer button */}
            {hasJsonLdAction && shopifyConfig?.store && shopifyConfig?.accessToken && !showJsonLdOptimizer && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                onClick={() => setShowJsonLdOptimizer(true)}
              >
                <Code2 className="h-3.5 w-3.5" />
                Optimiser JSON-LD (IA)
              </Button>
            )}

            {/* Conseil IA GEO button */}
            {!aiAdvice && !aiLoading && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-purple-700 border-purple-300 hover:bg-purple-50"
                onClick={handleAiAdvice}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Conseil IA GEO
              </Button>
            )}
            {aiLoading && (
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyse en cours...
              </div>
            )}
            {aiError && (
              <div className="text-xs text-red-500">
                Erreur : {aiError}
                <button onClick={() => { setAiError(null); handleAiAdvice(); }} className="ml-2 underline">
                  Reessayer
                </button>
              </div>
            )}
          </div>

          {/* JSON-LD Optimizer */}
          {showJsonLdOptimizer && shopifyConfig && (
            <JsonLdOptimizer shopifyConfig={shopifyConfig} />
          )}

          {/* Resultat IA */}
          <AiAdviceCard advice={aiAdvice} />
        </div>
      )}
    </div>
  );
}

export function InsightsPanel({ scores, results, shopifyConfig }) {
  const insights = useMemo(() => {
    const list = [];
    if (!scores?.length) return list;

    // Dernier scan
    const latestDate = scores[0]?.date;
    const latestScores = scores.filter((s) => s.date === latestDate);

    // Resultats du dernier scan
    const latestResultDate = results?.[0]?.date_scan;
    const latestResults = results?.filter((r) => r.date_scan === latestResultDate) || [];

    // Helper : trouver les thematiques faibles pour un LLM
    const getWeakThematiques = (llmName) => {
      const llmResults = latestResults.filter((r) => r.llm_name === llmName);
      const themes = {};
      for (const r of llmResults) {
        const t = r.thematique || 'autre';
        if (!themes[t]) themes[t] = { total: 0, mentions: 0 };
        themes[t].total++;
        if (r.mention_detected === 'oui') themes[t].mentions++;
      }
      return Object.entries(themes)
        .filter(([, v]) => v.total > 0 && v.mentions / v.total < 0.3)
        .sort((a, b) => (a[1].mentions / a[1].total) - (b[1].mentions / b[1].total))
        .map(([k]) => k);
    };

    // Regle 1 : LLM avec score 0
    for (const s of latestScores) {
      if (s.score_moyen === 0 || (s.nb_mentions === 0 && s.taux_mention === 0)) {
        list.push({
          type: 'zero_visibility',
          context: {
            llm_name: s.llm_name,
            weakThematiques: getWeakThematiques(s.llm_name),
          },
          priority: 1,
          icon: AlertTriangle,
          color: 'text-amber-500',
          bg: 'bg-amber-50 border-amber-200',
          message: `Aucune visibilite sur ${s.llm_name}. Priorite : creer du contenu citable et enrichir les donnees structurees.`,
        });
      }
    }

    // Regle 4 : tendance en baisse
    for (const s of latestScores) {
      if (s.tendance === 'baisse') {
        list.push({
          type: 'declining',
          context: { llm_name: s.llm_name },
          priority: 2,
          icon: TrendingDown,
          color: 'text-red-500',
          bg: 'bg-red-50 border-red-200',
          message: `Attention : score en baisse sur ${s.llm_name}. Verifiez les changements recents de contenu.`,
        });
      }
    }

    // Regle 2 : taux mention < 20% (mais > 0)
    for (const s of latestScores) {
      if (s.taux_mention > 0 && s.taux_mention < 20) {
        list.push({
          type: 'low_mention',
          context: {
            llm_name: s.llm_name,
            taux: s.taux_mention,
            weakThematiques: getWeakThematiques(s.llm_name),
          },
          priority: 3,
          icon: AlertTriangle,
          color: 'text-amber-500',
          bg: 'bg-amber-50 border-amber-200',
          message: `${s.llm_name} mentionne rarement votre marque (${s.taux_mention}%). Ameliorez le SEO et les donnees structurees.`,
        });
      }
    }

    // Regle 3 : mention brand mais jamais domain
    if (latestResults.length > 0) {
      const hasBrand = latestResults.some((r) => r.mention_type === 'brand');
      const hasDomain = latestResults.some((r) => r.mention_type === 'domain');
      if (hasBrand && !hasDomain) {
        list.push({
          type: 'brand_no_url',
          context: {},
          priority: 4,
          icon: Lightbulb,
          color: 'text-blue-500',
          bg: 'bg-blue-50 border-blue-200',
          message: 'Les LLMs citent votre marque mais pas votre URL. Ajoutez des backlinks et un fichier llms.txt.',
        });
      }
    }

    // Regle 5 : prompt jamais cite
    if (latestResults.length > 0) {
      const promptData = {};
      for (const r of latestResults) {
        if (!r.prompt_question) continue;
        if (!promptData[r.prompt_question]) {
          promptData[r.prompt_question] = { mentioned: false, thematique: r.thematique, competitors: [] };
        }
        if (r.mention_detected === 'oui') {
          promptData[r.prompt_question].mentioned = true;
        }
        const comps = parseCompetitors(r.competitors_mentioned);
        for (const c of comps) {
          if (!promptData[r.prompt_question].competitors.includes(c)) {
            promptData[r.prompt_question].competitors.push(c);
          }
        }
      }
      for (const [prompt, data] of Object.entries(promptData)) {
        if (!data.mentioned) {
          const short = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
          list.push({
            type: 'dead_prompt',
            context: {
              prompt_short: short,
              prompt_full: prompt,
              thematique: data.thematique,
              competitors_cited: data.competitors.slice(0, 5),
            },
            priority: 5,
            icon: Lightbulb,
            color: 'text-blue-500',
            bg: 'bg-blue-50 border-blue-200',
            message: `Le prompt "${short}" ne genere aucune mention sur aucun LLM. Evaluez la pertinence de ce prompt.`,
          });
        }
      }
    }

    // Regle 6 : site jamais dans les citations
    if (latestResults.length > 0) {
      const hasCitation = latestResults.some(
        (r) => r.citations_urls && r.citations_urls.length > 0
      );
      if (!hasCitation) {
        list.push({
          type: 'no_citations',
          context: {},
          priority: 4,
          icon: Lightbulb,
          color: 'text-blue-500',
          bg: 'bg-blue-50 border-blue-200',
          message: "Votre site n'apparait jamais dans les citations/sources des LLMs. Travaillez les backlinks et le fichier llms.txt.",
        });
      }
    }

    // Regle 7 : concurrents mieux positionnes
    for (const s of latestScores) {
      if (s.top_competitor && s.avg_brand_rank > 2) {
        list.push({
          type: 'competitor_ahead',
          context: {
            llm_name: s.llm_name,
            top_competitor: s.top_competitor,
            avg_brand_rank: s.avg_brand_rank,
          },
          priority: 3,
          icon: AlertTriangle,
          color: 'text-amber-500',
          bg: 'bg-amber-50 border-amber-200',
          message: `Sur ${s.llm_name}, vous etes en position ${s.avg_brand_rank} en moyenne. "${s.top_competitor}" est mieux reference. Analysez son contenu et ses backlinks.`,
        });
      }
    }

    // Regle 8 : concurrent dominant sur un LLM specifique
    for (const s of latestScores) {
      let compData = {};
      try {
        compData = s.competitors_data ? JSON.parse(s.competitors_data) : {};
      } catch { /* ignore */ }
      const dominantComps = Object.entries(compData)
        .filter(([, info]) => info.mentions >= 3)
        .sort((a, b) => b[1].mentions - a[1].mentions);

      if (dominantComps.length > 0 && s.nb_mentions === 0) {
        const [compName, compInfo] = dominantComps[0];
        list.push({
          type: 'competitor_dominant',
          context: {
            llm_name: s.llm_name,
            dominant_competitor: compName,
            competitor_mentions: compInfo.mentions,
          },
          priority: 2,
          icon: AlertTriangle,
          color: 'text-red-500',
          bg: 'bg-red-50 border-red-200',
          message: `"${compName}" domine sur ${s.llm_name} (${compInfo.mentions} mentions) alors que vous etes absent. Priorite haute.`,
        });
      }
    }

    // Regle 9 : tendance en hausse (positif)
    for (const s of latestScores) {
      if (s.tendance === 'hausse') {
        list.push({
          type: 'rising',
          context: { llm_name: s.llm_name },
          priority: 7,
          icon: TrendingUp,
          color: 'text-green-500',
          bg: 'bg-green-50 border-green-200',
          message: `Score en hausse sur ${s.llm_name}. Continuez les actions en cours sur ce moteur.`,
        });
      }
    }

    // Bonus : LLM performant
    const bestLlm = latestScores.reduce(
      (best, s) => (s.taux_mention > (best?.taux_mention || 0) ? s : best),
      null
    );
    if (bestLlm && bestLlm.taux_mention >= 50) {
      list.push({
        type: 'rising',
        context: { llm_name: bestLlm.llm_name },
        priority: 6,
        icon: TrendingUp,
        color: 'text-green-500',
        bg: 'bg-green-50 border-green-200',
        message: `${bestLlm.llm_name} cite votre marque dans ${bestLlm.taux_mention}% des cas. Concentrez-vous sur les autres LLMs.`,
      });
    }

    // Trier par priorite
    list.sort((a, b) => a.priority - b.priority);
    return list;
  }, [scores, results]);

  if (!insights.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Recommandations</h3>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <InsightCard
            key={i}
            insight={insight}
            scores={scores}
            results={results}
            shopifyConfig={shopifyConfig}
          />
        ))}
      </div>
    </div>
  );
}

function parseCompetitors(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { /* ignore */ }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
