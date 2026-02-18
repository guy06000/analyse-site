import { useMemo } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Lightbulb } from 'lucide-react';

export function InsightsPanel({ scores, results }) {
  const insights = useMemo(() => {
    const list = [];
    if (!scores?.length) return list;

    // Dernier scan
    const latestDate = scores[0]?.date;
    const latestScores = scores.filter((s) => s.date === latestDate);

    // Resultats du dernier scan
    const latestResultDate = results?.[0]?.date_scan;
    const latestResults = results?.filter((r) => r.date_scan === latestResultDate) || [];

    // Regle 1 : LLM avec score 0
    for (const s of latestScores) {
      if (s.score_moyen === 0 || (s.nb_mentions === 0 && s.taux_mention === 0)) {
        list.push({
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
      const promptMentions = {};
      for (const r of latestResults) {
        if (!r.prompt_question) continue;
        if (!promptMentions[r.prompt_question]) {
          promptMentions[r.prompt_question] = false;
        }
        if (r.mention_detected === 'oui') {
          promptMentions[r.prompt_question] = true;
        }
      }
      for (const [prompt, mentioned] of Object.entries(promptMentions)) {
        if (!mentioned) {
          const short = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
          list.push({
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
          <div
            key={i}
            className={`flex items-start gap-3 rounded-lg border p-3 ${insight.bg}`}
          >
            <insight.icon className={`mt-0.5 h-4 w-4 shrink-0 ${insight.color}`} />
            <p className="text-sm">{insight.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
