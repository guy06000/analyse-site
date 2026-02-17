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
    // Parse all rules from robots.txt for display
    const robotsLines = robotsContent.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));

    for (const bot of bots) {
      const lines = robotsContent.split('\n');
      let currentAgent = '';
      let isBlocked = false;
      let isMentioned = false;
      const relevantRules = [];

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
            if (trimmed.startsWith('allow:') || trimmed.startsWith('disallow:')) {
              relevantRules.push(line.trim());
            }
          }
        }
      }

      // Build detailList showing robots.txt rules for this bot
      const botDetailList = [];
      if (isMentioned && relevantRules.length > 0) {
        botDetailList.push(...relevantRules.map((r) => `robots.txt : ${r}`));
      } else if (!isMentioned) {
        botDetailList.push(`Aucune règle spécifique pour ${bot.name} dans robots.txt`);
        botDetailList.push('Le bot suit les règles User-agent: * (accès par défaut)');
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
        detailList: botDetailList.length > 0 ? botDetailList : undefined,
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
  let llmsTxtContent = '';
  try {
    const res = await fetch(`${baseUrl.origin}/llms.txt`);
    if (res.ok) {
      llmsTxtContent = await res.text();
      llmsTxtStatus = 'success';
      llmsTxtDetail = `Trouvé (${llmsTxtContent.length} car.)`;
    } else {
      llmsTxtDetail = 'Non trouvé';
    }
  } catch {
    llmsTxtDetail = 'Inaccessible';
  }
  // Preview lines of llms.txt
  const llmsTxtPreview = llmsTxtContent
    ? llmsTxtContent.split('\n').filter((l) => l.trim()).slice(0, 15).map((l) => l.length > 100 ? l.slice(0, 100) + '...' : l)
    : undefined;

  checks.push({
    name: 'llms.txt',
    status: llmsTxtStatus,
    value: llmsTxtStatus === 'success' ? 'Présent' : 'Absent',
    detail: llmsTxtDetail,
    recommendation: llmsTxtStatus !== 'success'
      ? 'Créez un fichier llms.txt à la racine pour guider les LLM sur votre contenu'
      : null,
    detailList: llmsTxtPreview,
  });

  // llms-full.txt
  let llmsFullStatus = 'warning';
  let llmsFullDetail = '';
  let llmsFullContent = '';
  try {
    const res = await fetch(`${baseUrl.origin}/llms-full.txt`);
    if (res.ok) {
      llmsFullContent = await res.text();
      llmsFullStatus = 'success';
      llmsFullDetail = `Trouvé (${llmsFullContent.length} car.)`;
    } else {
      llmsFullDetail = 'Non trouvé';
    }
  } catch {
    llmsFullDetail = 'Inaccessible';
  }
  const llmsFullPreview = llmsFullContent
    ? llmsFullContent.split('\n').filter((l) => l.trim()).slice(0, 15).map((l) => l.length > 100 ? l.slice(0, 100) + '...' : l)
    : undefined;

  checks.push({
    name: 'llms-full.txt',
    status: llmsFullStatus,
    value: llmsFullStatus === 'success' ? 'Présent' : 'Absent',
    detail: llmsFullDetail,
    recommendation: llmsFullStatus !== 'success'
      ? 'Créez llms-full.txt pour fournir un contenu détaillé aux LLM'
      : null,
    detailList: llmsFullPreview,
  });

  // ai-plugin.json (check .well-known/ and root fallback)
  let aiPluginStatus = 'warning';
  let aiPluginDetail = '';
  let aiPluginLocation = '';
  try {
    // Try .well-known first (standard path)
    const res = await fetch(`${baseUrl.origin}/.well-known/ai-plugin.json`);
    if (res.ok) {
      aiPluginStatus = 'success';
      aiPluginLocation = '/.well-known/ai-plugin.json';
    }
  } catch {
    // ignore
  }
  if (aiPluginStatus !== 'success') {
    try {
      // Fallback: check /ai-plugin.json (Shopify ne supporte pas .well-known)
      const res2 = await fetch(`${baseUrl.origin}/ai-plugin.json`);
      if (res2.ok) {
        aiPluginStatus = 'success';
        aiPluginLocation = '/ai-plugin.json';
      }
    } catch {
      // ignore
    }
  }
  aiPluginDetail = aiPluginStatus === 'success'
    ? `Trouvé à ${aiPluginLocation}`
    : 'Non trouvé (ni /.well-known/ai-plugin.json ni /ai-plugin.json)';

  checks.push({
    name: 'ai-plugin.json',
    status: aiPluginStatus,
    value: aiPluginStatus === 'success' ? 'Présent' : 'Absent',
    detail: aiPluginDetail,
    recommendation: aiPluginStatus !== 'success'
      ? 'Créez ai-plugin.json pour déclarer votre site comme plugin IA (sur Shopify : accessible via /ai-plugin.json car .well-known est bloqué)'
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

  // Semantic HTML — deep analysis
  const semanticTags = [
    { tag: 'main', role: 'Contenu principal', impact: 'critique', fix: 'Enveloppez le contenu principal dans <main> — les IA l\'utilisent pour identifier le contenu à indexer' },
    { tag: 'header', role: 'En-tête de page', impact: 'important', fix: 'Ajoutez <header> autour du logo et navigation — aide les IA à ignorer cette zone répétitive' },
    { tag: 'footer', role: 'Pied de page', impact: 'important', fix: 'Ajoutez <footer> autour des liens légaux et infos contact — les IA savent ignorer cette zone' },
    { tag: 'nav', role: 'Navigation', impact: 'important', fix: 'Enveloppez les menus dans <nav> — les IA distinguent navigation et contenu' },
    { tag: 'article', role: 'Contenu autonome', impact: 'moyen', fix: 'Utilisez <article> pour produits, articles de blog — indique un contenu citable indépendamment' },
    { tag: 'section', role: 'Section thématique', impact: 'moyen', fix: 'Regroupez le contenu par thème dans <section> avec un titre H2' },
    { tag: 'aside', role: 'Contenu secondaire', impact: 'faible', fix: 'Utilisez <aside> pour les barres latérales, produits recommandés — les IA savent que c\'est secondaire' },
  ];

  const foundTags = [];
  const missingTags = [];
  for (const t of semanticTags) {
    const count = $(t.tag).length;
    if (count > 0) {
      foundTags.push({ ...t, count });
    } else {
      missingTags.push(t);
    }
  }

  // Count divs to show ratio
  const divCount = $('div').length;
  const semanticCount = foundTags.reduce((sum, t) => sum + t.count, 0);
  const ratio = divCount > 0 ? ((semanticCount / (semanticCount + divCount)) * 100).toFixed(0) : 0;

  let semanticDetail = `${foundTags.length}/${semanticTags.length} balises sémantiques — ratio sémantique/div : ${ratio}% (${semanticCount} sémantiques vs ${divCount} div)`;
  if (foundTags.length > 0) {
    semanticDetail += `\n✓ Présentes : ${foundTags.map((t) => `<${t.tag}> ×${t.count}`).join(', ')}`;
  }
  if (missingTags.length > 0) {
    semanticDetail += `\n✗ Manquantes : ${missingTags.map((t) => `<${t.tag}>`).join(', ')}`;
  }

  let semanticReco = null;
  if (missingTags.length > 0) {
    const critiques = missingTags.filter((t) => t.impact === 'critique');
    const importants = missingTags.filter((t) => t.impact === 'important');
    const moyens = missingTags.filter((t) => t.impact === 'moyen' || t.impact === 'faible');

    const lines = [];
    lines.push(`🏗️ ${missingTags.length} balise(s) sémantique(s) manquante(s) — les IA utilisent ces balises pour comprendre la structure de votre page`);

    if (critiques.length > 0) {
      lines.push(`\n🔴 Priorité critique :`);
      for (const t of critiques) {
        lines.push(`  • <${t.tag}> (${t.role}) : ${t.fix}`);
      }
    }
    if (importants.length > 0) {
      lines.push(`\n🟠 Priorité importante :`);
      for (const t of importants) {
        lines.push(`  • <${t.tag}> (${t.role}) : ${t.fix}`);
      }
    }
    if (moyens.length > 0) {
      lines.push(`\n🟡 Améliorations :`);
      for (const t of moyens) {
        lines.push(`  • <${t.tag}> (${t.role}) : ${t.fix}`);
      }
    }

    if (divCount > 20 && ratio < 15) {
      lines.push(`\n⚠️ Ratio sémantique très faible (${ratio}%) — votre page utilise ${divCount} <div> pour seulement ${semanticCount} balises sémantiques. Les IA ont du mal à distinguer le contenu important du reste.`);
    }

    lines.push(`\n💡 Impact IA : GPTBot, ClaudeBot et PerplexityBot extraient le contenu de <main> et <article> en priorité. Sans ces balises, ils indexent tout le HTML y compris menus et footers, ce qui dilue votre contenu.`);

    semanticReco = lines.join('\n');
  }

  // Build detailList for visual breakdown
  const semanticDetailList = semanticTags.map((t) => {
    const count = $(t.tag).length;
    const icon = count > 0 ? '✓' : '✗';
    const status = count > 0 ? `×${count}` : `MANQUANT (${t.impact})`;
    return `${icon} <${t.tag}> — ${t.role} — ${status}`;
  });

  checks.push({
    name: 'HTML sémantique',
    status: foundTags.length >= 5 ? 'success' : foundTags.length >= 3 ? 'warning' : 'error',
    value: `${foundTags.length}/${semanticTags.length} balises`,
    detail: semanticDetail,
    recommendation: semanticReco,
    detailList: semanticDetailList,
  });

  // Content without JS — detailed analysis
  const noscript = $('noscript').length;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const hasContent = bodyText.length > 200;
  const scriptCount = $('script').length;
  const inlineScripts = $('script:not([src])').length;
  const externalScripts = $('script[src]').length;

  // Detect JS-dependent content patterns
  const jsPatterns = [];
  const lazyImages = $('img[data-src], img[loading="lazy"]').length;
  const totalImages = $('img').length;
  if (lazyImages > 0) jsPatterns.push(`${lazyImages}/${totalImages} images en lazy-load`);
  const jsApps = $('[id="app"], [id="root"], [data-react-root], [ng-app], [data-vue-app]').length;
  if (jsApps > 0) jsPatterns.push('Framework JS détecté (React/Vue/Angular)');
  const dynamicSections = $('[data-section-type], [data-shopify]').length;
  if (dynamicSections > 0) jsPatterns.push(`${dynamicSections} sections Shopify dynamiques`);

  let jsDetail = hasContent
    ? `${bodyText.length} caractères accessibles sans JS — ${scriptCount} scripts (${inlineScripts} inline, ${externalScripts} externes)`
    : `Le contenu principal nécessite JavaScript — ${scriptCount} scripts détectés`;
  if (jsPatterns.length > 0) {
    jsDetail += `\nDétections : ${jsPatterns.join(' | ')}`;
  }

  let jsReco = null;
  if (!hasContent) {
    jsReco = `🚨 Les crawlers IA (GPTBot, ClaudeBot, Bytespider) ne rendent PAS le JavaScript — votre contenu est invisible pour eux.\n→ Shopify : vérifiez que votre thème utilise du Liquid côté serveur et non une app SPA\n→ Apps tierces : certaines apps injectent du contenu uniquement en JS (avis, FAQ dynamiques) — ces contenus sont invisibles pour les IA\n→ Testez : curl ${response.url} | les IA voient uniquement ce que curl retourne`;
  } else if (bodyText.length < 500) {
    jsReco = `⚠️ Contenu HTML statique faible (${bodyText.length} car.) — les IA n'indexeront que ce texte.\n→ Vérifiez que les descriptions produits et textes importants sont dans le HTML, pas chargés en JS\n→ Apps qui masquent du contenu : avis clients, onglets dynamiques, accordéons JS-only`;
  }

  // Build detailList for JS analysis
  const jsDetailList = [];
  jsDetailList.push(`📄 Contenu HTML statique : ${bodyText.length} caractères`);
  jsDetailList.push(`📜 Scripts total : ${scriptCount} (${inlineScripts} inline, ${externalScripts} externes)`);
  if (lazyImages > 0) jsDetailList.push(`🖼️ Images lazy-load : ${lazyImages}/${totalImages}`);
  if (jsApps > 0) jsDetailList.push(`⚠️ Framework JS (SPA) détecté — contenu potentiellement invisible aux IA`);
  if (dynamicSections > 0) jsDetailList.push(`🔧 ${dynamicSections} sections Shopify dynamiques`);
  if (noscript > 0) jsDetailList.push(`📋 ${noscript} balise(s) <noscript> trouvée(s)`);
  // Show top external scripts
  const extScripts = $('script[src]').map((_, el) => $(el).attr('src')).get().slice(0, 8);
  for (const src of extScripts) {
    const short = src.length > 80 ? '...' + src.slice(-70) : src;
    jsDetailList.push(`  → ${short}`);
  }

  checks.push({
    name: 'Contenu sans JavaScript',
    status: hasContent ? (bodyText.length > 500 ? 'success' : 'warning') : 'error',
    value: hasContent ? `${bodyText.length} car.` : 'Dépend du JS',
    detail: jsDetail,
    recommendation: jsReco,
    detailList: jsDetailList,
  });

  // Clear structure — deep heading & content analysis
  const h1 = $('h1').length;
  const h1Texts = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2 = $('h2').length;
  const h2Texts = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3 = $('h3').length;
  const h3Texts = $('h3').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const paragraphs = $('p').length;
  const lists = $('ul, ol').length;
  const tables = $('table').length;
  const images = $('img').length;
  const imagesWithAlt = $('img[alt]').filter((_, el) => $(el).attr('alt')?.trim()).length;

  // Heading hierarchy check
  const hasH1 = h1 > 0;
  const hasH2 = h2 > 0;
  const hasH3 = h3 > 0;
  const multipleH1 = h1 > 1;
  const hasGoodHierarchy = hasH1 && hasH2 && !multipleH1;

  // Paragraph analysis
  const pTexts = $('p').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const avgPLength = pTexts.length > 0 ? Math.round(pTexts.reduce((sum, t) => sum + t.length, 0) / pTexts.length) : 0;
  const shortP = pTexts.filter((t) => t.length < 30).length;
  const longP = pTexts.filter((t) => t.length > 500).length;

  // Score 0-7 critères
  const criteria = [
    { name: 'H1 unique', ok: hasH1 && !multipleH1, detail: multipleH1 ? `${h1} H1 trouvés (1 seul recommandé)` : hasH1 ? `"${h1Texts[0]?.slice(0, 60)}"` : 'Aucun H1' },
    { name: 'Sous-titres H2', ok: h2 >= 2, detail: h2 > 0 ? `${h2} H2 : ${h2Texts.slice(0, 3).map((t) => `"${t.slice(0, 40)}"`).join(', ')}${h2 > 3 ? '...' : ''}` : 'Aucun H2 — les IA structurent par H2' },
    { name: 'Hiérarchie H1→H2→H3', ok: hasGoodHierarchy, detail: `H1:${h1} → H2:${h2} → H3:${h3}` },
    { name: 'Paragraphes (>5)', ok: paragraphs > 5, detail: `${paragraphs} paragraphes, longueur moyenne ${avgPLength} car.` },
    { name: 'Paragraphes équilibrés', ok: shortP < paragraphs * 0.3 && longP < paragraphs * 0.2, detail: `${shortP} trop courts (<30 car.) | ${longP} trop longs (>500 car.)` },
    { name: 'Listes', ok: lists > 0, detail: lists > 0 ? `${lists} liste(s)` : 'Aucune liste — utile pour les IA (étapes, caractéristiques)' },
    { name: 'Images avec alt', ok: images > 0 && imagesWithAlt === images, detail: images > 0 ? `${imagesWithAlt}/${images} images avec alt` : 'Aucune image' },
  ];

  const okCount = criteria.filter((c) => c.ok).length;

  let structDetail = `${okCount}/${criteria.length} critères validés`;

  let structReco = null;
  const failing = criteria.filter((c) => !c.ok);
  if (failing.length > 0) {
    const lines = [];
    lines.push(`📋 ${failing.length} point(s) à améliorer pour la lisibilité IA :`);

    for (const c of failing) {
      lines.push(`\n  ✗ ${c.name} : ${c.detail}`);
    }

    if (multipleH1) {
      lines.push(`\n⚠️ Plusieurs H1 détectés — les IA ne savent pas quel est le titre principal. Gardez 1 seul H1 par page.`);
      lines.push(`  Shopify : Personnalisateur > vérifiez que seul le nom du produit/page est en H1`);
    }

    if (h2 < 2) {
      lines.push(`\n📝 Ajoutez des H2 pour structurer le contenu — les LLM extraient le contenu section par section en se basant sur les H2.`);
      lines.push(`  Shopify : Admin > Pages/Produits > dans l'éditeur, utilisez "Heading 2" pour les sous-titres`);
    }

    if (avgPLength > 400) {
      lines.push(`\n✂️ Paragraphes trop longs (moy. ${avgPLength} car.) — les IA tronquent les paragraphes >300 caractères. Découpez en blocs plus courts.`);
    }

    if (lists === 0) {
      lines.push(`\n📋 Ajoutez des listes à puces pour les caractéristiques produits, étapes, avantages — les IA les extraient facilement et les reformulent en réponses.`);
    }

    lines.push(`\n💡 Structure idéale pour les IA : H1 (titre) → paragraphe intro → H2 (section) → paragraphe court → liste à puces → H2 (section suivante)...`);

    structReco = lines.join('\n');
  }

  // Build detailList
  const structDetailList = criteria.map((c) => `${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`);

  checks.push({
    name: 'Structure claire du contenu',
    status: okCount >= 5 ? 'success' : okCount >= 3 ? 'warning' : 'error',
    value: `${okCount}/${criteria.length} critères`,
    detail: structDetail,
    recommendation: structReco,
    detailList: structDetailList,
  });

  // FAQ schema — detailed analysis
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let hasFaq = false;
  const schemasFound = [];
  const faqQuestions = [];
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const type = data['@type'];
      if (type) schemasFound.push(type);
      if (type === 'FAQPage') {
        hasFaq = true;
        if (data.mainEntity) {
          for (const q of data.mainEntity.slice(0, 10)) {
            faqQuestions.push(`Q: ${q.name}`);
          }
        }
      }
      if (data['@graph']) {
        for (const g of data['@graph']) {
          if (g['@type']) schemasFound.push(g['@type']);
          if (g['@type'] === 'FAQPage') {
            hasFaq = true;
            if (g.mainEntity) {
              for (const q of g.mainEntity.slice(0, 10)) {
                faqQuestions.push(`Q: ${q.name}`);
              }
            }
          }
        }
      }
    } catch {
      // JSON invalide
    }
  });

  // Build detailList
  const faqDetailList = [];
  if (schemasFound.length > 0) {
    faqDetailList.push(`📋 Schemas JSON-LD trouvés : ${[...new Set(schemasFound)].join(', ')}`);
  } else {
    faqDetailList.push('✗ Aucun schema JSON-LD détecté sur la page');
  }
  if (hasFaq && faqQuestions.length > 0) {
    faqDetailList.push(`✓ FAQPage avec ${faqQuestions.length} question(s) :`);
    faqDetailList.push(...faqQuestions);
  } else if (!hasFaq) {
    faqDetailList.push('✗ Schema FAQPage absent — les IA (ChatGPT, Perplexity) extraient les FAQ en priorité');
    faqDetailList.push('💡 Une FAQ de 4-5 questions pertinentes augmente significativement les citations IA');
  }

  checks.push({
    name: 'FAQ structurée',
    status: hasFaq ? 'success' : 'warning',
    value: hasFaq ? 'Présente' : 'Absente',
    detail: hasFaq ? `Schema FAQPage détecté (${faqQuestions.length} questions)` : 'Pas de FAQ structurée (fortement recommandé pour les IA)',
    recommendation: !hasFaq
      ? 'Ajoutez une FAQ avec le schema FAQPage — les IA citent fréquemment les FAQ'
      : null,
    detailList: faqDetailList,
  });

  // Last-Modified header (content freshness signal for AI crawlers)
  const lastModified = response.headers.get('last-modified');
  const cacheControl = response.headers.get('cache-control') || '';
  const age = response.headers.get('age') || '';
  const server = response.headers.get('server') || '';
  const via = response.headers.get('via') || '';
  const cfRay = response.headers.get('cf-ray') || '';

  // Detect CDN/proxy
  const cdnName = cfRay ? 'Cloudflare' : via.includes('cloudfront') ? 'CloudFront' : server.includes('nginx') ? 'Nginx (proxy)' : '';

  let freshDetail, freshRecommendation;
  if (lastModified) {
    const modDate = new Date(lastModified);
    const daysAgo = Math.floor((Date.now() - modDate.getTime()) / (1000 * 60 * 60 * 24));
    freshDetail = `Dernière modification : ${lastModified} (il y a ${daysAgo} jour${daysAgo > 1 ? 's' : ''})`;
    if (daysAgo > 90) {
      freshRecommendation = `Contenu non mis à jour depuis ${daysAgo} jours. Les IA favorisent le contenu frais — mettez à jour vos descriptions produits et pages régulièrement.`;
    }
  } else {
    freshDetail = `Header Last-Modified absent${cdnName ? ` — CDN détecté : ${cdnName}` : ''}. Les crawlers IA (GPTBot, ClaudeBot, PerplexityBot) utilisent ce header pour prioriser le contenu récent.`;
    freshRecommendation = cdnName
      ? `Votre site passe par ${cdnName} qui peut masquer le header Last-Modified.\n→ ${cdnName === 'Cloudflare' ? 'Cloudflare : Règles > Cache > désactiver "Override origin cache control" ou ajouter une Rule pour transmettre Last-Modified' : 'Vérifiez la configuration de votre CDN pour transmettre les headers d\'origine'}\n→ Alternative Shopify : le header est normalement fourni par défaut. Si absent, vérifiez qu\'aucune app de cache (Booster, Hyperspeed) ne le supprime.\n→ Impact IA : sans Last-Modified, les bots IA ne savent pas si votre contenu est récent et peuvent le déprioriser face à un concurrent qui l\'affiche.`
      : `Shopify envoie normalement Last-Modified. Causes possibles :\n→ App de cache/optimisation qui supprime le header (Booster, Hyperspeed, etc.) — désactivez temporairement pour tester\n→ Proxy ou CDN intermédiaire qui filtre les headers\n→ Page dynamique sans date de modification fixe\n→ Impact IA : GPTBot et ClaudeBot utilisent ce header pour évaluer la fraîcheur. Son absence peut réduire votre visibilité dans les réponses IA.`;
  }

  // Build detailList with cache-related headers
  const freshDetailList = [];
  freshDetailList.push(`Last-Modified : ${lastModified || '❌ absent'}`);
  freshDetailList.push(`Cache-Control : ${cacheControl || '(non défini)'}`);
  if (age) freshDetailList.push(`Age : ${age}s (temps en cache)`);
  if (cdnName) freshDetailList.push(`CDN détecté : ${cdnName}`);
  if (server) freshDetailList.push(`Serveur : ${server}`);
  const etag = response.headers.get('etag');
  if (etag) freshDetailList.push(`ETag : ${etag}`);
  const expires = response.headers.get('expires');
  if (expires) freshDetailList.push(`Expires : ${expires}`);

  checks.push({
    name: 'Fraîcheur du contenu (Last-Modified)',
    status: lastModified ? (new Date(lastModified) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) ? 'success' : 'warning') : 'warning',
    value: lastModified ? new Date(lastModified).toLocaleDateString('fr-FR') : 'Absent',
    detail: freshDetail,
    recommendation: freshRecommendation || null,
    detailList: freshDetailList,
  });

  // Content length optimization for AI indexing — zone breakdown
  const allWords = bodyText.split(' ').filter((w) => w.length > 1);
  const wordCount = allWords.length;

  // Analyze content zones
  const mainText = $('main').text().replace(/\s+/g, ' ').trim();
  const headerText = $('header').text().replace(/\s+/g, ' ').trim();
  const footerText = $('footer').text().replace(/\s+/g, ' ').trim();
  const mainWords = mainText ? mainText.split(' ').filter((w) => w.length > 1).length : 0;
  const headerWords = headerText ? headerText.split(' ').filter((w) => w.length > 1).length : 0;
  const footerWords = footerText ? footerText.split(' ').filter((w) => w.length > 1).length : 0;
  const contentWords = mainWords || (wordCount - headerWords - footerWords);
  const noiseRatio = wordCount > 0 ? (((headerWords + footerWords) / wordCount) * 100).toFixed(0) : 0;

  let lengthDetail = `${wordCount} mots au total`;
  if (mainWords > 0 || headerWords > 0) {
    lengthDetail += ` — contenu utile : ~${contentWords} mots | navigation/footer : ~${headerWords + footerWords} mots (${noiseRatio}% de bruit)`;
  }
  if (wordCount >= 500 && wordCount <= 3000) {
    lengthDetail += `\n✓ Plage optimale pour les IA (500-3000 mots)`;
  }

  let lengthReco = null;
  if (wordCount < 500) {
    const deficit = 500 - wordCount;
    lengthReco = `📏 ${wordCount} mots — il manque environ ${deficit} mots pour atteindre le seuil d'indexation IA (500 mots).\n\nOù ajouter du contenu :\n  • Description produit : développez matériaux, dimensions, entretien, pour qui c'est fait\n  • Section "À propos" : ajoutez votre histoire, expertise, valeurs\n  • FAQ visible sur la page : 3-5 questions avec réponses détaillées\n  • Témoignages/avis clients : du contenu unique et naturel\n\nLes IA comme ChatGPT et Perplexity ignorent les pages avec moins de ~300 mots de contenu utile.`;
  } else if (wordCount > 3000) {
    lengthReco = `📏 ${wordCount} mots — contenu long qui risque la troncature par les LLM.\n\nActions recommandées :\n  • Structurez avec des H2 clairs — les IA peuvent extraire par section\n  • Placez les informations essentielles dans les 500 premiers mots\n  • Utilisez des résumés en début de section\n  • Envisagez de diviser en plusieurs pages spécialisées`;
  } else if (noiseRatio > 40) {
    lengthReco = `⚠️ ${noiseRatio}% du contenu est de la navigation/footer — les IA indexent tout le texte HTML.\n→ Utilisez les balises <main>, <header>, <footer> pour que les IA puissent distinguer le contenu utile du bruit`;
  }

  // Build detailList for content zones
  const lengthDetailList = [];
  lengthDetailList.push(`📊 Total : ${wordCount} mots (plage idéale : 500-3000)`);
  if (mainWords > 0) lengthDetailList.push(`📄 <main> contenu principal : ${mainWords} mots`);
  if (headerWords > 0) lengthDetailList.push(`🔝 <header> navigation : ${headerWords} mots`);
  if (footerWords > 0) lengthDetailList.push(`🔻 <footer> pied de page : ${footerWords} mots`);
  if (noiseRatio > 0) lengthDetailList.push(`📉 Ratio bruit (nav+footer) : ${noiseRatio}%`);
  // Show content from key sections
  const productDesc = $('[class*="product"] .description, .product-description, [class*="ProductDescription"]').first().text().trim();
  if (productDesc) {
    const preview = productDesc.length > 120 ? productDesc.slice(0, 120) + '...' : productDesc;
    lengthDetailList.push(`🛍️ Description produit : "${preview}" (${productDesc.split(' ').length} mots)`);
  }
  const metaDescContent = $('meta[name="description"]').attr('content') || '';
  if (metaDescContent) {
    lengthDetailList.push(`🏷️ Meta description : "${metaDescContent.slice(0, 120)}${metaDescContent.length > 120 ? '...' : ''}" (${metaDescContent.length} car.)`);
  } else {
    lengthDetailList.push('🏷️ Meta description : ❌ absente');
  }

  checks.push({
    name: 'Longueur optimale pour IA',
    status: wordCount >= 500 && wordCount <= 3000 ? 'success' : wordCount >= 200 ? 'warning' : 'error',
    value: `${wordCount} mots`,
    detail: lengthDetail,
    recommendation: lengthReco,
    detailList: lengthDetailList,
  });

  return {
    name: 'Qualité du contenu pour les IA',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeCitabilite($) {
  const checks = [];
  const jsonLdScripts = $('script[type="application/ld+json"]');

  // Author info — detailed check
  const authorChecks = [
    { selector: 'meta[name="author"]', label: '<meta name="author">', found: false, value: '' },
    { selector: '[rel="author"]', label: 'rel="author"', found: false, value: '' },
    { selector: '[class*="author"]', label: 'class="*author*"', found: false, value: '' },
    { selector: '[itemprop="author"]', label: 'itemprop="author"', found: false, value: '' },
    { selector: 'script[type="application/ld+json"]', label: 'Schema.org Person/author', found: false, value: '' },
  ];
  for (const check of authorChecks) {
    const el = $(check.selector).first();
    if (el.length > 0) {
      check.found = true;
      check.value = el.attr('content') || el.text().trim().slice(0, 60) || 'trouvé';
    }
  }
  // Check JSON-LD for author
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data.author || (data['@graph'] && data['@graph'].some((g) => g.author))) {
        authorChecks[4].found = true;
        const author = data.author?.name || data.author || '';
        authorChecks[4].value = typeof author === 'string' ? author.slice(0, 60) : 'trouvé';
      }
    } catch { /* ignore */ }
  });

  const hasAuthor = authorChecks.some((c) => c.found);
  const authorDetailList = authorChecks.map((c) =>
    c.found ? `✓ ${c.label} : ${c.value}` : `✗ ${c.label} : non trouvé`
  );
  if (!hasAuthor) {
    authorDetailList.push('');
    authorDetailList.push('💡 E-E-A-T (Experience, Expertise, Authority, Trust) est un critère clé');
    authorDetailList.push('   Les IA vérifient la crédibilité de la source avant de citer');
  }

  checks.push({
    name: 'Information auteur (E-E-A-T)',
    status: hasAuthor ? 'success' : 'warning',
    value: hasAuthor ? 'Présente' : 'Absente',
    detail: hasAuthor
      ? `Auteur détecté via : ${authorChecks.filter((c) => c.found).map((c) => c.label).join(', ')}`
      : 'Aucune information auteur trouvée',
    recommendation: !hasAuthor
      ? 'Ajoutez des informations d\'auteur (meta author, schema Person) pour la crédibilité E-E-A-T'
      : null,
    detailList: authorDetailList,
  });

  // Publication date — detailed check
  const dateChecks = [
    { selector: 'meta[property="article:published_time"]', label: 'meta article:published_time', found: false, value: '' },
    { selector: 'meta[property="article:modified_time"]', label: 'meta article:modified_time', found: false, value: '' },
    { selector: 'time[datetime]', label: '<time datetime="...">', found: false, value: '' },
    { selector: '[itemprop="datePublished"]', label: 'itemprop="datePublished"', found: false, value: '' },
    { selector: '[itemprop="dateModified"]', label: 'itemprop="dateModified"', found: false, value: '' },
    { selector: '[class*="date"]', label: 'class="*date*"', found: false, value: '' },
  ];
  for (const check of dateChecks) {
    const el = $(check.selector).first();
    if (el.length > 0) {
      check.found = true;
      check.value = el.attr('content') || el.attr('datetime') || el.text().trim().slice(0, 40) || 'trouvé';
    }
  }

  const hasDate = dateChecks.some((c) => c.found);
  const dateDetailList = dateChecks.map((c) =>
    c.found ? `✓ ${c.label} : ${c.value}` : `✗ ${c.label} : non trouvé`
  );
  if (!hasDate) {
    dateDetailList.push('');
    dateDetailList.push('💡 Les IA évaluent la fraîcheur du contenu pour décider quoi citer');
    dateDetailList.push('   Sans date, votre contenu peut être considéré comme obsolète');
  }

  checks.push({
    name: 'Date de publication',
    status: hasDate ? 'success' : 'warning',
    value: hasDate ? 'Présente' : 'Absente',
    detail: hasDate
      ? `Date détectée via : ${dateChecks.filter((c) => c.found).map((c) => c.label).join(', ')}`
      : 'Aucune date de publication trouvée',
    recommendation: !hasDate
      ? 'Ajoutez une date de publication visible et en metadata pour la fraîcheur du contenu'
      : null,
    detailList: dateDetailList,
  });

  // Unique content indicator — deep analysis
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const words = bodyText.split(' ').filter((w) => w.length > 3);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const diversityRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Find most repeated words (excluding common stop words)
  const stopWords = new Set(['dans', 'pour', 'avec', 'plus', 'cette', 'votre', 'nous', 'vous', 'sont', 'être', 'avoir', 'fait', 'tout', 'tous', 'aussi', 'mais', 'comme', 'même', 'encore', 'alors', 'entre', 'après', 'sans', 'from', 'that', 'this', 'with', 'your', 'have', 'will', 'they', 'their', 'been', 'were', 'about', 'which', 'when', 'what', 'there', 'each', 'make', 'like', 'just', 'over', 'such', 'some', 'than', 'them', 'very', 'only', 'other', 'into', 'could']);
  const wordFreq = {};
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüç-]/g, '');
    if (lower.length > 3 && !stopWords.has(lower)) {
      wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    }
  }
  const topRepeated = Object.entries(wordFreq)
    .filter(([, count]) => count > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Analyze content zones
  const zones = [];
  const productDescs = $('[class*="product"] p, [class*="product"] .description, .product-description, [class*="ProductDescription"]');
  const mainContent = $('main p, article p, .page-content p, [role="main"] p');
  const metaDesc = $('meta[name="description"]').attr('content') || '';

  if (productDescs.length > 0) {
    const avgLen = Math.round(productDescs.toArray().reduce((sum, el) => sum + $(el).text().trim().length, 0) / productDescs.length);
    zones.push({ zone: 'Descriptions produits', count: productDescs.length, avgChars: avgLen });
  }
  if (mainContent.length > 0) {
    const avgLen = Math.round(mainContent.toArray().reduce((sum, el) => sum + $(el).text().trim().length, 0) / mainContent.length);
    zones.push({ zone: 'Contenu principal', count: mainContent.length, avgChars: avgLen });
  }

  // Build rich detail
  let vocabDetail = `${uniqueWords.size} mots uniques sur ${words.length} mots totaux (diversité ${(diversityRatio * 100).toFixed(0)}%)`;
  if (topRepeated.length > 0) {
    vocabDetail += `\nMots les plus répétés : ${topRepeated.slice(0, 5).map(([w, c]) => `"${w}" (×${c})`).join(', ')}`;
  }

  let vocabRecommendation = null;
  if (diversityRatio < 0.4) {
    const tips = [];
    tips.push(`📊 Score actuel : ${(diversityRatio * 100).toFixed(0)}% — objectif : >40% pour être bien indexé par les IA`);

    if (topRepeated.length > 0) {
      tips.push(`\n🔄 Mots sur-utilisés à reformuler :`);
      for (const [word, count] of topRepeated.slice(0, 5)) {
        tips.push(`  • "${word}" apparaît ${count} fois — utilisez des synonymes ou reformulations`);
      }
    }

    tips.push(`\n📝 Actions prioritaires par zone :`);
    if (metaDesc.length < 120) {
      tips.push(`  • Meta description (${metaDesc.length} car.) : enrichissez à 150-160 caractères avec des mots-clés variés`);
    }

    // Zone-specific advice
    if (zones.some((z) => z.zone === 'Descriptions produits' && z.avgChars < 200)) {
      const z = zones.find((z) => z.zone === 'Descriptions produits');
      tips.push(`  • Descriptions produits : ${z.count} bloc(s), moyenne ${z.avgChars} car. — enrichissez à 300+ car. avec matériaux, dimensions, usages, avantages`);
    }
    if (zones.some((z) => z.zone === 'Contenu principal' && z.avgChars < 100)) {
      tips.push(`  • Paragraphes principaux trop courts — développez avec contexte, bénéfices et détails techniques`);
    }

    tips.push(`\n💡 Conseils pour les IA/LLM :`);
    tips.push(`  • Les IA extraient le contenu paragraphe par paragraphe — chaque paragraphe doit être auto-suffisant`);
    tips.push(`  • Utilisez des termes variés : synonymes, termes techniques + vulgarisés, questions naturelles`);
    tips.push(`  • Ajoutez du contexte sémantique : "bijou dentaire en or 18 carats" plutôt que juste "bijou"`);
    tips.push(`  • Les LLM citent plus facilement un contenu structuré : titre → problème → solution → détail`);

    vocabRecommendation = tips.join('\n');
  }

  // Build detailCards for zone breakdown
  const vocabCards = [];
  if (topRepeated.length > 0) {
    vocabCards.push(...topRepeated.map(([word, count]) => `"${word}" — ${count} occurrences`));
  }

  checks.push({
    name: 'Richesse du vocabulaire',
    status: diversityRatio > 0.4 ? 'success' : diversityRatio > 0.25 ? 'warning' : 'error',
    value: `${(diversityRatio * 100).toFixed(0)}% de diversité`,
    detail: vocabDetail,
    recommendation: vocabRecommendation,
    detailList: vocabCards.length > 0 ? vocabCards : undefined,
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

const ROBOTS_FIX_ACTION = {
  id: 'robots-txt-ai',
  label: 'Ajouter dans robots.txt',
};

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
  'Date de publication': {
    id: 'ai-date-publication',
    label: 'Ajouter meta dates',
    description: 'Injecter article:published_time et article:modified_time dans theme.liquid',
  },
  'HTML sémantique': {
    id: 'ai-semantic-html',
    label: 'Ajouter balises sémantiques',
    description: 'Injecter <main> et role="main" autour du contenu dans theme.liquid',
  },
  'FAQ structurée': {
    id: 'ai-faq-schema',
    label: 'Créer FAQ schema',
    description: 'Créer un snippet FAQPage schema.org et l\'inclure dans theme.liquid',
  },
  'ai-plugin.json': {
    id: 'ai-plugin-json',
    label: 'Créer ai-plugin.json',
    description: 'Créer le fichier ai-plugin.json et configurer le redirect .well-known',
  },
  // Bot-specific entries → all point to the same robots.txt fix
  'OAI-SearchBot (OpenAI Search)': ROBOTS_FIX_ACTION,
  'Amazonbot (Amazon/Alexa)': ROBOTS_FIX_ACTION,
  'Applebot-Extended (Apple Intelligence)': ROBOTS_FIX_ACTION,
  'meta-externalagent (Meta AI)': ROBOTS_FIX_ACTION,
  'CCBot (Common Crawl)': ROBOTS_FIX_ACTION,
  'cohere-ai (Cohere)': ROBOTS_FIX_ACTION,
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
  'Richesse du vocabulaire': 'Admin Shopify > Produits : enrichissez chaque description (300+ car.) avec matériaux, dimensions, usages. Pages : Admin > Pages > ajoutez des paragraphes détaillés avec synonymes et contexte. Blog : créez des articles thématiques pour diversifier le vocabulaire global.',
  'Fraîcheur du contenu (Last-Modified)': 'Shopify envoie ce header par défaut. Si absent : 1) Vérifiez vos apps de cache/vitesse (Booster, Hyperspeed) qui peuvent le supprimer 2) Si Cloudflare : Rules > Cache > transmettez les headers d\'origine 3) Mettez à jour régulièrement vos pages produits (même un petit changement suffit à rafraîchir la date).',
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
      }
      // Add fixAction for any non-success check with an automatable fix
      if (check.status !== 'success' && FIX_ACTIONS[check.name]) {
        check.fixAction = FIX_ACTIONS[check.name];
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
