import { useMemo, useState } from 'react';
import { Trophy, Medal, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
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

// Noms de marques et domaines à détecter comme "nous"
const OUR_BRANDS = [
  'isis n gold', 'isisingold', 'isisngold', 'goldy isis', 'goldy-isis',
  'ma formation strass', 'ma-formation-strass',
];
const OUR_DOMAINS = [
  'isisngold.com', 'isisingold.com', 'goldy-isis.myshopify.com',
  'ma-formation-strass.com', 'isisngold.fr', 'isisingold.fr',
];

// Mapping concurrents : domaines → nom affiché
const COMPETITOR_ALIASES = {
  'strassdentaires.com': 'Strass Dentaires',
  'strass-dentaires.fr': 'Strass Dentaires',
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
  return OUR_DOMAINS.some(d => domain.includes(d.replace('www.', '')));
}

function getCompetitorName(domain) {
  const full = domain.startsWith('www.') ? domain : `www.${domain}`;
  return COMPETITOR_ALIASES[domain] || COMPETITOR_ALIASES[full] || COMPETITOR_ALIASES[domain.replace('www.', '')] || domain;
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

    // Collecter les données par concurrent depuis les citations
    const competitors = {}; // name → { mentions per llm, citation count, etc }
    const ourData = {};     // llm → { mentions, cited, totalPrompts, totalScore }

    for (const llm of llmNames) {
      ourData[llm] = { mentions: 0, cited: 0, totalPrompts: 0, totalScore: 0 };
    }

    for (const r of latest) {
      const llm = r.llm_name;
      if (!llm) continue;

      ourData[llm].totalPrompts++;
      if (r.mention_detected === 'oui') {
        ourData[llm].mentions++;
        ourData[llm].totalScore += r.visibility_score || 0;
      }
      if (r.site_in_citations === 'oui') {
        ourData[llm].cited++;
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
          competitors[name] = { domains: new Set(), llms: {}, totalMentions: 0, totalCitations: 0 };
          for (const l of llmNames) {
            competitors[name].llms[l] = { mentions: 0, prompts: 0 };
          }
        }
        competitors[name].domains.add(domain);
        competitors[name].llms[llm].mentions++;
        competitors[name].totalMentions++;
        competitors[name].totalCitations++;
      }

      // Aussi compter le nombre total de prompts par LLM pour chaque concurrent
      for (const name of Object.keys(competitors)) {
        if (competitors[name].llms[llm]) {
          competitors[name].llms[llm].prompts = ourData[llm].totalPrompts;
        }
      }
    }

    // Mettre à jour le nombre de prompts pour chaque LLM
    for (const comp of Object.values(competitors)) {
      for (const llm of llmNames) {
        comp.llms[llm].prompts = ourData[llm].totalPrompts;
      }
    }

    // Aussi utiliser competitors_data des scores si disponible
    const latestScoreDate = scores?.[0]?.date;
    const latestScores = scores?.filter(s => s.date === latestScoreDate) || [];
    for (const s of latestScores) {
      let compData = {};
      try { compData = s.competitors_data ? JSON.parse(s.competitors_data) : {}; } catch { /* */ }
      for (const [name, info] of Object.entries(compData)) {
        if (!competitors[name]) {
          competitors[name] = { domains: new Set(), llms: {}, totalMentions: 0, totalCitations: 0 };
          for (const l of llmNames) {
            competitors[name].llms[l] = { mentions: 0, prompts: ourData[l]?.totalPrompts || 0 };
          }
        }
        if (competitors[name].llms[s.llm_name]) {
          // Prendre le max entre extraction citations et competitors_data
          const existing = competitors[name].llms[s.llm_name].mentions;
          competitors[name].llms[s.llm_name].mentions = Math.max(existing, info.mentions || 0);
          competitors[name].totalMentions = Object.values(competitors[name].llms)
            .reduce((sum, l) => sum + l.mentions, 0);
        }
      }
    }

    // Calculer un score de visibilité pour chaque concurrent
    const calcScore = (llmData) => {
      let total = 0;
      let count = 0;
      for (const [, info] of Object.entries(llmData)) {
        if (info.prompts === 0) continue;
        const rate = (info.mentions / info.prompts) * 100;
        total += rate;
        count++;
      }
      return count > 0 ? Math.round(total / count) : 0;
    };

    // Score de notre marque
    const ourScore = {};
    let ourGlobalMentions = 0;
    let ourGlobalPrompts = 0;
    let ourGlobalCited = 0;
    for (const llm of llmNames) {
      const d = ourData[llm];
      ourScore[llm] = d.totalPrompts > 0 ? Math.round((d.mentions / d.totalPrompts) * 100) : 0;
      ourGlobalMentions += d.mentions;
      ourGlobalPrompts += d.totalPrompts;
      ourGlobalCited += d.cited;
    }
    const ourGlobalRate = ourGlobalPrompts > 0 ? Math.round((ourGlobalMentions / ourGlobalPrompts) * 100) : 0;

    // Trier concurrents par totalMentions
    const sorted = Object.entries(competitors)
      .map(([name, info]) => ({
        name,
        domains: [...(info.domains || [])],
        totalMentions: info.totalMentions,
        llms: info.llms,
        score: calcScore(info.llms),
        llmDetails: llmNames.map(llm => ({
          llm,
          mentions: info.llms[llm]?.mentions || 0,
          prompts: info.llms[llm]?.prompts || 0,
          rate: info.llms[llm]?.prompts > 0
            ? Math.round((info.llms[llm].mentions / info.llms[llm].prompts) * 100)
            : 0,
        })),
      }))
      .sort((a, b) => b.score - a.score || b.totalMentions - a.totalMentions);

    return {
      competitors: sorted,
      llmNames,
      ourData,
      ourScore,
      ourGlobalRate,
      ourGlobalMentions,
      ourGlobalPrompts,
      ourGlobalCited,
      latestDate,
    };
  }, [scores, results]);

  if (!data || !data.competitors.length) return null;

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
              <th className="border p-2 text-left text-xs font-medium text-muted-foreground bg-muted/30 min-w-[140px]">
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
            {/* Notre marque en premier (surlignée) */}
            <tr className="bg-primary/5 font-medium border-b-2 border-primary/20">
              <td className="border p-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span className="font-bold">ISIS n GOLD</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  <p>isisngold.com</p>
                  <p>ma-formation-strass.com</p>
                </div>
              </td>
              <td className="border p-2">
                <ScoreBar score={data.ourGlobalRate} />
              </td>
              <td className="border p-2 text-center">
                <span className="font-bold">{data.ourGlobalMentions}</span>
                <span className="text-xs text-muted-foreground">/{data.ourGlobalPrompts}</span>
                {data.ourGlobalCited > 0 && (
                  <p className="text-[10px] text-green-600">{data.ourGlobalCited} citations</p>
                )}
              </td>
              {data.llmNames.map(llm => {
                const d = data.ourData[llm];
                const rate = d.totalPrompts > 0 ? Math.round((d.mentions / d.totalPrompts) * 100) : 0;
                return (
                  <td key={llm} className="border p-2 text-center">
                    <span className={`text-sm font-bold ${rate >= 50 ? 'text-green-600' : rate > 0 ? 'text-orange-500' : 'text-red-400'}`}>
                      {rate}%
                    </span>
                    <p className="text-[10px] text-muted-foreground">{d.mentions}/{d.totalPrompts}</p>
                  </td>
                );
              })}
            </tr>

            {/* Concurrents */}
            {visible.map((comp, i) => {
              const isAboveUs = comp.score > data.ourGlobalRate;
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
        <span>Score = taux moyen de citation par les LLMs.</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-6 rounded bg-red-50 border border-red-200" />
          Devant nous
        </span>
      </div>
    </div>
  );
}
