import { useMemo, useState } from 'react';
import { Trophy, Medal, ChevronDown, ChevronUp, Eye, EyeOff, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const LLM_COLORS = {
  'Perplexity Sonar': 'bg-blue-100 text-blue-800',
  'Perplexity': 'bg-blue-100 text-blue-800',
  'OpenAI GPT-4o': 'bg-emerald-100 text-emerald-800',
  'OpenAI': 'bg-emerald-100 text-emerald-800',
  'Claude Sonnet': 'bg-orange-100 text-orange-800',
  'Anthropic': 'bg-orange-100 text-orange-800',
  'Gemini Pro': 'bg-purple-100 text-purple-800',
  'Gemini': 'bg-purple-100 text-purple-800',
  'Grok': 'bg-red-100 text-red-800',
};

// Nos 3 marques distinctes
const OUR_BRANDS = [
  {
    name: 'ISIS n GOLD',
    keywords: ['isis n gold', 'isisingold', 'isisngold', 'goldy isis', 'goldy-isis', 'goldy isis'],
    domains: ['isisngold.com', 'isisingold.com', 'isisngold.fr', 'isisingold.fr', 'goldy-isis.myshopify.com'],
  },
  {
    name: 'Ma Formation Strass',
    keywords: ['ma formation strass', 'ma-formation-strass'],
    domains: ['ma-formation-strass.com'],
  },
  {
    name: 'Strass Dentaires FR',
    keywords: ['strass-dentaires.fr', 'strass dentaires fr'],
    domains: ['strass-dentaires.fr'],
  },
];

const ALL_OUR_DOMAINS = OUR_BRANDS.flatMap(b => b.domains);

// Mapping concurrents : domaines → nom affiché
const COMPETITOR_ALIASES = {
  'strassdentaires.com': 'Strass Dentaires',
  'www.strassdentaires.com': 'Strass Dentaires',
  'toothgemsworld.com': 'Tooth Gems World',
  'grillzparadise.com': 'Grillz Paradise',
  'twinkles.net': 'Twinkles',
  'www.twinkles.net': 'Twinkles',
  'icybabeshop.com': 'Icy Babe Shop',
  'pearlofbeauty.fr': 'Pearl of Beauty',
  'www.beauty-academy.fr': 'Beauty Academy',
  'quality-academy.fr': 'Quality Academy',
  'dollygems.com': 'Dolly Gems',
  'allwhite.academy': 'AllWhite Academy',
  'gemsmile.jewelry': 'GemSmile',
  'thefunkyfangs.com': 'Funky Fangs',
  'lenavitch.com': 'Lenavitch',
  'www.lenavitch.com': 'Lenavitch',
  'devilish-tattoo.fr': 'Devilish Tattoo',
  'www.dermolift.fr': 'Dermolift',
  'www.sun7blvdprofessionnel.com': 'SUN7 BLVD',
  'kr-shop.fr': 'KR Shop',
  'www.julinails.fr': 'JuliNails',
  'www.cmaformation-na.fr': 'CMA Formation',
};

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isOurDomain(domain) {
  return ALL_OUR_DOMAINS.some(d => domain.includes(d.replace('www.', '')));
}

function getCompetitorName(domain) {
  const full = domain.startsWith('www.') ? domain : `www.${domain}`;
  return COMPETITOR_ALIASES[domain] || COMPETITOR_ALIASES[full] || COMPETITOR_ALIASES[domain.replace('www.', '')] || domain;
}

/** Détecte quelle(s) de nos marques sont mentionnées dans un résultat */
function detectOurBrands(result) {
  const found = new Set();
  const mentionText = (result.mention_exact_text || '').toLowerCase();
  const responseText = (result.response_text || '').toLowerCase();
  const citationUrls = (result.citations_urls || '').toLowerCase();

  for (const brand of OUR_BRANDS) {
    // Vérifier dans le texte de mention exact
    for (const kw of brand.keywords) {
      if (mentionText.includes(kw)) { found.add(brand.name); break; }
    }
    // Vérifier dans les URLs de citations
    for (const domain of brand.domains) {
      if (citationUrls.includes(domain)) { found.add(brand.name); break; }
    }
    // Si pas trouvé, vérifier dans la réponse complète
    if (!found.has(brand.name)) {
      for (const kw of brand.keywords) {
        if (responseText.includes(kw)) { found.add(brand.name); break; }
      }
    }
  }
  return found;
}

function RankBadge({ rank }) {
  if (rank === 0) return <span className="text-xs text-muted-foreground">--</span>;
  if (rank === 1) return <span className="flex items-center gap-0.5 text-amber-500 font-bold"><Trophy className="h-3.5 w-3.5" />{rank}</span>;
  if (rank <= 3) return <span className="flex items-center gap-0.5 text-blue-500 font-semibold"><Medal className="h-3.5 w-3.5" />{rank}</span>;
  return <span className="text-sm text-muted-foreground">{rank}</span>;
}

function ScoreBar({ score, max = 100 }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = score >= 50 ? 'bg-green-500' : score >= 20 ? 'bg-orange-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold min-w-[28px] text-right ${score >= 50 ? 'text-green-600' : score >= 20 ? 'text-orange-500' : 'text-red-500'}`}>
        {score}
      </span>
    </div>
  );
}

export function CompetitorRanking({ scores, results }) {
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    if (!results?.length) return null;

    const latestDate = results[0]?.date_scan;
    const latest = results.filter(r => r.date_scan === latestDate);
    const llmNames = [...new Set(latest.map(r => r.llm_name).filter(Boolean))];

    // Initialiser nos 3 marques
    const ourBrands = {};
    for (const brand of OUR_BRANDS) {
      ourBrands[brand.name] = { llms: {}, totalMentions: 0, totalCited: 0 };
      for (const llm of llmNames) {
        ourBrands[brand.name].llms[llm] = { mentions: 0, cited: 0, prompts: 0 };
      }
    }

    // Concurrents
    const competitors = {};

    // Total de prompts par LLM
    const promptsPerLlm = {};
    for (const llm of llmNames) promptsPerLlm[llm] = 0;

    for (const r of latest) {
      const llm = r.llm_name;
      if (!llm) continue;
      promptsPerLlm[llm]++;

      // Détecter quelles de NOS marques sont mentionnées
      const detectedBrands = detectOurBrands(r);
      const citationUrls = (r.citations_urls || '').toLowerCase();

      for (const brandName of detectedBrands) {
        ourBrands[brandName].llms[llm].mentions++;
        ourBrands[brandName].totalMentions++;

        // Vérifier si notre domaine est dans les citations
        const brand = OUR_BRANDS.find(b => b.name === brandName);
        const hasCitation = brand.domains.some(d => citationUrls.includes(d));
        if (hasCitation) {
          ourBrands[brandName].llms[llm].cited++;
          ourBrands[brandName].totalCited++;
        }
      }

      // Extraire les concurrents depuis citations_urls
      const urls = (r.citations_urls || '').split(',').map(u => u.trim()).filter(Boolean);
      const seenInThisResult = new Set();

      for (const url of urls) {
        const domain = extractDomain(url);
        if (!domain || isOurDomain(domain)) continue;

        const name = getCompetitorName(domain);
        if (seenInThisResult.has(name)) continue;
        seenInThisResult.add(name);

        if (!competitors[name]) {
          competitors[name] = { domains: new Set(), llms: {}, totalMentions: 0 };
          for (const l of llmNames) {
            competitors[name].llms[l] = { mentions: 0 };
          }
        }
        competitors[name].domains.add(domain);
        competitors[name].llms[llm].mentions++;
        competitors[name].totalMentions++;
      }
    }

    // Mettre à jour prompts par LLM
    for (const brand of Object.values(ourBrands)) {
      for (const llm of llmNames) brand.llms[llm].prompts = promptsPerLlm[llm];
    }

    // Aussi utiliser competitors_data des scores si disponible
    const latestScoreDate = scores?.[0]?.date;
    const latestScores = scores?.filter(s => s.date === latestScoreDate) || [];
    for (const s of latestScores) {
      let compData = {};
      try { compData = s.competitors_data ? JSON.parse(s.competitors_data) : {}; } catch { /* */ }
      for (const [name, info] of Object.entries(compData)) {
        if (!competitors[name]) {
          competitors[name] = { domains: new Set(), llms: {}, totalMentions: 0 };
          for (const l of llmNames) {
            competitors[name].llms[l] = { mentions: 0 };
          }
        }
        if (competitors[name].llms[s.llm_name]) {
          const existing = competitors[name].llms[s.llm_name].mentions;
          competitors[name].llms[s.llm_name].mentions = Math.max(existing, info.mentions || 0);
          competitors[name].totalMentions = Object.values(competitors[name].llms)
            .reduce((sum, l) => sum + l.mentions, 0);
        }
      }
    }

    // Calculer les scores
    const calcRate = (llmData) => {
      let total = 0;
      let count = 0;
      for (const [, info] of Object.entries(llmData)) {
        const prompts = info.prompts || promptsPerLlm[Object.keys(promptsPerLlm)[0]] || 1;
        const rate = (info.mentions / prompts) * 100;
        total += rate;
        count++;
      }
      return count > 0 ? Math.round(total / count) : 0;
    };

    // Construire nos marques formatées
    const ourBrandsFormatted = OUR_BRANDS.map(brand => {
      const data = ourBrands[brand.name];
      return {
        name: brand.name,
        domains: brand.domains,
        isOurs: true,
        totalMentions: data.totalMentions,
        totalCited: data.totalCited,
        score: calcRate(data.llms),
        llmDetails: llmNames.map(llm => ({
          llm,
          mentions: data.llms[llm].mentions,
          cited: data.llms[llm].cited,
          prompts: data.llms[llm].prompts,
          rate: data.llms[llm].prompts > 0
            ? Math.round((data.llms[llm].mentions / data.llms[llm].prompts) * 100)
            : 0,
        })),
      };
    });

    // Construire concurrents formatés
    const competitorsFormatted = Object.entries(competitors)
      .map(([name, info]) => ({
        name,
        domains: [...(info.domains || [])],
        isOurs: false,
        totalMentions: info.totalMentions,
        totalCited: 0,
        score: (() => {
          let total = 0;
          let count = 0;
          for (const llm of llmNames) {
            const mentions = info.llms[llm]?.mentions || 0;
            const prompts = promptsPerLlm[llm] || 1;
            total += (mentions / prompts) * 100;
            count++;
          }
          return count > 0 ? Math.round(total / count) : 0;
        })(),
        llmDetails: llmNames.map(llm => ({
          llm,
          mentions: info.llms[llm]?.mentions || 0,
          cited: 0,
          prompts: promptsPerLlm[llm] || 0,
          rate: promptsPerLlm[llm] > 0
            ? Math.round(((info.llms[llm]?.mentions || 0) / promptsPerLlm[llm]) * 100)
            : 0,
        })),
      }))
      .sort((a, b) => b.score - a.score || b.totalMentions - a.totalMentions);

    // Score global combiné de nos 3 marques (pour la comparaison "devant nous")
    const ourBestScore = Math.max(...ourBrandsFormatted.map(b => b.score), 0);

    return {
      ourBrands: ourBrandsFormatted,
      competitors: competitorsFormatted,
      llmNames,
      promptsPerLlm,
      ourBestScore,
    };
  }, [scores, results]);

  if (!data) return null;

  const visible = showAll ? data.competitors : data.competitors.slice(0, 10);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        Classement concurrentiel
        <span className="text-xs font-normal text-muted-foreground">
          ({data.competitors.length} concurrents détectés)
        </span>
      </h3>

      {/* Tableau comparatif */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 text-left text-xs font-medium text-muted-foreground bg-muted/30 min-w-[160px]">
                Marque
              </th>
              <th className="border p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30 min-w-[80px]">
                Score
              </th>
              <th className="border p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30">
                Mentions
              </th>
              {data.llmNames.map(llm => (
                <th key={llm} className="border p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30 min-w-[70px]">
                  {llm.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* === NOS 3 MARQUES === */}
            {data.ourBrands.map((brand, idx) => (
              <tr
                key={brand.name}
                className={`bg-primary/5 font-medium ${idx === data.ourBrands.length - 1 ? 'border-b-2 border-primary/30' : ''}`}
              >
                <td className="border p-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    <span className="font-bold">{brand.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 ml-5">
                    {brand.domains.map(d => <p key={d}>{d}</p>)}
                  </div>
                </td>
                <td className="border p-2">
                  <ScoreBar score={brand.score} />
                </td>
                <td className="border p-2 text-center">
                  <span className="font-bold">{brand.totalMentions}</span>
                  {brand.totalCited > 0 && (
                    <p className="text-[10px] text-green-600">{brand.totalCited} citations</p>
                  )}
                </td>
                {brand.llmDetails.map(detail => (
                  <td key={detail.llm} className="border p-2 text-center">
                    {detail.mentions > 0 ? (
                      <>
                        <span className={`text-sm font-bold ${detail.rate >= 50 ? 'text-green-600' : detail.rate > 0 ? 'text-orange-500' : 'text-red-400'}`}>
                          {detail.rate}%
                        </span>
                        <p className="text-[10px] text-muted-foreground">{detail.mentions}/{detail.prompts}</p>
                        {detail.cited > 0 && (
                          <p className="text-[10px] text-green-600">{detail.cited} cit.</p>
                        )}
                      </>
                    ) : (
                      <span className="text-red-400 text-xs">0%</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}

            {/* === CONCURRENTS === */}
            {visible.map((comp, i) => {
              const isAboveUs = comp.score > data.ourBestScore;
              return (
                <tr key={comp.name} className={isAboveUs ? 'bg-red-50/50' : ''}>
                  <td className="border p-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <RankBadge rank={i + 1} />
                      <span className="font-medium capitalize">{comp.name}</span>
                    </div>
                    {comp.domains.length > 0 && (
                      <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 ml-5">
                        {comp.domains.map(d => <p key={d}>{d}</p>)}
                      </div>
                    )}
                    {isAboveUs && (
                      <span className="text-[10px] text-red-500 font-medium ml-5">devant nous</span>
                    )}
                  </td>
                  <td className="border p-2">
                    <ScoreBar score={comp.score} />
                  </td>
                  <td className="border p-2 text-center">
                    <span className="font-medium">{comp.totalMentions}</span>
                  </td>
                  {comp.llmDetails.map(detail => (
                    <td key={detail.llm} className="border p-2 text-center">
                      {detail.mentions > 0 ? (
                        <>
                          <span className={`text-sm font-medium ${detail.rate >= 50 ? 'text-green-600' : 'text-orange-500'}`}>
                            {detail.rate}%
                          </span>
                          <p className="text-[10px] text-muted-foreground">{detail.mentions}/{detail.prompts}</p>
                        </>
                      ) : (
                        <EyeOff className="h-3 w-3 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.competitors.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAll ? 'Voir moins' : `Voir les ${data.competitors.length - 10} autres concurrents`}
        </button>
      )}

      {/* Légende */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
          Nos marques
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-6 rounded bg-red-50 border border-red-200" />
          Devant nous
        </span>
        <span>Score = taux moyen de citation par les LLMs</span>
      </div>
    </div>
  );
}
