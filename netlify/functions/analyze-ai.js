import * as cheerio from 'cheerio';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { url } = JSON.parse(event.body);
    if (!url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL requise' }) };
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'AnalyseSite/1.0' },
      redirect: 'follow',
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    const shopifyStore = detectShopifyStore($, html);

    const results = {
      url,
      timestamp: new Date().toISOString(),
      isShopify: !!shopifyStore,
      shopifyStore: shopifyStore || null,
      categories: {
        crawlers: await analyzeCrawlers(baseUrl),
        fichiers: await analyzeFichiersIA(baseUrl),
        contenu: analyzeContenuIA($, response),
        citabilite: analyzeCitabilite($),
      },
    };

    results.score = calculateGlobalScore(results.categories);
    applyShopifyFixes(results);

    return { statusCode: 200, headers, body: JSON.stringify(results) };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Erreur lors de l'analyse : ${error.message}` }),
    };
  }
};

async function analyzeCrawlers(baseUrl) {
  const checks = [];
  const bots = [
    { name: 'GPTBot', agent: 'OpenAI/ChatGPT' },
    { name: 'OAI-SearchBot', agent: 'OpenAI Search' },
    { name: 'Google-Extended', agent: 'Google Gemini' },
    { name: 'ChatGPT-User', agent: 'ChatGPT Browse' },
    { name: 'PerplexityBot', agent: 'Perplexity' },
    { name: 'ClaudeBot', agent: 'Claude/Anthropic' },
    { name: 'Bytespider', agent: 'ByteDance' },
    { name: 'Amazonbot', agent: 'Amazon/Alexa' },
    { name: 'Applebot-Extended', agent: 'Apple Intelligence' },
    { name: 'meta-externalagent', agent: 'Meta AI' },
    { name: 'CCBot', agent: 'Common Crawl' },
    { name: 'cohere-ai', agent: 'Cohere' },
  ];

  let robotsContent = '';
  try {
    const res = await fetch(`${baseUrl.origin}/robots.txt`);
    if (res.ok) {
      robotsContent = await res.text();
    }
  } catch {
    // robots.txt inaccessible
  }

  if (!robotsContent) {
    checks.push({
      name: 'robots.txt',
      status: 'warning',
      value: 'Non trouvé',
      detail: 'Pas de robots.txt — tous les bots IA ont accès par défaut',
      recommendation: 'Créez un robots.txt pour contrôler l\'accès des bots IA',
    });
  } else {
    for (const bot of bots) {
      const lines = robotsContent.split('\n');
      let currentAgent = '';
      let isBlocked = false;
      let isMentioned = false;

      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.startsWith('user-agent:')) {
          currentAgent = trimmed.replace('user-agent:', '').trim();
        }
        if (currentAgent === bot.name.toLowerCase() || currentAgent === '*') {
          if (trimmed.startsWith('disallow:') && trimmed.replace('disallow:', '').trim() === '/') {
            if (currentAgent === bot.name.toLowerCase()) {
              isBlocked = true;
              isMentioned = true;
            }
          }
          if (currentAgent === bot.name.toLowerCase()) {
            isMentioned = true;
          }
        }
      }

      checks.push({
        name: `${bot.name} (${bot.agent})`,
        status: isBlocked ? 'error' : isMentioned ? 'success' : 'warning',
        value: isBlocked ? 'Bloqué' : isMentioned ? 'Autorisé' : 'Non mentionné',
        detail: isBlocked
          ? `${bot.name} est bloqué dans robots.txt`
          : isMentioned
            ? `${bot.name} est explicitement autorisé`
            : `${bot.name} non mentionné (autorisé par défaut)`,
        recommendation: isBlocked
          ? `Retirez le blocage de ${bot.name} si vous voulez être référencé par ${bot.agent}`
          : null,
      });
    }
  }

  return {
    name: 'Accessibilité aux crawlers IA',
    checks,
    score: calculateCategoryScore(checks),
  };
}

async function analyzeFichiersIA(baseUrl) {
  const checks = [];

  // llms.txt
  let llmsTxtStatus = 'error';
  let llmsTxtDetail = '';
  try {
    const res = await fetch(`${baseUrl.origin}/llms.txt`);
    if (res.ok) {
      const content = await res.text();
      llmsTxtStatus = 'success';
      llmsTxtDetail = `Trouvé (${content.length} car.)`;
    } else {
      llmsTxtDetail = 'Non trouvé';
    }
  } catch {
    llmsTxtDetail = 'Inaccessible';
  }
  checks.push({
    name: 'llms.txt',
    status: llmsTxtStatus,
    value: llmsTxtStatus === 'success' ? 'Présent' : 'Absent',
    detail: llmsTxtDetail,
    recommendation: llmsTxtStatus !== 'success'
      ? 'Créez un fichier llms.txt à la racine pour guider les LLM sur votre contenu'
      : null,
  });

  // llms-full.txt
  let llmsFullStatus = 'warning';
  let llmsFullDetail = '';
  try {
    const res = await fetch(`${baseUrl.origin}/llms-full.txt`);
    if (res.ok) {
      llmsFullStatus = 'success';
      llmsFullDetail = 'Trouvé';
    } else {
      llmsFullDetail = 'Non trouvé';
    }
  } catch {
    llmsFullDetail = 'Inaccessible';
  }
  checks.push({
    name: 'llms-full.txt',
    status: llmsFullStatus,
    value: llmsFullStatus === 'success' ? 'Présent' : 'Absent',
    detail: llmsFullDetail,
    recommendation: llmsFullStatus !== 'success'
      ? 'Créez llms-full.txt pour fournir un contenu détaillé aux LLM'
      : null,
  });

  // .well-known/ai-plugin.json
  let aiPluginStatus = 'warning';
  let aiPluginDetail = '';
  try {
    const res = await fetch(`${baseUrl.origin}/.well-known/ai-plugin.json`);
    if (res.ok) {
      aiPluginStatus = 'success';
      aiPluginDetail = 'Trouvé';
    } else {
      aiPluginDetail = 'Non trouvé';
    }
  } catch {
    aiPluginDetail = 'Inaccessible';
  }
  checks.push({
    name: 'ai-plugin.json',
    status: aiPluginStatus,
    value: aiPluginStatus === 'success' ? 'Présent' : 'Absent',
    detail: aiPluginDetail,
    recommendation: aiPluginStatus !== 'success'
      ? 'Créez .well-known/ai-plugin.json pour déclarer votre site comme plugin IA'
      : null,
  });

  return {
    name: 'Fichiers spécifiques IA',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeContenuIA($, response) {
  const checks = [];

  // Semantic HTML
  const semanticTags = ['article', 'section', 'nav', 'main', 'aside', 'header', 'footer'];
  const found = semanticTags.filter((tag) => $(tag).length > 0);
  checks.push({
    name: 'HTML sémantique',
    status: found.length >= 4 ? 'success' : found.length >= 2 ? 'warning' : 'error',
    value: `${found.length}/${semanticTags.length} balises`,
    detail: `Trouvées : ${found.join(', ') || 'aucune'}`,
    recommendation: found.length < 4
      ? `Utilisez les balises sémantiques : ${semanticTags.filter((t) => !found.includes(t)).join(', ')}`
      : null,
  });

  // Content without JS
  const noscript = $('noscript').length;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const hasContent = bodyText.length > 200;
  checks.push({
    name: 'Contenu sans JavaScript',
    status: hasContent ? 'success' : 'error',
    value: hasContent ? 'Accessible' : 'Dépend du JS',
    detail: hasContent
      ? `${bodyText.length} caractères de contenu accessible sans JS`
      : 'Le contenu principal nécessite JavaScript',
    recommendation: !hasContent
      ? 'Les IA ne rendent pas le JavaScript. Assurez-vous que le contenu est en HTML statique.'
      : null,
  });

  // Clear structure
  const h1 = $('h1').length;
  const h2 = $('h2').length;
  const paragraphs = $('p').length;
  const lists = $('ul, ol').length;
  const structureScore = (h1 > 0 ? 1 : 0) + (h2 > 0 ? 1 : 0) + (paragraphs > 2 ? 1 : 0) + (lists > 0 ? 1 : 0);
  checks.push({
    name: 'Structure claire du contenu',
    status: structureScore >= 3 ? 'success' : structureScore >= 2 ? 'warning' : 'error',
    value: `${structureScore}/4 critères`,
    detail: `H1: ${h1} | H2: ${h2} | Paragraphes: ${paragraphs} | Listes: ${lists}`,
    recommendation: structureScore < 3
      ? 'Structurez votre contenu avec des titres H2, des paragraphes et des listes'
      : null,
  });

  // FAQ schema
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let hasFaq = false;
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data['@type'] === 'FAQPage' || (data['@graph'] && data['@graph'].some((g) => g['@type'] === 'FAQPage'))) {
        hasFaq = true;
      }
    } catch {
      // JSON invalide
    }
  });
  checks.push({
    name: 'FAQ structurée',
    status: hasFaq ? 'success' : 'warning',
    value: hasFaq ? 'Présente' : 'Absente',
    detail: hasFaq ? 'Schema FAQPage détecté' : 'Pas de FAQ structurée (fortement recommandé pour les IA)',
    recommendation: !hasFaq
      ? 'Ajoutez une FAQ avec le schema FAQPage — les IA citent fréquemment les FAQ'
      : null,
  });

  // Last-Modified header (content freshness signal for AI crawlers)
  const lastModified = response.headers.get('last-modified');
  checks.push({
    name: 'Fraîcheur du contenu (Last-Modified)',
    status: lastModified ? 'success' : 'warning',
    value: lastModified || 'Absent',
    detail: lastModified
      ? `Dernière modification : ${lastModified}`
      : 'Pas de header Last-Modified — les IA ne peuvent pas évaluer la fraîcheur',
    recommendation: !lastModified
      ? 'Configurez le header Last-Modified pour indiquer la fraîcheur du contenu aux crawlers IA'
      : null,
  });

  // Content length optimization for AI indexing
  const allWords = bodyText.split(' ').filter((w) => w.length > 1);
  const wordCount = allWords.length;
  checks.push({
    name: 'Longueur optimale pour IA',
    status: wordCount >= 500 && wordCount <= 3000 ? 'success' : wordCount >= 200 ? 'warning' : 'error',
    value: `${wordCount} mots`,
    detail: wordCount < 200
      ? `${wordCount} mots — trop court pour que les IA indexent efficacement (min. 500)`
      : wordCount > 3000
        ? `${wordCount} mots — risque de troncature par les LLM (idéal : 500-3000)`
        : `${wordCount} mots — dans la plage optimale pour l'indexation IA (500-3000)`,
    recommendation: wordCount < 500
      ? 'Enrichissez le contenu (min. 500 mots) pour être correctement indexé par les IA'
      : wordCount > 3000
        ? 'Le contenu est long — structurez-le clairement pour éviter la troncature par les LLM'
        : null,
  });

  return {
    name: 'Qualité du contenu pour les IA',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeCitabilite($) {
  const checks = [];

  // Author info
  const hasAuthor = $('meta[name="author"]').length > 0
    || $('[rel="author"]').length > 0
    || $('[class*="author"]').length > 0
    || $('[itemprop="author"]').length > 0;
  checks.push({
    name: 'Information auteur (E-E-A-T)',
    status: hasAuthor ? 'success' : 'warning',
    value: hasAuthor ? 'Présente' : 'Absente',
    detail: hasAuthor ? 'Information d\'auteur détectée' : 'Pas d\'information auteur trouvée',
    recommendation: !hasAuthor
      ? 'Ajoutez des informations d\'auteur (meta author, schema Person) pour la crédibilité'
      : null,
  });

  // Publication date
  const hasDate = $('meta[property="article:published_time"]').length > 0
    || $('time[datetime]').length > 0
    || $('[itemprop="datePublished"]').length > 0
    || $('[class*="date"]').length > 0;
  checks.push({
    name: 'Date de publication',
    status: hasDate ? 'success' : 'warning',
    value: hasDate ? 'Présente' : 'Absente',
    detail: hasDate ? 'Date de publication détectée' : 'Pas de date de publication visible',
    recommendation: !hasDate
      ? 'Ajoutez une date de publication visible et en metadata pour la fraîcheur du contenu'
      : null,
  });

  // Unique content indicator
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const words = bodyText.split(' ').filter((w) => w.length > 3);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const diversityRatio = words.length > 0 ? uniqueWords.size / words.length : 0;
  checks.push({
    name: 'Richesse du vocabulaire',
    status: diversityRatio > 0.4 ? 'success' : diversityRatio > 0.25 ? 'warning' : 'error',
    value: `${(diversityRatio * 100).toFixed(0)}% de diversité`,
    detail: `${uniqueWords.size} mots uniques sur ${words.length} mots totaux`,
    recommendation: diversityRatio < 0.25
      ? 'Le contenu semble répétitif. Diversifiez le vocabulaire pour un contenu plus riche.'
      : null,
  });

  return {
    name: 'Citabilité',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function detectShopifyStore($, html) {
  // Method 1: Shopify.shop variable in scripts
  const shopMatch = html.match(/Shopify\.shop\s*=\s*["']([^"']+\.myshopify\.com)["']/);
  if (shopMatch) return shopMatch[1];

  // Method 2: meta tag
  const shopifyMeta = $('meta[name="shopify-checkout-api-token"]').length > 0
    || $('link[href*="cdn.shopify.com"]').length > 0
    || $('script[src*="cdn.shopify.com"]').length > 0;

  if (shopifyMeta) {
    // Try to extract from any myshopify reference
    const myshopifyMatch = html.match(/([a-z0-9-]+\.myshopify\.com)/i);
    if (myshopifyMatch) return myshopifyMatch[1];
    return 'detected'; // Shopify detected but store domain unknown
  }

  return null;
}

const FIX_ACTIONS = {
  'robots.txt': {
    id: 'robots-txt-ai',
    label: 'Corriger robots.txt',
    description: 'Ajouter les règles pour les bots IA dans robots.txt.liquid',
  },
  'llms.txt': {
    id: 'llms-txt',
    label: 'Créer llms.txt',
    description: 'Créer le fichier llms.txt et configurer le redirect',
  },
  'llms-full.txt': {
    id: 'llms-full-txt',
    label: 'Créer llms-full.txt',
    description: 'Créer le fichier llms-full.txt et configurer le redirect',
  },
  'Information auteur (E-E-A-T)': {
    id: 'meta-author',
    label: 'Ajouter meta author',
    description: 'Injecter <meta name="author"> dans theme.liquid',
  },
};

const SHOPIFY_FIXES = {
  'robots.txt': 'Shopify OS 2.0 : Modifier le code > Templates > robots.txt.liquid. Ajoutez/retirez les règles pour les bots IA.',
  'llms.txt': 'Créez un fichier llms.txt via Modifier le code > Assets > "Ajouter un nouvel asset". Puis ajoutez un redirect dans theme.liquid ou via une app de redirections.',
  'llms-full.txt': 'Même approche que llms.txt : ajoutez via Assets du thème, puis configurez un redirect.',
  'ai-plugin.json': 'Le dossier .well-known n\'est pas accessible sur Shopify. Alternative : utilisez un worker Cloudflare ou un sous-domaine proxy.',
  'HTML sémantique': 'Modifier le code > Remplacez les <div> par des balises sémantiques (<main>, <article>, <section>, <nav>) dans les templates Liquid.',
  'Contenu sans JavaScript': 'Shopify sert du HTML serveur par défaut. Évitez les apps/sections qui chargent du contenu uniquement via JS.',
  'Structure claire du contenu': 'Personnalisateur de thème : utilisez les sections appropriées. Éditeur de contenu : structurez avec H2, paragraphes, listes.',
  'FAQ structurée': 'Ajoutez une section FAQ dans le personnalisateur, puis incluez le schema FAQPage via un snippet Liquid. Ou app FAQ avec schema intégré (ex: "HelpCenter").',
  'Information auteur (E-E-A-T)': 'Modifier le code > theme.liquid > Ajoutez <meta name="author" content="Votre nom"> dans le <head>. Pour les blogs : Admin > Blog > configurez l\'auteur.',
  'Date de publication': 'Pour articles de blog : automatique. Pour pages : ajoutez <time datetime="..."> dans page.liquid ou utilisez un metafield date.',
  'Richesse du vocabulaire': 'Enrichissez le contenu de vos pages et descriptions produits. Diversifiez le vocabulaire, utilisez des synonymes.',
  'Fraîcheur du contenu (Last-Modified)': 'Shopify gère ce header automatiquement. Si absent, vérifiez votre proxy ou CDN (Cloudflare, etc.).',
  'Longueur optimale pour IA': 'Enrichissez les descriptions produits et pages via le personnalisateur de thème ou Admin > Pages/Produits.',
};

const BOT_FIX = 'Shopify OS 2.0 : Modifier le code > Templates > robots.txt.liquid. Modifiez les règles User-agent / Disallow pour ce bot IA.';

function applyShopifyFixes(results) {
  for (const category of Object.values(results.categories)) {
    for (const check of category.checks) {
      if (check.recommendation) {
        if (SHOPIFY_FIXES[check.name]) {
          check.shopifyFix = SHOPIFY_FIXES[check.name];
        } else if (/GPTBot|OAI-SearchBot|Google-Extended|ChatGPT|PerplexityBot|ClaudeBot|Bytespider|Amazonbot|Applebot|meta-externalagent|CCBot|cohere-ai/.test(check.name)) {
          check.shopifyFix = BOT_FIX;
        }

        // Add fixAction for automatable fixes
        if (FIX_ACTIONS[check.name]) {
          check.fixAction = FIX_ACTIONS[check.name];
        }
      }
    }
  }
}

function calculateCategoryScore(checks) {
  if (checks.length === 0) return 0;
  const scores = checks.map((c) => (c.status === 'success' ? 100 : c.status === 'warning' ? 50 : 0));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function calculateGlobalScore(categories) {
  const scores = Object.values(categories).map((c) => c.score);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
