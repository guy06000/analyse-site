import { useMemo } from 'react';
import { Heart } from 'lucide-react';

const SENTIMENT_COLORS = {
  positif: 'bg-green-400',
  neutre: 'bg-gray-300',
  negatif: 'bg-red-400',
  absent: 'bg-gray-100',
};

const SENTIMENT_LABELS = {
  positif: 'Positif',
  neutre: 'Neutre',
  negatif: 'Negatif',
  absent: 'Absent',
};

export function SentimentOverview({ results }) {
  const data = useMemo(() => {
    if (!results?.length) return null;

    const latestDate = results[0]?.date_scan;
    const latest = results.filter(r => r.date_scan === latestDate);

    const byLlm = {};
    for (const r of latest) {
      if (!r.llm_name) continue;
      if (!byLlm[r.llm_name]) byLlm[r.llm_name] = { positif: 0, neutre: 0, negatif: 0, absent: 0, total: 0 };
      const s = r.sentiment || 'absent';
      byLlm[r.llm_name][s] = (byLlm[r.llm_name][s] || 0) + 1;
      byLlm[r.llm_name].total++;
    }

    return Object.entries(byLlm).map(([llm, counts]) => ({
      llm,
      ...counts,
    }));
  }, [results]);

  if (!data?.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        Sentiment par LLM
      </h3>
      <div className="space-y-2">
        {data.map(item => (
          <div key={item.llm} className="flex items-center gap-3">
            <span className="text-xs w-28 shrink-0">{item.llm}</span>
            <div className="flex-1 flex h-5 rounded-full overflow-hidden">
              {['positif', 'neutre', 'negatif', 'absent'].map(s => {
                const pct = item.total > 0 ? (item[s] / item.total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={s}
                    className={`${SENTIMENT_COLORS[s]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${SENTIMENT_LABELS[s]}: ${item[s]}/${item.total}`}
                  />
                );
              })}
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{item.total}</span>
          </div>
        ))}
      </div>
      {/* Legende */}
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(SENTIMENT_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${SENTIMENT_COLORS[key]}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
