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
  FileText,
  PenLine,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateActions, buildGeoAdvisorContext, isFixApplied, getFixStatusSummary } from '@/lib/insightActions';

const GEO_ADVISOR_URL = 'https://n8n.srv756714.hstgr.cloud/webhook/geo-advisor';
const JSONLD_GENERATOR_URL = 'https://n8n.srv756714.hstgr.cloud/webhook/generate-jsonld';
const SEO_CONTENT_URL = 'https://n8n.srv756714.hstgr.cloud/webhook/geo-seo-content';
const BLOG_CONTENT_URL = 'https://n8n.srv756714.hstgr.cloud/webhook/geo-blog-content';

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

function ActionItem({ action, applied }) {
  return (
    <div className={`flex items-start gap-2 rounded border p-2 ${applied ? 'bg-green-50/60 border-green-200' : 'bg-white/60'}`}>
      {applied ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
      ) : (
        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${applied ? 'text-green-800' : ''}`}>{action.label}</span>
          {applied && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
              deja applique
            </Badge>
          )}
          {!applied && action.impact && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${IMPACT_COLORS[action.impact] || ''}`}>
              {action.impact}
            </Badge>
          )}
          {!applied && action.fixId && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
              fix auto
            </Badge>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${applied ? 'text-green-700/70' : 'text-muted-foreground'}`}>{action.detail}</p>
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

function SeoContentOptimizer({ shopifyConfig }) {
  const [state, setState] = useState('idle');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [previewLang, setPreviewLang] = useState('fr');

  const generate = useCallback(async () => {
    setState('generating');
    setError(null);
    try {
      const res = await fetch(SEO_CONTENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
          language: 'both',
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result = await res.json();
      if (!result.success || !result.products?.length) throw new Error('Aucun produit optimise retourne');
      setData(result);
      setState('preview');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }, [shopifyConfig]);

  const handleApply = async () => {
    setState('applying');
    try {
      const res = await fetch('/.netlify/functions/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixId: 'geo-seo-content',
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
          customSnippet: JSON.stringify(data.products),
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Erreur application');
      setData((prev) => ({ ...prev, applyResult: result }));
      setState('applied');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold text-emerald-800">SEO Content Optimizer</span>
      </div>

      {state === 'idle' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Genere les meta titles, descriptions et tags en FR + EN simultanement via GPT-4o, puis applique via l'API Translations Shopify.
          </p>
          <Button variant="outline" size="sm" className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-100" onClick={generate}>
            <FileText className="h-3.5 w-3.5" />
            Analyser les produits (FR + EN)
          </Button>
        </div>
      )}

      {state === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des produits Shopify et optimisation par GPT-4o...
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Apercu :</span>
            {['fr', 'en'].map((lang) => (
              <button
                key={lang}
                onClick={() => setPreviewLang(lang)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  previewLang === lang
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="rounded border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-emerald-100/70">
                <tr>
                  <th className="text-left p-2 font-medium">Produit</th>
                  <th className="text-left p-2 font-medium">Meta Title ({previewLang.toUpperCase()})</th>
                  <th className="text-left p-2 font-medium">Meta Description ({previewLang.toUpperCase()})</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => {
                  const langData = p[previewLang] || {};
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 font-medium text-emerald-800">{p.title || `#${p.id}`}</td>
                      <td className="p-2 text-muted-foreground">{langData.meta_title || '-'}</td>
                      <td className="p-2 text-muted-foreground">{(langData.meta_description || '-').slice(0, 80)}{langData.meta_description?.length > 80 ? '...' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={handleApply}>
              <Check className="h-3.5 w-3.5" />
              Appliquer FR + EN sur Shopify ({data.products.length} produits)
            </Button>
          </div>
        </div>
      )}

      {state === 'applying' && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Mise a jour FR (REST) + EN (Translations API)...
        </div>
      )}

      {state === 'applied' && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            {data?.applyResult?.message || 'Produits mis a jour avec succes !'}
          </div>
          {data?.applyResult?.details && (
            <div className="pl-6 space-y-0.5">
              <p className="text-xs text-muted-foreground">
                Locale primaire : {data.applyResult.details.primaryLocale || '?'}
                {data.applyResult.details.frSuccess > 0 && ` · ${data.applyResult.details.frSuccess} FR`}
                {data.applyResult.details.enSuccess > 0 && ` · ${data.applyResult.details.enSuccess} EN`}
              </p>
              {data.applyResult.details.errors?.length > 0 && (
                <p className="text-xs text-red-500">
                  Erreurs : {data.applyResult.details.errors.slice(0, 3).join(' | ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const BLOG_SUGGESTIONS = [
  'Comment poser des strass dentaires',
  'Bijoux dentaires : guide complet 2026',
  'Tooth gems : tendances et entretien',
  'Formation professionnelle pose strass',
  'Strass dentaires vs grills : comparatif',
];

function BlogContentGenerator({ shopifyConfig }) {
  const [state, setState] = useState('idle');
  const [topic, setTopic] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showHtml, setShowHtml] = useState(false);

  const generate = useCallback(async (topicText) => {
    const t = topicText || topic;
    if (!t.trim()) return;
    setState('generating');
    setError(null);
    try {
      const res = await fetch(BLOG_CONTENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: t,
          keywords: t,
          brandName: 'ISIS n GOLD',
          niche: 'bijoux dentaires, strass dentaires, tooth gems',
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result = await res.json();
      if (!result.success || !result.html_content) throw new Error('Aucun article genere');
      setData(result);
      setState('preview');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }, [topic, shopifyConfig]);

  const handleApply = async () => {
    setState('applying');
    try {
      const res = await fetch('/.netlify/functions/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixId: 'geo-blog-content',
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
          customSnippet: JSON.stringify({
            title: data.title,
            html_content: data.html_content,
            meta_description: data.meta_description,
            tags: data.tags,
          }),
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Erreur creation');
      setData((prev) => ({ ...prev, applyResult: result }));
      setState('applied');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-pink-200 bg-pink-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <PenLine className="h-4 w-4 text-pink-600" />
        <span className="text-sm font-semibold text-pink-800">Blog Content Generator</span>
      </div>

      {state === 'idle' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Generez un article de blog expert (1500+ mots) optimise GEO via Claude IA.
          </p>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="Sujet de l'article..."
            className="w-full rounded border border-pink-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
          <div className="flex flex-wrap gap-1.5">
            {BLOG_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setTopic(s); generate(s); }}
                className="rounded-full border border-pink-200 bg-white px-2.5 py-0.5 text-xs text-pink-700 hover:bg-pink-100 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          {topic.trim() && (
            <Button variant="outline" size="sm" className="gap-2 text-pink-700 border-pink-300 hover:bg-pink-100" onClick={() => generate()}>
              <PenLine className="h-3.5 w-3.5" />
              Generer l'article
            </Button>
          )}
        </div>
      )}

      {state === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-pink-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redaction de l'article par Claude IA...
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">Erreur : {error}</p>
          <Button variant="outline" size="sm" onClick={() => setState('idle')}>Reessayer</Button>
        </div>
      )}

      {state === 'preview' && data && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-pink-900">{data.title}</h4>
            <p className="text-xs text-muted-foreground">{data.meta_description}</p>
            {data.tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {data.tags.split(',').map((tag) => (
                  <Badge key={tag.trim()} variant="outline" className="text-[10px] px-1.5 py-0 bg-pink-100 text-pink-700 border-pink-200">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
            {data.estimated_read_time && (
              <p className="text-[10px] text-pink-600">Temps de lecture : {data.estimated_read_time}</p>
            )}
          </div>

          <div>
            <button
              onClick={() => setShowHtml(!showHtml)}
              className="flex items-center gap-1 text-xs text-pink-600 hover:text-pink-800"
            >
              {showHtml ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showHtml ? 'Masquer' : 'Voir'} l'article
            </button>
            {showHtml && (
              <div
                className="mt-2 max-h-80 overflow-auto rounded border border-pink-200 bg-white p-4 prose prose-sm prose-pink"
                dangerouslySetInnerHTML={{ __html: data.html_content }}
              />
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="gap-2 bg-pink-600 hover:bg-pink-700" onClick={handleApply}>
              <PenLine className="h-3.5 w-3.5" />
              Creer comme brouillon Shopify
            </Button>
            <Button variant="outline" size="sm" onClick={() => setState('idle')}>
              Nouveau sujet
            </Button>
          </div>
        </div>
      )}

      {state === 'applying' && (
        <div className="flex items-center gap-2 text-sm text-pink-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creation du brouillon dans Shopify...
        </div>
      )}

      {state === 'applied' && data?.applyResult && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            {data.applyResult.message}
          </div>
          {data.applyResult.details?.adminUrl && (
            <a
              href={data.applyResult.details.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-pink-700 hover:text-pink-900 underline"
            >
              <ExternalLink className="h-3 w-3" />
              Voir dans Shopify Admin
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, scores, results, shopifyConfig, analysisResults }) {
  const [expanded, setExpanded] = useState(false);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showJsonLdOptimizer, setShowJsonLdOptimizer] = useState(false);
  const [showSeoOptimizer, setShowSeoOptimizer] = useState(false);
  const [showBlogGenerator, setShowBlogGenerator] = useState(false);

  const actions = useMemo(
    () => generateActions(insight.type, insight.context),
    [insight.type, insight.context]
  );

  const hasJsonLdAction = useMemo(
    () => actions.some((a) => a.fixId === 'seo-json-ld'),
    [actions]
  );

  const hasSeoContentAction = useMemo(
    () => actions.some((a) => a.fixId === 'geo-seo-content'),
    [actions]
  );

  const hasBlogContentAction = useMemo(
    () => actions.some((a) => a.fixId === 'geo-blog-content'),
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
          {/* Actions statiques — fixes appliques en dernier */}
          {[...actions]
            .sort((a, b) => {
              const aApplied = a.fixId ? isFixApplied(a.fixId, analysisResults) : false;
              const bApplied = b.fixId ? isFixApplied(b.fixId, analysisResults) : false;
              return aApplied - bApplied;
            })
            .map((action, i) => (
              <ActionItem
                key={i}
                action={action}
                applied={action.fixId ? isFixApplied(action.fixId, analysisResults) : false}
              />
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

            {/* SEO Content Optimizer button */}
            {hasSeoContentAction && shopifyConfig?.store && shopifyConfig?.accessToken && !showSeoOptimizer && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                onClick={() => setShowSeoOptimizer(true)}
              >
                <FileText className="h-3.5 w-3.5" />
                Optimiser SEO produits (IA)
              </Button>
            )}

            {/* Blog Content Generator button */}
            {hasBlogContentAction && shopifyConfig?.store && shopifyConfig?.accessToken && !showBlogGenerator && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-pink-700 border-pink-300 hover:bg-pink-50"
                onClick={() => setShowBlogGenerator(true)}
              >
                <PenLine className="h-3.5 w-3.5" />
                Generer article blog (IA)
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

          {/* SEO Content Optimizer */}
          {showSeoOptimizer && shopifyConfig && (
            <SeoContentOptimizer shopifyConfig={shopifyConfig} />
          )}

          {/* Blog Content Generator */}
          {showBlogGenerator && shopifyConfig && (
            <BlogContentGenerator shopifyConfig={shopifyConfig} />
          )}

          {/* Resultat IA */}
          <AiAdviceCard advice={aiAdvice} />
        </div>
      )}
    </div>
  );
}

export function InsightsPanel({ scores, results, shopifyConfig, analysisResults }) {
  const [showTopOptimizer, setShowTopOptimizer] = useState(false);
  const hasShopify = !!(shopifyConfig?.store && shopifyConfig?.accessToken);

  const fixSummary = useMemo(
    () => getFixStatusSummary(analysisResults),
    [analysisResults]
  );

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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recommandations</h3>
        {hasShopify && !showTopOptimizer && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
            onClick={() => setShowTopOptimizer(true)}
          >
            <Code2 className="h-3.5 w-3.5" />
            Optimiser JSON-LD (IA)
          </Button>
        )}
      </div>
      {/* Resume des fixes Shopify */}
      {hasShopify && (fixSummary.applied.length > 0 || fixSummary.pending.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Fixes Shopify :</span>
          {fixSummary.applied.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
              <Check className="mr-0.5 h-3 w-3" />
              {fixSummary.applied.length} appliques
            </Badge>
          )}
          {fixSummary.pending.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
              <Wrench className="mr-0.5 h-3 w-3" />
              {fixSummary.pending.length} a faire
            </Badge>
          )}
        </div>
      )}
      {showTopOptimizer && hasShopify && (
        <div className="mb-3">
          <JsonLdOptimizer shopifyConfig={shopifyConfig} />
        </div>
      )}
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <InsightCard
            key={i}
            insight={insight}
            scores={scores}
            results={results}
            shopifyConfig={shopifyConfig}
            analysisResults={analysisResults}
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
