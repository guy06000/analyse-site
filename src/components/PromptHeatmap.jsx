import { useMemo, useState } from 'react';

const LLM_SHORT_NAMES = {
  'Perplexity Sonar': 'Perpl.',
  'Perplexity': 'Perpl.',
  'OpenAI GPT-4o': 'OpenAI',
  'OpenAI': 'OpenAI',
  'Claude Sonnet': 'Claude',
  'Anthropic': 'Claude',
  'Gemini Pro': 'Gemini',
  'Gemini': 'Gemini',
  'Grok': 'Grok',
};

function getShortName(name) {
  return LLM_SHORT_NAMES[name] || name.slice(0, 8);
}

function truncate(str, max = 50) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export function PromptHeatmap({ results }) {
  const [tooltip, setTooltip] = useState(null);

  const { prompts, llms, matrix } = useMemo(() => {
    if (!results?.length) return { prompts: [], llms: [], matrix: {} };

    // Prendre uniquement le dernier scan
    const latestDate = results[0]?.date_scan;
    const latest = results.filter((r) => r.date_scan === latestDate);

    const promptSet = new Set();
    const llmSet = new Set();
    const matrix = {};

    for (const r of latest) {
      const prompt = r.prompt_question;
      const llm = r.llm_name;
      if (!prompt || !llm) continue;

      promptSet.add(prompt);
      llmSet.add(llm);

      if (!matrix[prompt]) matrix[prompt] = {};
      matrix[prompt][llm] = {
        detected: r.mention_detected,
        type: r.mention_type,
        text: r.mention_exact_text,
        context: r.mention_context,
      };
    }

    return {
      prompts: Array.from(promptSet),
      llms: Array.from(llmSet),
      matrix,
    };
  }, [results]);

  if (!prompts.length) return null;

  function getCellColor(cell) {
    if (!cell) return 'bg-gray-100 dark:bg-gray-800';
    if (cell.detected === 'oui') return 'bg-green-200 dark:bg-green-900';
    if (cell.type === 'erreur') return 'bg-gray-200 dark:bg-gray-700';
    return 'bg-red-100 dark:bg-red-950';
  }

  function getCellSymbol(cell) {
    if (!cell) return '';
    if (cell.detected === 'oui') return '\u2713';
    if (cell.type === 'erreur') return '?';
    return '\u2717';
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Matrice mentions : Prompts x LLMs</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 text-left text-xs font-medium text-muted-foreground bg-muted/30 min-w-[200px]">
                Prompt
              </th>
              {llms.map((llm) => (
                <th
                  key={llm}
                  className="border p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30 min-w-[70px]"
                >
                  {getShortName(llm)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompts.map((prompt) => (
              <tr key={prompt}>
                <td className="border p-2 text-xs" title={prompt}>
                  {truncate(prompt)}
                </td>
                {llms.map((llm) => {
                  const cell = matrix[prompt]?.[llm];
                  return (
                    <td
                      key={llm}
                      className={`border p-2 text-center cursor-default relative ${getCellColor(cell)}`}
                      onMouseEnter={(e) => {
                        if (!cell) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          llm,
                          prompt: truncate(prompt, 40),
                          ...cell,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="text-sm font-medium">
                        {getCellSymbol(cell)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legende */}
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-200 dark:bg-green-900" />
          Mentionne
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-100 dark:bg-red-950" />
          Non mentionne
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-gray-200 dark:bg-gray-700" />
          Erreur
        </span>
      </div>

      {/* Tooltip flottant */}
      {tooltip && (
        <div
          className="fixed z-50 rounded-lg border bg-background p-3 shadow-lg text-sm max-w-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-medium">{tooltip.llm}</p>
          <p className="text-xs text-muted-foreground">{tooltip.prompt}</p>
          {tooltip.type && tooltip.type !== 'none' && tooltip.type !== 'erreur' && (
            <p className="mt-1 text-xs">
              Type : <span className="font-medium">{tooltip.type}</span>
            </p>
          )}
          {tooltip.text && (
            <p className="mt-1 text-xs italic">
              &laquo; {tooltip.text} &raquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
