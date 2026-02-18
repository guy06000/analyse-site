import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium">{data.name}</p>
      <p className="text-sm text-muted-foreground">
        Taux de mention : <span className="font-medium">{data.taux_mention}%</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Mentions : <span className="font-medium">{data.nb_mentions}/{data.nb_prompts}</span>
      </p>
    </div>
  );
}

export function LlmComparisonBar({ scores }) {
  const barData = useMemo(() => {
    if (!scores?.length) return [];

    // Utiliser les scores du dernier scan
    const latestDate = scores[0]?.date;
    const latest = scores.filter((s) => s.date === latestDate);

    return latest
      .map((s) => ({
        name: s.llm_name,
        taux_mention: s.taux_mention || 0,
        nb_mentions: s.nb_mentions || 0,
        nb_prompts: s.nb_prompts || 0,
        color: getColor(s.llm_name),
      }))
      .sort((a, b) => b.taux_mention - a.taux_mention);
  }, [scores]);

  if (!barData.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Comparaison LLMs (dernier scan)</h3>
      <ResponsiveContainer width="100%" height={barData.length * 45 + 20}>
        <BarChart
          data={barData}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 10 }}
        >
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12 }}
            width={120}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="taux_mention" radius={[0, 4, 4, 0]} barSize={24}>
            {barData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
