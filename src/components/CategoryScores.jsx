import { useMemo } from 'react';
import { GraduationCap, ShoppingCart, Truck, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const CATEGORIES = {
  formation: {
    label: 'Formation',
    icon: GraduationCap,
    bg: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-600',
    badgeBg: 'bg-blue-100 text-blue-800',
  },
  achat: {
    label: 'Achat produits',
    icon: ShoppingCart,
    bg: 'bg-emerald-50 border-emerald-200',
    iconColor: 'text-emerald-600',
    badgeBg: 'bg-emerald-100 text-emerald-800',
  },
  fournisseur: {
    label: 'Fournisseurs pro',
    icon: Truck,
    bg: 'bg-orange-50 border-orange-200',
    iconColor: 'text-orange-600',
    badgeBg: 'bg-orange-100 text-orange-800',
  },
  information: {
    label: 'Informations',
    icon: Info,
    bg: 'bg-purple-50 border-purple-200',
    iconColor: 'text-purple-600',
    badgeBg: 'bg-purple-100 text-purple-800',
  },
};

const LLM_COLORS = {
  Perplexity: 'bg-blue-100 text-blue-800',
  'Perplexity Sonar': 'bg-blue-100 text-blue-800',
  OpenAI: 'bg-emerald-100 text-emerald-800',
  'OpenAI GPT-4o': 'bg-emerald-100 text-emerald-800',
  Anthropic: 'bg-orange-100 text-orange-800',
  'Claude Sonnet': 'bg-orange-100 text-orange-800',
  Gemini: 'bg-purple-100 text-purple-800',
  'Gemini Pro': 'bg-purple-100 text-purple-800',
  Grok: 'bg-red-100 text-red-800',
};

function getProgressColor(rate) {
  if (rate >= 50) return '[&>div]:bg-green-500';
  if (rate >= 20) return '[&>div]:bg-orange-500';
  return '[&>div]:bg-red-500';
}

function getRateColor(rate) {
  if (rate >= 50) return 'text-green-600';
  if (rate >= 20) return 'text-orange-500';
  return 'text-red-500';
}

function getLlmBadgeClass(llmName) {
  if (LLM_COLORS[llmName]) return LLM_COLORS[llmName];
  for (const [key, cls] of Object.entries(LLM_COLORS)) {
    if (llmName.toLowerCase().includes(key.toLowerCase())) return cls;
  }
  return 'bg-gray-100 text-gray-800';
}

export function CategoryScores({ results }) {
  const { categoryData, detailByLlm, hasThematique } = useMemo(() => {
    if (!results?.length) {
      return { categoryData: {}, detailByLlm: {}, hasThematique: false };
    }

    // Verifier qu'au moins un resultat a le champ thematique
    const withThematique = results.filter((r) => r.thematique);
    if (withThematique.length === 0) {
      return { categoryData: {}, detailByLlm: {}, hasThematique: false };
    }

    // Filtrer sur le dernier scan
    const latestDate = results[0]?.date_scan;
    const latest = results.filter((r) => r.date_scan === latestDate);

    // Ne garder que les prompts generiques
    const generiques = latest.filter(
      (r) => r.type_prompt === 'generique' && r.thematique
    );

    if (generiques.length === 0) {
      return { categoryData: {}, detailByLlm: {}, hasThematique: true };
    }

    // Grouper par thematique
    const byCategory = {};
    // Grouper par thematique + LLM
    const byThemeLlm = {};

    for (const r of generiques) {
      const theme = r.thematique;

      // Aggregation globale par thematique
      if (!byCategory[theme]) {
        byCategory[theme] = { total: 0, mentions: 0 };
      }
      byCategory[theme].total++;
      if (r.mention_detected === 'oui') {
        byCategory[theme].mentions++;
      }

      // Aggregation par thematique + LLM
      const key = `${theme}__${r.llm_name}`;
      if (!byThemeLlm[key]) {
        byThemeLlm[key] = {
          thematique: theme,
          llm_name: r.llm_name,
          total: 0,
          mentions: 0,
        };
      }
      byThemeLlm[key].total++;
      if (r.mention_detected === 'oui') {
        byThemeLlm[key].mentions++;
      }
    }

    // Calculer les taux par categorie
    const catData = {};
    for (const [theme, info] of Object.entries(byCategory)) {
      catData[theme] = {
        ...info,
        rate: info.total > 0 ? Math.round((info.mentions / info.total) * 100) : 0,
      };
    }

    // Organiser le detail par thematique > LLM
    const detail = {};
    for (const entry of Object.values(byThemeLlm)) {
      if (!detail[entry.thematique]) {
        detail[entry.thematique] = [];
      }
      detail[entry.thematique].push({
        llm_name: entry.llm_name,
        total: entry.total,
        mentions: entry.mentions,
        rate:
          entry.total > 0
            ? Math.round((entry.mentions / entry.total) * 100)
            : 0,
      });
    }

    // Trier chaque theme par taux decroissant
    for (const theme of Object.keys(detail)) {
      detail[theme].sort((a, b) => b.rate - a.rate);
    }

    return { categoryData: catData, detailByLlm: detail, hasThematique: true };
  }, [results]);

  // Collecter tous les LLMs uniques pour le tableau
  const allLlms = useMemo(() => {
    const set = new Set();
    for (const entries of Object.values(detailByLlm)) {
      for (const e of entries) {
        set.add(e.llm_name);
      }
    }
    return Array.from(set).sort();
  }, [detailByLlm]);

  if (!hasThematique) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
        Aucune donnee thematique. Lancez un scan pour voir les scores par categorie.
      </div>
    );
  }

  const themeKeys = Object.keys(CATEGORIES);

  return (
    <div className="space-y-6">
      {/* Grille des 4 cards thematiques */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {themeKeys.map((key) => {
          const config = CATEGORIES[key];
          const data = categoryData[key];
          const Icon = config.icon;
          const rate = data?.rate ?? 0;
          const mentions = data?.mentions ?? 0;
          const total = data?.total ?? 0;

          return (
            <Card key={key} className={`${config.bg} py-4`}>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${config.iconColor}`} />
                  <span className="text-sm font-semibold">{config.label}</span>
                </div>

                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getRateColor(rate)}`}>
                    {rate}%
                  </span>
                </div>

                <Progress
                  value={rate}
                  className={`h-2 ${getProgressColor(rate)}`}
                />

                <p className="text-xs text-muted-foreground">
                  {mentions} mention{mentions > 1 ? 's' : ''} / {total} requete
                  {total > 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tableau de detail par thematique x LLM */}
      {allLlms.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">
            Detail par thematique et LLM
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    Thematique
                  </th>
                  {allLlms.map((llm) => (
                    <th key={llm} className="px-3 py-2.5 text-center">
                      <Badge className={`${getLlmBadgeClass(llm)} text-xs`}>
                        {llm.split(' ')[0]}
                      </Badge>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">
                    Global
                  </th>
                </tr>
              </thead>
              <tbody>
                {themeKeys.map((key) => {
                  const config = CATEGORIES[key];
                  const data = categoryData[key];
                  const llmEntries = detailByLlm[key] || [];
                  const Icon = config.icon;
                  const globalRate = data?.rate ?? 0;

                  return (
                    <tr key={key} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${config.iconColor}`}
                          />
                          <span className="font-medium">{config.label}</span>
                        </div>
                      </td>
                      {allLlms.map((llm) => {
                        const entry = llmEntries.find(
                          (e) => e.llm_name === llm
                        );
                        const rate = entry?.rate ?? null;

                        return (
                          <td key={llm} className="px-3 py-2.5 text-center">
                            {rate !== null ? (
                              <span
                                className={`font-medium ${getRateColor(rate)}`}
                              >
                                {rate}%
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {entry.mentions}/{entry.total}
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`text-lg font-bold ${getRateColor(globalRate)}`}
                        >
                          {globalRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
