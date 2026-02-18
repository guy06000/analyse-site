/**
 * Generateur d'actions concretes pour chaque type d'insight.
 * Retourne 2-4 actions specifiques basees sur le contexte.
 */

/**
 * Mapping fixId → check d'analyse correspondant.
 * Permet de detecter si un fix est deja applique en verifiant
 * le status du check dans les resultats d'analyse SEO/AI/i18n.
 */
const FIX_CHECK_MAP = {
  // SEO
  'seo-canonical': { type: 'seo', checkName: 'URL canonique' },
  'seo-open-graph': { type: 'seo', checkName: 'Open Graph' },
  'seo-twitter-card': { type: 'seo', checkName: 'Twitter Card' },
  'seo-json-ld': { type: 'seo', checkName: 'JSON-LD / Schema.org' },
  'seo-json-ld-geo': { type: 'seo', checkName: 'JSON-LD / Schema.org' },
  'geo-multisite-canonical': { type: 'seo', checkName: 'URL canonique' },
  'seo-meta-keywords': { type: 'seo', checkName: 'Meta keywords' },
  'seo-lazy-loading': { type: 'seo', checkName: 'Lazy loading des images' },
  // AI
  'robots-txt-ai': { type: 'ai', checkName: 'robots.txt' },
  'llms-txt': { type: 'ai', checkName: 'llms.txt' },
  'llms-full-txt': { type: 'ai', checkName: 'llms-full.txt' },
  'meta-author': { type: 'ai', checkName: 'Information auteur (E-E-A-T)' },
  'ai-date-publication': { type: 'ai', checkName: 'Date de publication' },
  // i18n
  'i18n-html-lang': { type: 'i18n', checkName: 'Attribut lang sur <html>' },
  'i18n-hreflang': { type: 'i18n', checkName: 'Balises hreflang' },
  'i18n-content-language': { type: 'i18n', checkName: 'Meta content-language' },
};

/**
 * Verifie si un fix Shopify est deja applique en consultant les resultats d'analyse.
 * @param {string} fixId - L'identifiant du fix
 * @param {object} analysisResults - Les resultats d'analyse { seo: {...}, ai: {...}, i18n: {...} }
 * @returns {boolean} true si le fix est deja en place (check correspondant en 'success')
 */
export function isFixApplied(fixId, analysisResults) {
  const mapping = FIX_CHECK_MAP[fixId];
  if (!mapping || !analysisResults) return false;

  const data = analysisResults[mapping.type];
  if (!data?.categories) return false;

  for (const cat of Object.values(data.categories)) {
    const check = cat.checks?.find((c) => c.name === mapping.checkName);
    if (check) return check.status === 'success';
  }
  return false;
}

/**
 * Retourne un resume des fixes appliques et non-appliques.
 * @param {object} analysisResults - Les resultats d'analyse
 * @returns {{ applied: string[], pending: string[] }}
 */
export function getFixStatusSummary(analysisResults) {
  const applied = [];
  const pending = [];
  for (const fixId of Object.keys(FIX_CHECK_MAP)) {
    if (isFixApplied(fixId, analysisResults)) {
      applied.push(fixId);
    } else {
      pending.push(fixId);
    }
  }
  return { applied, pending };
}

const LLM_TIPS = {
  'Perplexity Sonar': {
    strength: 'citations web',
    actions: [
      'Obtenir des backlinks depuis Reddit, forums specialises et blogs du secteur',
      'Publier des articles invites avec liens vers votre site',
      'Etre present sur les annuaires de niche (bijoux, formations)',
    ],
  },
  'Perplexity': {
    strength: 'citations web',
    actions: [
      'Obtenir des backlinks depuis Reddit, forums specialises et blogs du secteur',
      'Publier des articles invites avec liens vers votre site',
    ],
  },
  'Claude Sonnet': {
    strength: 'contenu long et detaille',
    actions: [
      'Creer des guides complets (2000+ mots) sur votre niche',
      'Ajouter des FAQ detaillees sur vos pages produits',
      'Publier du contenu expert avec des donnees chiffrees',
    ],
  },
  'Anthropic': {
    strength: 'contenu long et detaille',
    actions: [
      'Creer des guides complets (2000+ mots) sur votre niche',
      'Ajouter des FAQ detaillees sur vos pages produits',
    ],
  },
  'OpenAI GPT-4o': {
    strength: 'FAQ et listes structurees',
    actions: [
      'Ajouter une FAQ structuree avec schema.org FAQPage',
      'Creer des comparatifs produits bien structures',
      'Optimiser les meta descriptions avec des mots-cles de niche',
    ],
  },
  'OpenAI': {
    strength: 'FAQ et listes structurees',
    actions: [
      'Ajouter une FAQ structuree avec schema.org FAQPage',
      'Creer des comparatifs produits bien structures',
    ],
  },
  'Gemini Pro': {
    strength: 'donnees structurees Google',
    actions: [
      'Enrichir le JSON-LD (Organization, Product, LocalBusiness)',
      'Optimiser la fiche Google Business Profile',
      'Ajouter des donnees structurees sur chaque page produit',
    ],
  },
  'Gemini': {
    strength: 'donnees structurees Google',
    actions: [
      'Enrichir le JSON-LD (Organization, Product, LocalBusiness)',
      'Optimiser la fiche Google Business Profile',
    ],
  },
  'Grok': {
    strength: 'contenu social et tendances',
    actions: [
      'Etre actif sur X/Twitter avec du contenu de niche',
      'Publier des threads educatifs sur votre expertise',
    ],
  },
};

const THEMATIQUE_ACTIONS = {
  formation: [
    { label: 'Creer une page "Formation" optimisee', detail: 'Page dediee avec programme, tarifs, certifications, temoignages et schema.org Course', impact: 'fort' },
    { label: 'Publier des etudes de cas eleves', detail: 'Temoignages detailles avec avant/apres, duree de formation et resultats concrets', impact: 'moyen' },
  ],
  achat: [
    { label: 'Optimiser les fiches produits', detail: 'Descriptions detaillees avec specifications, prix, photos HD et avis clients verifies', impact: 'fort' },
    { label: 'Ajouter un guide d\'achat', detail: 'Comparatif des produits, guide de choix par usage et FAQ acheteur', impact: 'moyen' },
  ],
  fournisseur: [
    { label: 'Creer une page "Professionnel / B2B"', detail: 'Catalogue pro, conditions de vente en gros, MOQ et formulaire de contact pro', impact: 'fort' },
    { label: 'Lister vos certifications et partenariats', detail: 'Logos partenaires, certifications qualite, origine des produits', impact: 'moyen' },
  ],
  information: [
    { label: 'Creer un blog avec du contenu educatif', detail: 'Articles sur les tendances, techniques, entretien et actualites du secteur', impact: 'fort' },
    { label: 'Publier un glossaire du metier', detail: 'Definitions des termes techniques de votre niche pour capter le trafic informationnel', impact: 'moyen' },
  ],
};

/**
 * Genere des actions concretes pour un insight donne.
 * @param {string} type - Type d'insight
 * @param {object} context - Contexte de l'insight (llm, score, thematiques, etc.)
 * @returns {Array<{label: string, detail: string, fixId?: string, impact?: string}>}
 */
export function generateActions(type, context = {}) {
  const actions = [];

  switch (type) {
    case 'zero_visibility': {
      const llm = context.llm_name || '';
      const tips = LLM_TIPS[llm];
      if (tips) {
        actions.push({
          label: `Strategie specifique ${llm}`,
          detail: `${llm} privilegie ${tips.strength}. ${tips.actions[0]}.`,
          impact: 'fort',
        });
      }
      actions.push({
        label: 'Canonicaliser vers le domaine principal',
        detail: 'Forcer le canonical vers isisingold.com + hreflang cross-domaine.',
        fixId: 'geo-multisite-canonical',
        impact: 'fort',
      });
      actions.push({
        label: 'Generer un article blog expert (Claude IA)',
        detail: 'Creer du contenu long format optimise GEO pour capter la visibilite LLM.',
        fixId: 'geo-blog-content',
        impact: 'fort',
      });
      actions.push({
        label: 'Enrichir les donnees structurees JSON-LD',
        detail: 'Ajoutez Organization, Product et FAQPage pour etre mieux compris par les LLMs.',
        fixId: 'seo-json-ld',
        impact: 'moyen',
      });
      break;
    }

    case 'low_mention': {
      const llm = context.llm_name || '';
      const tips = LLM_TIPS[llm];
      if (tips && tips.actions.length > 1) {
        actions.push({
          label: `Ameliorer la visibilite sur ${llm}`,
          detail: tips.actions[1],
          impact: 'moyen',
        });
      }
      actions.push({
        label: 'Optimiser les meta SEO produits avec IA',
        detail: 'Generer meta titles, descriptions et tags optimises GEO pour vos produits.',
        fixId: 'geo-seo-content',
        impact: 'fort',
      });
      actions.push({
        label: 'Generer un article blog expert (Claude IA)',
        detail: 'Creer du contenu long format optimise GEO pour capter la visibilite LLM.',
        fixId: 'geo-blog-content',
        impact: 'fort',
      });
      actions.push({
        label: 'Augmenter la frequence de publication',
        detail: 'Publiez du contenu frais 1-2x/semaine sur les sujets ou vous etes absent.',
        impact: 'moyen',
      });
      break;
    }

    case 'dead_prompt': {
      const theme = context.thematique;
      const themeActions = THEMATIQUE_ACTIONS[theme];
      if (themeActions) {
        actions.push({ ...themeActions[0], impact: 'fort' });
      }
      actions.push({
        label: 'Optimiser les meta SEO produits avec IA',
        detail: 'Generer meta titles, descriptions et tags optimises GEO pour vos produits.',
        fixId: 'geo-seo-content',
        impact: 'fort',
      });
      actions.push({
        label: 'Generer un article blog expert (Claude IA)',
        detail: `Creer un article ciblant "${context.prompt_short || 'ce sujet'}" pour capter la visibilite.`,
        fixId: 'geo-blog-content',
        impact: 'fort',
      });
      if (context.competitors_cited?.length > 0) {
        const comps = context.competitors_cited.join(', ');
        actions.push({
          label: 'Analyser le contenu des concurrents cites',
          detail: `Les LLMs citent ${comps} a votre place. Analysez leur contenu et creez du contenu superieur.`,
          impact: 'fort',
        });
      }
      break;
    }

    case 'brand_no_url': {
      actions.push({
        label: 'Deployer llms.txt avec vos URLs',
        detail: 'Le fichier llms.txt indique aux LLMs les URLs de reference de votre marque.',
        fixId: 'llms-txt',
        impact: 'fort',
      });
      actions.push({
        label: 'Obtenir des backlinks de qualite',
        detail: 'Chaque backlink augmente la probabilite que les LLMs citent votre URL.',
        impact: 'fort',
      });
      actions.push({
        label: 'Enrichir les donnees structurees',
        detail: 'Ajoutez url et sameAs dans votre JSON-LD Organization.',
        fixId: 'seo-json-ld',
        impact: 'moyen',
      });
      break;
    }

    case 'no_citations': {
      actions.push({
        label: 'Deployer llms.txt',
        detail: 'Fichier essentiel pour que les LLMs referencent votre site dans leurs sources.',
        fixId: 'llms-txt',
        impact: 'fort',
      });
      actions.push({
        label: 'Ajouter JSON-LD complet',
        detail: 'Les donnees structurees aident les LLMs a identifier et citer votre site.',
        fixId: 'seo-json-ld',
        impact: 'fort',
      });
      actions.push({
        label: 'Verifier le sitemap XML',
        detail: 'Un sitemap a jour facilite l\'indexation par les crawlers IA.',
        impact: 'moyen',
      });
      break;
    }

    case 'competitor_ahead': {
      const comp = context.top_competitor || 'le concurrent';
      actions.push({
        label: 'Canonicaliser vers le domaine principal',
        detail: 'Forcer le canonical vers isisingold.com + hreflang cross-domaine.',
        fixId: 'geo-multisite-canonical',
        impact: 'fort',
      });
      actions.push({
        label: `Analyser le contenu de "${comp}"`,
        detail: `Identifiez les pages qui performent pour "${comp}" et creez du contenu equivalent ou superieur.`,
        impact: 'fort',
      });
      actions.push({
        label: 'Optimiser les meta SEO produits avec IA',
        detail: 'Generer meta titles, descriptions et tags optimises GEO pour vos produits.',
        fixId: 'geo-seo-content',
        impact: 'fort',
      });
      break;
    }

    case 'competitor_dominant': {
      const comp = context.dominant_competitor || 'le concurrent';
      const mentions = context.competitor_mentions || '?';
      actions.push({
        label: `Action urgente : rattraper "${comp}"`,
        detail: `"${comp}" a ${mentions} mentions alors que vous etes absent. Priorite maximale sur ce LLM.`,
        impact: 'fort',
      });
      actions.push({
        label: 'Deployer llms.txt + JSON-LD immediatement',
        detail: 'Ces actions techniques sont les plus rapides a mettre en place.',
        fixId: 'llms-txt',
        impact: 'fort',
      });
      const tips = LLM_TIPS[context.llm_name];
      if (tips) {
        actions.push({
          label: `Strategie ciblee ${context.llm_name}`,
          detail: tips.actions[0],
          impact: 'fort',
        });
      }
      break;
    }

    case 'declining': {
      actions.push({
        label: 'Verifier les changements recents',
        detail: 'Identifiez si un changement de contenu, de structure ou de backlinks a cause la baisse.',
        impact: 'fort',
      });
      actions.push({
        label: 'Publier du contenu frais',
        detail: 'Les LLMs favorisent le contenu recent. Mettez a jour vos pages cles.',
        impact: 'moyen',
      });
      break;
    }

    case 'rising': {
      actions.push({
        label: 'Maintenir le rythme actuel',
        detail: 'Votre strategie fonctionne sur ce LLM. Continuez les actions en cours.',
        impact: 'moyen',
      });
      actions.push({
        label: 'Repliquer sur les autres LLMs',
        detail: 'Analysez ce qui fonctionne ici et adaptez-le pour les LLMs ou vous etes moins visible.',
        impact: 'moyen',
      });
      break;
    }

    default:
      break;
  }

  return actions.slice(0, 4);
}

/**
 * Construit le payload de contexte pour l'agent GEO Advisor.
 * @param {object} insight - L'insight courant (type, context, message)
 * @param {Array} scores - Tous les scores du dernier scan
 * @param {Array} results - Tous les resultats du dernier scan
 * @returns {object} Payload complet pour l'agent IA
 */
export function buildGeoAdvisorContext(insight, scores, results) {
  const latestDate = scores?.[0]?.date;
  const latestScores = scores?.filter((s) => s.date === latestDate) || [];
  const latestResultDate = results?.[0]?.date_scan;
  const latestResults = results?.filter((r) => r.date_scan === latestResultDate) || [];

  const ctx = insight.context || {};
  const llmName = ctx.llm_name || '';

  // Resultats filtres pour ce LLM
  const llmResults = llmName
    ? latestResults.filter((r) => r.llm_name === llmName)
    : latestResults;

  // Thematique breakdown
  const thematiques = {};
  for (const r of llmResults) {
    const theme = r.thematique || 'autre';
    if (!thematiques[theme]) thematiques[theme] = { total: 0, mentions: 0 };
    thematiques[theme].total++;
    if (r.mention_detected === 'oui') thematiques[theme].mentions++;
  }
  for (const t of Object.values(thematiques)) {
    t.rate = t.total > 0 ? Math.round((t.mentions / t.total) * 100) : 0;
  }

  // Failed prompts (pas de mention)
  const failedPrompts = llmResults
    .filter((r) => r.mention_detected !== 'oui')
    .map((r) => ({
      question: r.prompt_question,
      thematique: r.thematique || 'autre',
      competitors_cited: parseCompetitors(r.competitors_mentioned),
      response_excerpt: (r.response_text || '').slice(0, 200),
    }));

  // Successful prompts
  const successfulPrompts = llmResults
    .filter((r) => r.mention_detected === 'oui')
    .map((r) => ({
      question: r.prompt_question,
      thematique: r.thematique || 'autre',
      mention_type: r.mention_type,
      mention_text: r.mention_exact_text || '',
    }));

  // Score data du LLM concerne
  const llmScore = latestScores.find((s) => s.llm_name === llmName) || {};
  let competitorsData = {};
  try {
    competitorsData = llmScore.competitors_data ? JSON.parse(llmScore.competitors_data) : {};
  } catch { /* ignore */ }

  // All scores summary
  const allScoresSummary = latestScores.map((s) => ({
    llm: s.llm_name,
    score: s.score_moyen,
    taux: s.taux_mention,
  }));

  return {
    insight_type: insight.type,
    insight_message: insight.message,
    brand_info: {
      name: 'ISIS n GOLD',
      sites: ['isisingold.com', 'goldy-isis.myshopify.com', 'strass-dentaires.fr'],
      niche: 'bijoux dentaires, strass dentaires, formations pose strass',
    },
    llm_concerned: llmName,
    score_data: {
      score_moyen: llmScore.score_moyen || 0,
      taux_mention: llmScore.taux_mention || 0,
      nb_mentions: llmScore.nb_mentions || 0,
      nb_prompts: llmScore.nb_prompts || 0,
      tendance: llmScore.tendance || 'stable',
      top_competitor: llmScore.top_competitor || '',
      competitors_data: competitorsData,
    },
    thematique_breakdown: thematiques,
    failed_prompts: failedPrompts.slice(0, 10),
    successful_prompts: successfulPrompts.slice(0, 10),
    all_scores_summary: allScoresSummary,
  };
}

function parseCompetitors(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { /* ignore */ }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
