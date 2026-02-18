import { useMemo } from 'react';
import { Trophy, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const LLM_COLORS = {
  'Perplexity Sonar': 'bg-blue-100 text-blue-800',
  'OpenAI GPT-4o': 'bg-emerald-100 text-emerald-800',
  'Claude Sonnet': 'bg-orange-100 text-orange-800',
  'Gemini Pro': 'bg-purple-100 text-purple-800',
  'Grok': 'bg-red-100 text-red-800',
};

function RankBadge({ rank }) {
  if (rank === 0) return <span className="text-xs text-muted-foreground">--</span>;
  if (rank === 1) return <span className="flex items-center gap-0.5 text-amber-500 font-bold"><Trophy className="h-3.5 w-3.5" />{rank}</span>;
  if (rank <= 3) return <span className="flex items-center gap-0.5 text-blue-500 font-semibold"><Medal className="h-3.5 w-3.5" />{rank}</span>;
  return <span className="text-sm text-muted-foreground">{rank}</span>;
}

export function CompetitorRanking({ scores }) {
  const data = useMemo(() => {
    if (!scores?.length) return null;

    const latestDate = scores[0]?.date;
    const latestScores = scores.filter(s => s.date === latestDate);

    const globalCompetitors = {};
    const perLlm = {};

    for (const s of latestScores) {
      let compData = {};
      try {
        compData = s.competitors_data ? JSON.parse(s.competitors_data) : {};
      } catch { /* ignore parse errors */ }
      perLlm[s.llm_name] = {
        ourRank: s.avg_brand_rank || 0,
        ourScore: s.score_moyen || 0,
        topCompetitor: s.top_competitor || '',
        competitors: compData,
      };

      for (const [name, info] of Object.entries(compData)) {
        if (!globalCompetitors[name]) globalCompetitors[name] = { totalMentions: 0, llms: {} };
        globalCompetitors[name].totalMentions += info.mentions || 0;
        globalCompetitors[name].llms[s.llm_name] = info.mentions || 0;
      }
    }

    const sorted = Object.entries(globalCompetitors)
      .sort((a, b) => b[1].totalMentions - a[1].totalMentions)
      .slice(0, 10);

    const llmNames = latestScores.map(s => s.llm_name);

    return { sorted, llmNames, perLlm, latestDate };
  }, [scores]);

  if (!data || !data.sorted.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        Classement concurrentiel
      </h3>

      {/* Notre position resume */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.llmNames.map(llm => {
          const info = data.perLlm[llm];
          const color = LLM_COLORS[llm] || 'bg-gray-100 text-gray-800';
          return (
            <div key={llm} className="rounded-lg border p-3 text-center">
              <Badge className={`${color} text-xs mb-2`}>{llm}</Badge>
              <div className="flex items-center justify-center gap-1">
                <RankBadge rank={Math.round(info.ourRank)} />
                <span className="text-xs text-muted-foreground">
                  /{Object.keys(info.competitors).length + (info.ourRank > 0 ? 1 : 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tableau des concurrents */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 text-left text-xs font-medium text-muted-foreground bg-muted/30">
                Concurrent
              </th>
              <th className="border p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30">
                Total
              </th>
              {data.llmNames.map(llm => (
                <th key={llm} className="border p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30 min-w-[60px]">
                  {llm.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Notre marque en premier (surlignee) */}
            <tr className="bg-primary/5 font-medium">
              <td className="border p-2 text-xs">ISIS n GOLD (nous)</td>
              <td className="border p-2 text-center text-xs">
                {data.llmNames.reduce((sum, llm) => sum + (data.perLlm[llm].ourRank > 0 ? 1 : 0), 0)}
              </td>
              {data.llmNames.map(llm => (
                <td key={llm} className="border p-2 text-center">
                  <RankBadge rank={Math.round(data.perLlm[llm].ourRank)} />
                </td>
              ))}
            </tr>
            {/* Concurrents */}
            {data.sorted.map(([name, info]) => (
              <tr key={name}>
                <td className="border p-2 text-xs capitalize">{name}</td>
                <td className="border p-2 text-center text-xs font-medium">{info.totalMentions}</td>
                {data.llmNames.map(llm => (
                  <td key={llm} className="border p-2 text-center text-xs">
                    {info.llms[llm] || <span className="text-muted-foreground">--</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
