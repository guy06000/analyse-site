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

    const results = {
      url,
      timestamp: new Date().toISOString(),
      categories: {
        meta: analyzeMeta($, url),
        structure: analyzeStructure($),
        technique: await analyzeTechnique($, url, response),
        contenu: analyzeContenu($),
        structuredData: analyzeStructuredData($),
        securite: analyzeSecurite(response),
        liens: await analyzeLiens($, url),
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

function analyzeMeta($, url) {
  const checks = [];

  // Title
  const title = $('title').text().trim();
  checks.push({
    name: 'Titre de page',
    status: !title ? 'error' : title.length < 30 || title.length > 65 ? 'warning' : 'success',
    value: title || 'Absent',
    detail: title
      ? `${title.length} caractères (recommandé : 50-60)`
      : 'Aucun titre trouvé',
    recommendation: !title
      ? 'Ajoutez une balise <title> descriptive'
      : title.length > 65
        ? 'Raccourcissez le titre à 60 caractères max'
        : title.length < 30
          ? 'Le titre est trop court, visez 50-60 caractères'
          : null,
  });

  // Meta description
  const description = $('meta[name="description"]').attr('content')?.trim();
  checks.push({
    name: 'Meta description',
    status: !description ? 'error' : description.length < 120 || description.length > 165 ? 'warning' : 'success',
    value: description ? `${description.length} car.` : 'Absente',
    detail: description
      ? `${description.length} caractères (recommandé : 150-160)`
      : 'Aucune meta description trouvée',
    recommendation: !description
      ? 'Ajoutez une meta description entre 150 et 160 caractères'
      : description.length > 165
        ? 'La description est trop longue, raccourcissez à 160 caractères max'
        : description.length < 120
          ? 'La description est trop courte, visez 150-160 caractères'
          : null,
  });

  // Canonical
  const canonical = $('link[rel="canonical"]').attr('href');
  checks.push({
    name: 'URL canonique',
    status: canonical ? 'success' : 'warning',
    value: canonical || 'Absente',
    detail: canonical ? `Canonique : ${canonical}` : 'Pas de balise canonical',
    recommendation: !canonical ? 'Ajoutez <link rel="canonical"> pour éviter le contenu dupliqué' : null,
  });

  // Open Graph
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDesc = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    name: 'Open Graph',
    status: ogCount === 3 ? 'success' : ogCount > 0 ? 'warning' : 'error',
    value: `${ogCount}/3 balises`,
    detail: `og:title: ${ogTitle ? 'OK' : 'Manquant'} | og:description: ${ogDesc ? 'OK' : 'Manquant'} | og:image: ${ogImage ? 'OK' : 'Manquant'}`,
    recommendation: ogCount < 3 ? 'Complétez les balises Open Graph (og:title, og:description, og:image)' : null,
  });

  // Twitter Card
  const twCard = $('meta[name="twitter:card"]').attr('content');
  const twTitle = $('meta[name="twitter:title"]').attr('content');
  checks.push({
    name: 'Twitter Card',
    status: twCard && twTitle ? 'success' : twCard || twTitle ? 'warning' : 'error',
    value: twCard ? `Type: ${twCard}` : 'Absente',
    detail: `twitter:card: ${twCard || 'Manquant'} | twitter:title: ${twTitle ? 'OK' : 'Manquant'}`,
    recommendation: !twCard ? 'Ajoutez les balises Twitter Card pour un meilleur partage sur X/Twitter' : null,
  });

  // Meta keywords
  const keywords = $('meta[name="keywords"]').attr('content');
  checks.push({
    name: 'Meta keywords',
    status: keywords ? 'success' : 'warning',
    value: keywords ? `${keywords.split(',').length} mots-clés` : 'Absente',
    detail: keywords || 'Pas de meta keywords (faible impact SEO mais utile)',
    recommendation: !keywords ? 'Les meta keywords ont peu d\'impact mais peuvent être ajoutées' : null,
  });

  return {
    name: 'Meta & Contenu',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeStructure($) {
  const checks = [];

  // H1
  const h1s = $('h1');
  checks.push({
    name: 'Balise H1',
    status: h1s.length === 1 ? 'success' : h1s.length === 0 ? 'error' : 'warning',
    value: `${h1s.length} H1 trouvée(s)`,
    detail: h1s.length === 1 ? `H1 : "${h1s.first().text().trim()}"` : h1s.length === 0 ? 'Aucune balise H1' : 'Plusieurs H1 détectées',
    recommendation: h1s.length === 0
      ? 'Ajoutez une balise H1 unique décrivant le contenu principal'
      : h1s.length > 1
        ? 'Gardez une seule balise H1 par page'
        : null,
  });

  // Heading hierarchy
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    headings.push(parseInt(el.tagName[1]));
  });
  let hasSkip = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] > headings[i - 1] + 1) {
      hasSkip = true;
      break;
    }
  }
  checks.push({
    name: 'Hiérarchie des titres',
    status: headings.length === 0 ? 'error' : hasSkip ? 'warning' : 'success',
    value: `${headings.length} titres trouvés`,
    detail: headings.length > 0 ? `Niveaux : ${headings.join(' → ')}` : 'Aucun titre trouvé',
    recommendation: hasSkip ? 'Évitez de sauter des niveaux de titre (ex: H2 → H4 sans H3)' : null,
  });

  // Images alt
  const images = $('img');
  const imagesWithAlt = $('img[alt]').filter((_, el) => $(el).attr('alt').trim().length > 0);
  const altRatio = images.length > 0 ? imagesWithAlt.length / images.length : 1;
  const missingAltImages = [];
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (!alt || alt.trim().length === 0) {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      const width = $(el).attr('width') || '';
      const height = $(el).attr('height') || '';
      const classes = $(el).attr('class') || '';
      // Build a readable label
      let label = src;
      if (src.length > 120) label = '...' + src.slice(-100);
      if (width || height) label += ` (${width}x${height})`;
      // Try to identify context from parent
      const parent = $(el).parent();
      const parentTag = parent.prop('tagName')?.toLowerCase() || '';
      const parentClass = parent.attr('class') || '';
      if (parentClass) label += ` [${parentTag}.${parentClass.split(' ')[0]}]`;
      missingAltImages.push(label);
    }
  });
  checks.push({
    name: 'Attributs alt des images',
    status: images.length === 0 ? 'success' : altRatio === 1 ? 'success' : altRatio >= 0.5 ? 'warning' : 'error',
    value: `${imagesWithAlt.length}/${images.length} images avec alt`,
    detail: images.length === 0 ? 'Aucune image sur la page' : `${Math.round(altRatio * 100)}% des images ont un attribut alt — ${missingAltImages.length} image(s) sans alt`,
    recommendation: altRatio < 1 && images.length > 0 ? 'Ajoutez des attributs alt descriptifs à toutes les images pour le SEO et l\'accessibilité' : null,
    detailList: missingAltImages.length > 0 ? missingAltImages : undefined,
  });

  // Text/HTML ratio
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const htmlLength = $.html().length;
  const ratio = htmlLength > 0 ? (text.length / htmlLength) * 100 : 0;
  checks.push({
    name: 'Ratio texte/HTML',
    status: ratio > 25 ? 'success' : ratio > 10 ? 'warning' : 'error',
    value: `${ratio.toFixed(1)}%`,
    detail: `${text.length} car. de texte / ${htmlLength} car. de HTML`,
    recommendation: ratio < 10 ? 'Le ratio texte/HTML est trop faible. Ajoutez plus de contenu textuel.' : null,
  });

  // Links
  const internalLinks = [];
  const externalLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      if (href.startsWith('http') && !href.includes(new URL($('link[rel="canonical"]').attr('href') || 'http://example.com').hostname)) {
        externalLinks.push(href);
      } else {
        internalLinks.push(href);
      }
    }
  });
  checks.push({
    name: 'Liens internes et externes',
    status: internalLinks.length > 0 ? 'success' : 'warning',
    value: `${internalLinks.length} internes / ${externalLinks.length} externes`,
    detail: `Liens internes : ${internalLinks.length} | Liens externes : ${externalLinks.length}`,
    recommendation: internalLinks.length === 0 ? 'Ajoutez des liens internes pour améliorer le maillage' : null,
  });

  // Image optimization
  const allImages = $('img[src]');
  let modernFormatCount = 0;
  let lazyCount = 0;
  let dimensionCount = 0;
  let totalImages = 0;

  allImages.each((_, el) => {
    const src = $(el).attr('src') || '';
    const srcset = $(el).attr('srcset') || '';
    const loading = $(el).attr('loading');
    const width = $(el).attr('width');
    const height = $(el).attr('height');
    if (!src) return;
    totalImages++;
    if (/\.(webp|avif)(\?|$)/i.test(src) || /\.(webp|avif)/i.test(srcset)) modernFormatCount++;
    if (loading === 'lazy') lazyCount++;
    if (width && height) dimensionCount++;
  });

  if (totalImages > 0) {
    checks.push({
      name: 'Format d\'images moderne',
      status: modernFormatCount === totalImages ? 'success' : modernFormatCount > 0 ? 'warning' : 'error',
      value: `${modernFormatCount}/${totalImages}`,
      detail: `${modernFormatCount} image(s) au format WebP/AVIF sur ${totalImages}`,
      recommendation: modernFormatCount < totalImages
        ? 'Convertissez vos images en WebP ou AVIF pour réduire le poids (30-50% de gain)'
        : null,
    });

    checks.push({
      name: 'Lazy loading des images',
      status: lazyCount >= totalImages * 0.5 ? 'success' : lazyCount > 0 ? 'warning' : 'error',
      value: `${lazyCount}/${totalImages}`,
      detail: `${lazyCount} image(s) avec loading="lazy" sur ${totalImages}`,
      recommendation: lazyCount < totalImages * 0.5
        ? 'Ajoutez loading="lazy" sur les images hors écran pour accélérer le chargement'
        : null,
    });

    checks.push({
      name: 'Dimensions des images',
      status: dimensionCount === totalImages ? 'success' : dimensionCount > 0 ? 'warning' : 'error',
      value: `${dimensionCount}/${totalImages}`,
      detail: `${dimensionCount} image(s) avec width/height explicites sur ${totalImages}`,
      recommendation: dimensionCount < totalImages
        ? 'Spécifiez width et height sur les images pour éviter les décalages visuels (CLS)'
        : null,
    });
  }

  return {
    name: 'Structure HTML',
    checks,
    score: calculateCategoryScore(checks),
  };
}

async function analyzeTechnique($, url, response) {
  const checks = [];
  const baseUrl = new URL(url);

  // HTTPS
  checks.push({
    name: 'HTTPS',
    status: baseUrl.protocol === 'https:' ? 'success' : 'error',
    value: baseUrl.protocol === 'https:' ? 'Actif' : 'Non sécurisé',
    detail: `Protocole : ${baseUrl.protocol}`,
    recommendation: baseUrl.protocol !== 'https:' ? 'Migrez vers HTTPS pour la sécurité et le SEO' : null,
  });

  // Viewport
  const viewport = $('meta[name="viewport"]').attr('content');
  checks.push({
    name: 'Balise viewport',
    status: viewport ? 'success' : 'error',
    value: viewport ? 'Présente' : 'Absente',
    detail: viewport || 'Pas de balise viewport',
    recommendation: !viewport ? 'Ajoutez <meta name="viewport" content="width=device-width, initial-scale=1">' : null,
  });

  // Robots.txt
  let robotsStatus = 'error';
  let robotsDetail = '';
  try {
    const robotsRes = await fetch(`${baseUrl.origin}/robots.txt`);
    if (robotsRes.ok) {
      const robotsText = await robotsRes.text();
      robotsStatus = 'success';
      robotsDetail = `Trouvé (${robotsText.length} car.)`;
    } else {
      robotsDetail = `HTTP ${robotsRes.status}`;
    }
  } catch {
    robotsDetail = 'Inaccessible';
  }
  checks.push({
    name: 'robots.txt',
    status: robotsStatus,
    value: robotsStatus === 'success' ? 'Présent' : 'Absent',
    detail: robotsDetail,
    recommendation: robotsStatus !== 'success' ? 'Créez un fichier robots.txt à la racine du site' : null,
  });

  // Sitemap
  let sitemapStatus = 'error';
  let sitemapDetail = '';
  try {
    const sitemapRes = await fetch(`${baseUrl.origin}/sitemap.xml`);
    if (sitemapRes.ok) {
      sitemapStatus = 'success';
      sitemapDetail = 'Trouvé';
    } else {
      sitemapDetail = `HTTP ${sitemapRes.status}`;
    }
  } catch {
    sitemapDetail = 'Inaccessible';
  }
  checks.push({
    name: 'sitemap.xml',
    status: sitemapStatus,
    value: sitemapStatus === 'success' ? 'Présent' : 'Absent',
    detail: sitemapDetail,
    recommendation: sitemapStatus !== 'success' ? 'Créez un sitemap.xml pour faciliter l\'indexation' : null,
  });

  // Page size
  const pageSize = Buffer.byteLength($.html(), 'utf8');
  const pageSizeKB = (pageSize / 1024).toFixed(1);
  checks.push({
    name: 'Taille de la page',
    status: pageSize < 100000 ? 'success' : pageSize < 500000 ? 'warning' : 'error',
    value: `${pageSizeKB} KB`,
    detail: `Taille du HTML : ${pageSizeKB} KB`,
    recommendation: pageSize > 500000 ? 'La page est trop lourde. Optimisez le HTML et les ressources inline.' : null,
  });

  // Compression
  const encoding = response.headers.get('content-encoding');
  checks.push({
    name: 'Compression',
    status: encoding ? 'success' : 'warning',
    value: encoding || 'Non détectée',
    detail: encoding ? `Compression : ${encoding}` : 'Pas de compression détectée',
    recommendation: !encoding ? 'Activez la compression gzip ou brotli sur votre serveur' : null,
  });

  // Redirect chain detection
  const redirectChain = [];
  try {
    let currentUrl = url;
    for (let i = 0; i < 5; i++) {
      const rRes = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'AnalyseSite/1.0' },
      });
      if (rRes.status >= 300 && rRes.status < 400) {
        const location = rRes.headers.get('location');
        if (!location) break;
        const resolved = new URL(location, currentUrl).href;
        redirectChain.push(`${rRes.status}: ${currentUrl} → ${resolved}`);
        currentUrl = resolved;
      } else {
        break;
      }
    }
  } catch { /* skip */ }
  checks.push({
    name: 'Chaîne de redirections',
    status: redirectChain.length === 0 ? 'success' : redirectChain.length <= 1 ? 'warning' : 'error',
    value: redirectChain.length === 0 ? 'Aucune' : `${redirectChain.length} saut(s)`,
    detail: redirectChain.length === 0
      ? 'L\'URL est directement accessible sans redirection'
      : `${redirectChain.length} redirection(s) détectée(s)`,
    detailList: redirectChain.length > 0 ? redirectChain : undefined,
    recommendation: redirectChain.length > 1
      ? `Réduisez la chaîne de redirections (${redirectChain.length} sauts). Chaque redirection ralentit le chargement et dilue le "link juice".`
      : null,
  });

  // Mixed content detection (HTTP resources on HTTPS page)
  if (baseUrl.protocol === 'https:') {
    const mixedResources = new Set();
    $('[src], link[href], [action]').each((_, el) => {
      const attr = $(el).attr('src') || $(el).attr('href') || $(el).attr('action');
      if (attr && attr.startsWith('http://') && !attr.includes('localhost')) {
        mixedResources.add(attr);
      }
    });
    const mixed = [...mixedResources];
    checks.push({
      name: 'Contenu mixte (HTTP/HTTPS)',
      status: mixed.length === 0 ? 'success' : 'error',
      value: mixed.length === 0 ? 'Aucun' : `${mixed.length} ressource(s)`,
      detail: mixed.length === 0
        ? 'Toutes les ressources sont chargées en HTTPS'
        : `${mixed.length} ressource(s) chargée(s) en HTTP non sécurisé`,
      detailList: mixed.length > 0 ? mixed : undefined,
      recommendation: mixed.length > 0
        ? 'Remplacez toutes les URLs http:// par https:// pour éviter les avertissements de sécurité'
        : null,
    });
  }

  return {
    name: 'Technique',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeContenu($) {
  const checks = [];

  // Word count
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const words = bodyText.split(' ').filter((w) => w.length > 1);
  checks.push({
    name: 'Nombre de mots',
    status: words.length > 300 ? 'success' : words.length > 100 ? 'warning' : 'error',
    value: `${words.length} mots`,
    detail: `Contenu : ${words.length} mots (recommandé : >300)`,
    recommendation: words.length < 300 ? 'Ajoutez plus de contenu textuel (minimum 300 mots recommandé)' : null,
  });

  // Top keywords
  const wordFreq = {};
  const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux', 'à', 'ce', 'ces', 'que', 'qui', 'dans', 'pour', 'par', 'sur', 'est', 'sont', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'it', 'this', 'that', 'with', 'as', 'was', 'not', 'but', 'be', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'can']);
  words.forEach((word) => {
    const w = word.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüç]/g, '');
    if (w.length > 2 && !stopWords.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });
  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => `${word} (${count})`);
  checks.push({
    name: 'Mots-clés principaux',
    status: topKeywords.length > 0 ? 'success' : 'warning',
    value: `Top 10 mots`,
    detail: topKeywords.join(', ') || 'Pas assez de contenu',
    recommendation: null,
  });

  // Internal links in content
  const contentLinks = $('article a, main a, .content a, #content a').length || $('body a').length;
  checks.push({
    name: 'Liens dans le contenu',
    status: contentLinks > 3 ? 'success' : contentLinks > 0 ? 'warning' : 'error',
    value: `${contentLinks} liens`,
    detail: `${contentLinks} liens trouvés dans le contenu`,
    recommendation: contentLinks < 3 ? 'Ajoutez des liens internes dans votre contenu pour le maillage' : null,
  });

  return {
    name: 'Contenu',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeStructuredData($) {
  const checks = [];

  // JSON-LD
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const schemas = [];
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const type = data['@type'] || (Array.isArray(data['@graph']) ? data['@graph'].map((g) => g['@type']).join(', ') : 'Inconnu');
      schemas.push(type);
    } catch {
      schemas.push('JSON invalide');
    }
  });

  checks.push({
    name: 'JSON-LD / Schema.org',
    status: jsonLdScripts.length > 0 ? 'success' : 'error',
    value: jsonLdScripts.length > 0 ? `${jsonLdScripts.length} schema(s)` : 'Absent',
    detail: schemas.length > 0 ? `Types : ${schemas.join(', ')}` : 'Aucune donnée structurée JSON-LD',
    recommendation: jsonLdScripts.length === 0 ? 'Ajoutez des données structurées JSON-LD (Product, Organization, BreadcrumbList...)' : null,
  });

  // Microdata
  const microdataItems = $('[itemscope]');
  checks.push({
    name: 'Microdata',
    status: microdataItems.length > 0 ? 'success' : 'warning',
    value: microdataItems.length > 0 ? `${microdataItems.length} élément(s)` : 'Absent',
    detail: microdataItems.length > 0
      ? `${microdataItems.length} éléments avec itemscope`
      : 'Pas de microdata (JSON-LD est préféré)',
    recommendation: null,
  });

  return {
    name: 'Données structurées',
    checks,
    score: calculateCategoryScore(checks),
  };
}

// ── Sécurité (headers) ──

function analyzeSecurite(response) {
  const checks = [];

  const hsts = response.headers.get('strict-transport-security');
  let hstsOk = false;
  if (hsts) {
    const maxAge = hsts.match(/max-age=(\d+)/);
    hstsOk = maxAge && parseInt(maxAge[1]) >= 31536000;
  }
  checks.push({
    name: 'Strict-Transport-Security (HSTS)',
    status: hstsOk ? 'success' : hsts ? 'warning' : 'error',
    value: hstsOk ? 'Actif' : hsts ? 'Faible' : 'Absent',
    detail: hsts || 'Header HSTS absent',
    recommendation: !hstsOk
      ? 'Ajoutez Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'
      : null,
  });

  const csp = response.headers.get('content-security-policy');
  const cspUnsafe = csp && (csp.includes('unsafe-inline') || csp.includes('unsafe-eval'));
  checks.push({
    name: 'Content-Security-Policy (CSP)',
    status: csp && !cspUnsafe ? 'success' : csp ? 'warning' : 'error',
    value: csp ? (cspUnsafe ? 'Partiel' : 'Actif') : 'Absent',
    detail: csp
      ? `CSP définie${cspUnsafe ? ' (contient unsafe-inline ou unsafe-eval)' : ''}`
      : 'Pas de CSP — vulnérable aux injections XSS',
    recommendation: !csp
      ? 'Ajoutez une Content-Security-Policy pour protéger contre les injections de code'
      : cspUnsafe
        ? 'Supprimez unsafe-inline et unsafe-eval de votre CSP'
        : null,
  });

  const xcto = response.headers.get('x-content-type-options');
  checks.push({
    name: 'X-Content-Type-Options',
    status: xcto === 'nosniff' ? 'success' : 'error',
    value: xcto || 'Absent',
    detail: xcto === 'nosniff' ? 'Protection MIME sniffing active' : 'Pas de protection MIME sniffing',
    recommendation: xcto !== 'nosniff' ? 'Ajoutez X-Content-Type-Options: nosniff' : null,
  });

  const xfo = response.headers.get('x-frame-options');
  const xfoOk = xfo && (xfo.toUpperCase() === 'DENY' || xfo.toUpperCase() === 'SAMEORIGIN');
  checks.push({
    name: 'X-Frame-Options',
    status: xfoOk ? 'success' : 'error',
    value: xfo || 'Absent',
    detail: xfoOk ? `Protection clickjacking active (${xfo})` : 'Pas de protection clickjacking',
    recommendation: !xfoOk ? 'Ajoutez X-Frame-Options: SAMEORIGIN' : null,
  });

  const rp = response.headers.get('referrer-policy');
  checks.push({
    name: 'Referrer-Policy',
    status: rp ? 'success' : 'warning',
    value: rp || 'Absent',
    detail: rp ? `Politique referrer : ${rp}` : 'Pas de politique de referrer définie',
    recommendation: !rp ? 'Ajoutez Referrer-Policy: strict-origin-when-cross-origin' : null,
  });

  const pp = response.headers.get('permissions-policy');
  checks.push({
    name: 'Permissions-Policy',
    status: pp ? 'success' : 'warning',
    value: pp ? 'Définie' : 'Absente',
    detail: pp ? 'Permissions-Policy définie' : 'Aucune restriction sur les fonctionnalités du navigateur',
    recommendation: !pp
      ? 'Ajoutez une Permissions-Policy pour contrôler l\'accès caméra, micro, géolocalisation'
      : null,
  });

  const xpb = response.headers.get('x-powered-by');
  checks.push({
    name: 'Fuite d\'information serveur',
    status: !xpb ? 'success' : 'warning',
    value: !xpb ? 'Aucune' : xpb,
    detail: !xpb
      ? 'Pas de header X-Powered-By exposé'
      : `X-Powered-By: ${xpb} révèle la stack technique`,
    recommendation: xpb
      ? 'Supprimez le header X-Powered-By pour masquer votre stack technique'
      : null,
  });

  return {
    name: 'Sécurité (headers)',
    checks,
    score: calculateCategoryScore(checks),
  };
}

// ── Vérification des liens ──

async function analyzeLiens($, url) {
  const checks = [];
  const allLinks = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('data:')) return;
    try {
      allLinks.add(new URL(href, url).href);
    } catch { /* skip invalid */ }
  });

  const linksToCheck = [...allLinks].slice(0, 10);

  if (linksToCheck.length === 0) {
    checks.push({
      name: 'Liens cassés',
      status: 'warning',
      value: 'Aucun lien',
      detail: 'Aucun lien à vérifier sur la page',
      recommendation: null,
    });
    return { name: 'Vérification des liens', checks, score: calculateCategoryScore(checks) };
  }

  const results = await Promise.allSettled(
    linksToCheck.map(async (linkUrl) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(linkUrl, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'AnalyseSite/1.0' },
        });
        clearTimeout(timeout);
        return { url: linkUrl, status: res.status };
      } catch (e) {
        clearTimeout(timeout);
        return { url: linkUrl, status: 0, error: e.name === 'AbortError' ? 'Timeout' : e.message };
      }
    })
  );

  const broken = [];
  let okCount = 0;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const r = result.value;
    if (r.error) {
      broken.push(`${r.url} (${r.error})`);
    } else if (r.status >= 400 && r.status !== 405) {
      broken.push(`${r.url} (HTTP ${r.status})`);
    } else {
      okCount++;
    }
  }

  checks.push({
    name: 'Liens cassés',
    status: broken.length === 0 ? 'success' : broken.length <= 2 ? 'warning' : 'error',
    value: broken.length === 0 ? 'Aucun' : `${broken.length} cassé(s)`,
    detail: broken.length === 0
      ? `${okCount}/${linksToCheck.length} liens vérifiés, tous fonctionnels`
      : `${broken.length} lien(s) en erreur sur ${linksToCheck.length} vérifiés`,
    detailList: broken.length > 0 ? broken : undefined,
    recommendation: broken.length > 0
      ? 'Corrigez ou supprimez les liens cassés pour améliorer l\'expérience utilisateur et le SEO'
      : null,
  });

  return {
    name: 'Vérification des liens',
    checks,
    score: calculateCategoryScore(checks),
  };
}

const FIX_ACTIONS = {
  'URL canonique': { id: 'seo-canonical', label: 'Ajouter la balise canonical' },
  'Open Graph': { id: 'seo-open-graph', label: 'Ajouter les balises Open Graph' },
  'Twitter Card': { id: 'seo-twitter-card', label: 'Ajouter les balises Twitter Card' },
  'JSON-LD / Schema.org': { id: 'seo-json-ld', label: 'Ajouter les données structurées JSON-LD' },
  'Meta keywords': { id: 'seo-meta-keywords', label: 'Ajouter les meta keywords' },
  'Lazy loading des images': { id: 'seo-lazy-loading', label: 'Ajouter le lazy loading' },
};

const SHOPIFY_FIXES = {
  'Titre de page': 'Admin > Boutique en ligne > Préférences (accueil). Pour produits/pages/collections : éditez l\'élément > section "Référencement sur les moteurs de recherche" en bas.',
  'Meta description': 'Admin > Boutique en ligne > Préférences (accueil). Pour produits/pages/collections : éditez > section "Référencement sur les moteurs de recherche".',
  'URL canonique': 'Shopify gère automatiquement les canonicals. Si problème, vérifiez : Modifier le code > theme.liquid > cherchez "canonical".',
  'Open Graph': 'Modifier le code > theme.liquid ou snippets/social-meta-tags.liquid. Les balises OG sont générées depuis les champs SEO de chaque page/produit.',
  'Twitter Card': 'Modifier le code > theme.liquid ou snippets/social-meta-tags.liquid. Ajoutez les meta twitter:card et twitter:title dans le <head>.',
  'Meta keywords': 'Modifier le code > theme.liquid > Ajoutez dans le <head> : <meta name="keywords" content="vos,mots,clés">.',
  'Balise H1': 'Modifier le code > Vérifiez dans les templates (index.liquid, product.liquid, etc.) qu\'il y a un seul <h1> par page.',
  'Hiérarchie des titres': 'Modifier le code > Vérifiez dans les sections et templates Liquid que les titres suivent H1 > H2 > H3 sans sauter de niveaux.',
  'Attributs alt des images': 'Produits : Admin > Produits > Cliquez sur l\'image > Texte alternatif. Contenu pages : éditeur > clic sur l\'image > Alt text.',
  'Ratio texte/HTML': 'Ajoutez du contenu textuel via les sections "Texte enrichi" ou "Image avec texte" dans le personnalisateur de thème.',
  'Liens internes et externes': 'Éditeur de contenu des pages/produits > ajoutez des liens. Navigation : Admin > Boutique en ligne > Navigation.',
  'HTTPS': 'Shopify fournit SSL automatiquement. Vérifiez : Admin > Paramètres > Domaines.',
  'Balise viewport': 'Incluse par défaut dans les thèmes Shopify. Vérifiez : Modifier le code > theme.liquid > cherchez "viewport".',
  'robots.txt': 'Shopify génère le robots.txt automatiquement. Pour personnaliser (OS 2.0) : Modifier le code > Templates > robots.txt.liquid.',
  'sitemap.xml': 'Shopify génère le sitemap automatiquement à /sitemap.xml. Soumettez-le dans Google Search Console.',
  'Taille de la page': 'Supprimez les apps inutilisées, compressez les images (TinyIMG), limitez les sections lourdes sur la page.',
  'Compression': 'Le CDN Shopify compresse automatiquement (gzip/brotli). Si non détectée, c\'est probablement un faux négatif.',
  'Nombre de mots': 'Ajoutez du contenu via les sections "Texte enrichi" dans le personnalisateur de thème, ou dans l\'éditeur de pages/produits.',
  'Liens dans le contenu': 'Éditeur de contenu > sélectionnez du texte > ajoutez des liens vers d\'autres produits, collections ou pages.',
  'JSON-LD / Schema.org': 'Modifier le code > Créez un snippet (ex: schema-product.liquid) avec le JSON-LD, incluez-le dans product.liquid. Ou app "JSON-LD for SEO".',
  'Microdata': 'Le JSON-LD est recommandé plutôt que les microdata. Géré via les snippets Liquid du thème.',
  'Format d\'images moderne': 'Le CDN Shopify optimise en WebP automatiquement via le filtre image_url. Vérifiez vos sections dans Modifier le code.',
  'Lazy loading des images': 'Les thèmes Shopify modernes utilisent loading="lazy". Vérifiez : Modifier le code > sections/*.liquid.',
  'Dimensions des images': 'Utilisez les filtres Liquid image_url avec width/height pour spécifier les dimensions.',
  'Chaîne de redirections': 'Admin > Boutique en ligne > Navigation > Redirections d\'URL. Simplifiez les chaînes A→B→C en A→C.',
  'Contenu mixte (HTTP/HTTPS)': 'Shopify force HTTPS. Vérifiez que votre code personnalisé n\'inclut pas de ressources HTTP.',
  'Strict-Transport-Security (HSTS)': 'Le CDN Shopify gère HSTS automatiquement. Si absent, vérifiez votre proxy ou CDN personnalisé.',
  'Content-Security-Policy (CSP)': 'Non configurable directement sur Shopify. Utilisez Cloudflare Workers pour ajouter un CSP.',
  'X-Content-Type-Options': 'Géré par le CDN Shopify. Si absent, vérifiez votre configuration DNS/proxy.',
  'X-Frame-Options': 'Shopify inclut ce header par défaut. Si absent, vérifiez votre proxy.',
  'Referrer-Policy': 'Ajoutez via un worker Cloudflare ou la configuration de votre CDN.',
  'Permissions-Policy': 'Non configurable sur Shopify. Utilisez un proxy Cloudflare pour ajouter ce header.',
  'Fuite d\'information serveur': 'Shopify masque ce header. Si exposé, vérifiez votre proxy.',
  'Liens cassés': 'Corrigez dans : Admin > Pages, Admin > Produits (descriptions), et les sections du thème.',
};

function applyShopifyFixes(results) {
  for (const category of Object.values(results.categories)) {
    for (const check of category.checks) {
      if (check.recommendation && SHOPIFY_FIXES[check.name]) {
        check.shopifyFix = SHOPIFY_FIXES[check.name];
      }
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
