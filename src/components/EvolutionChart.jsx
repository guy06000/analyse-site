import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

const LLM_COLORS = {
  'Perplexity Sonar': '#3B82F6',
  'Perplexity': '#3B82F6',
  'OpenAI GPT-4o': '#10B981',
  'OpenAI': '#10B981',
  'Claude Sonnet': '#F97316',
  'Anthropic': '#F97316',
  'Gemini Pro': '#8B5CF6',
  'Gemini': '#8B5CF6',
  'Grok': '#EF4444',
};

function getColor(llmName) {
  if (LLM_COLORS[llmName]) return LLM_COLORS[llmName];
  for (const [key, color] of Object.entries(LLM_COLORS)) {
    if (llmName.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#6B7280';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return dateStr;
}

function CustomTooltip({ active, payload, label, modifications }) {
  if (!active || !payload?.length) return null;
  const mods = (modifications || []).filter((m) => m.date === label);
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md max-w-xs">
      <p className="mb-1 text-sm font-medium">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium">{entry.value}/100</span>
        </div>
      ))}
      {mods.length > 0 && (
        <div className="mt-2 border-t pt-2">
          {mods.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="font-medium" style={{ color: m.color }}>{m.category}</span>
              <span className="text-muted-foreground truncate">{m.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_COLORS = {
  SEO: '#3B82F6',
  AI: '#F97316',
  GEO: '#8B5CF6',
  i18n: '#10B981',
  Blog: '#EC4899',
};

export function EvolutionChart({ scores, modifications }) {
  const { chartData, llmNames, singlePoint } = useMemo(() => {
    if (!scores?.length) return { chartData: [], llmNames: [], singlePoint: false };

    // Deduplication par (date, llm_name) — garder celui avec le plus grand nb_prompts
    const deduped = {};
    for (const s of scores) {
      const key = `${s.date}|${s.llm_name}`;
      if (!deduped[key] || (s.nb_prompts || 0) > (deduped[key].nb_prompts || 0)) {
        deduped[key] = s;
      }
    }

    // Grouper par date
    const byDate = {};
    const llmSet = new Set();
    for (const s of Object.values(deduped)) {
      if (!s.date || s.score_moyen == null) continue;
      if (!byDate[s.date]) byDate[s.date] = { date: formatDate(s.date), _rawDate: s.date };
      byDate[s.date][s.llm_name] = s.score_moyen;
      llmSet.add(s.llm_name);
    }

    // Trier chronologiquement
    const data = Object.values(byDate).sort((a, b) => a._rawDate.localeCompare(b._rawDate));
    // Supprimer le champ interne _rawDate
    data.forEach((d) => delete d._rawDate);

    return {
      chartData: data,
      llmNames: Array.from(llmSet),
      singlePoint: data.length === 1,
    };
  }, [scores]);

  // Préparer les marqueurs de modifications (convertir dates au format dd/MM du chart)
  const modMarkers = useMemo(() => {
    if (!modifications?.length || !chartData.length) return [];
    // Dates affichées dans le chart
    const chartDates = new Set(chartData.map((d) => d.date));
    return modifications.map((m) => {
      const formatted = formatDate(m.date);
      return {
        date: formatted,
        fixId: m.fix_id,
        category: m.category,
        description: m.description,
        color: CATEGORY_COLORS[m.category] || '#6B7280',
        isOnChart: chartDates.has(formatted),
      };
    });
  }, [modifications, chartData]);

  if (!chartData.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Aucune donnee de score disponible.
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Evolution des scores par LLM</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip modifications={modMarkers} />} />
          <Legend />
          {modMarkers.map((m, i) => (
            <ReferenceLine
              key={`mod-${i}`}
              x={m.date}
              stroke={m.color}
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: m.fixId,
                position: 'top',
                fontSize: 10,
                fill: m.color,
                angle: -45,
                offset: 10,
              }}
            />
          ))}
          {llmNames.map((name) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={getColor(name)}
              strokeWidth={2}
              dot={{ r: singlePoint ? 6 : 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {singlePoint && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Un seul scan disponible. Lancez d'autres scans pour voir l'evolution dans le temps.
        </p>
      )}
    </div>
  );
}
