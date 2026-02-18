import { useMemo, useState } from 'react';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function PromptPerformance({ results }) {
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    if (!results?.length) return [];

    const latestDate = results[0]?.date_scan;
    const latest = results.filter(r => r.date_scan === latestDate);

    const byPrompt = {};
    for (const r of latest) {
      if (!r.prompt_question) continue;
      if (!byPrompt[r.prompt_question]) {
        byPrompt[r.prompt_question] = { total: 0, mentions: 0, llms: {}, competitors: 0 };
      }
      byPrompt[r.prompt_question].total++;
      if (r.mention_detected === 'oui') byPrompt[r.prompt_question].mentions++;

      let comps = [];
      try {
        comps = r.competitors_mentioned ? JSON.parse(r.competitors_mentioned) : [];
      } catch { /* ignore */ }
      byPrompt[r.prompt_question].competitors += comps.length;

      byPrompt[r.prompt_question].llms[r.llm_name] = r.mention_detected === 'oui';
    }

    return Object.entries(byPrompt)
      .map(([question, info]) => ({
        question,
        total: info.total,
        mentions: info.mentions,
        rate: info.total > 0 ? Math.round((info.mentions / info.total) * 100) : 0,
        competitors: info.competitors,
        llms: info.llms,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [results]);

  if (!data.length) return null;

  const visible = showAll ? data : data.slice(0, 5);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        Performance par prompt
      </h3>
      <div className="space-y-2">
        {visible.map((item, i) => (
          <div key={i} className="rounded border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm flex-1">{item.question}</p>
              <div className="text-right shrink-0">
                <span className={`text-lg font-bold ${item.rate >= 50 ? 'text-green-600' : item.rate > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                  {item.rate}%
                </span>
                <p className="text-xs text-muted-foreground">{item.mentions}/{item.total} LLMs</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(item.llms).map(([llm, mentioned]) => (
                <Badge
                  key={llm}
                  variant={mentioned ? 'default' : 'outline'}
                  className={`text-xs ${mentioned ? 'bg-green-100 text-green-700' : 'text-muted-foreground'}`}
                >
                  {llm.split(' ')[0]}
                </Badge>
              ))}
              {item.competitors > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  {item.competitors} concurrent(s) cite(s)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {data.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAll ? 'Voir moins' : `Voir les ${data.length - 5} autres prompts`}
        </button>
      )}
    </div>
  );
}
