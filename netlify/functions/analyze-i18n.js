import * as cheerio from 'cheerio';
import { franc } from 'franc';

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
        configuration: analyzeConfig($),
        langues: await analyzeLangues($, url),
        couverture: await analyzeCouverture($, url),
        qualite: analyzeQualite($),
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

const LANG_TO_FRANC = {
  fr: 'fra', en: 'eng', es: 'spa', de: 'deu', it: 'ita',
  nl: 'nld', ja: 'jpn', ko: 'kor', pl: 'pol', pt: 'por',
  sv: 'swe', da: 'dan', fi: 'fin', no: 'nor', ru: 'rus',
};

const LANG_NAMES = {
  fra: 'Français', eng: 'Anglais', spa: 'Espagnol', deu: 'Allemand',
  ita: 'Italien', por: 'Portugais', nld: 'Néerlandais', rus: 'Russe',
  jpn: 'Japonais', zho: 'Chinois', kor: 'Coréen', ara: 'Arabe',
  hin: 'Hindi', tur: 'Turc', pol: 'Polonais', swe: 'Suédois',
  dan: 'Danois', nor: 'Norvégien', fin: 'Finnois', ces: 'Tchèque',
  ron: 'Roumain', hun: 'Hongrois', ell: 'Grec', heb: 'Hébreu',
  tha: 'Thaï', vie: 'Vietnamien', ind: 'Indonésien', msa: 'Malais',
};

function analyzeConfig($) {
  const checks = [];

  // HTML lang attribute
  const htmlLang = $('html').attr('lang');
  checks.push({
    name: 'Attribut lang sur <html>',
    status: htmlLang ? 'success' : 'error',
    value: htmlLang || 'Absent',
    detail: htmlLang ? `Langue déclarée : ${htmlLang}` : 'Pas d\'attribut lang sur la balise html',
    recommendation: !htmlLang
      ? 'Ajoutez lang="fr" (ou la langue appropriée) sur la balise <html>'
      : null,
  });

  // Hreflang tags
  const hreflangs = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    hreflangs.push({
      lang: $(el).attr('hreflang'),
      href: $(el).attr('href'),
    });
  });
  checks.push({
    name: 'Balises hreflang',
    status: hreflangs.length > 1 ? 'success' : hreflangs.length === 1 ? 'warning' : 'error',
    value: `${hreflangs.length} langue(s)`,
    detail: hreflangs.length > 0
      ? `Langues : ${hreflangs.map((h) => h.lang).join(', ')}`
      : 'Aucune balise hreflang trouvée',
    recommendation: hreflangs.length === 0
      ? 'Ajoutez des balises <link rel="alternate" hreflang="xx"> pour chaque version linguistique'
      : null,
  });

  // x-default
  const hasXDefault = hreflangs.some((h) => h.lang === 'x-default');
  checks.push({
    name: 'Langue par défaut (x-default)',
    status: hreflangs.length === 0 ? 'warning' : hasXDefault ? 'success' : 'error',
    value: hasXDefault ? 'Présent' : 'Absent',
    detail: hasXDefault
      ? 'x-default est déclaré'
      : hreflangs.length === 0
        ? 'Pas de hreflang, x-default non applicable'
        : 'x-default manquant dans les hreflang',
    recommendation: !hasXDefault && hreflangs.length > 0
      ? 'Ajoutez hreflang="x-default" pour la version par défaut du site'
      : null,
  });

  // Meta content-language
  const contentLang = $('meta[http-equiv="content-language"]').attr('content');
  checks.push({
    name: 'Meta content-language',
    status: contentLang ? 'success' : 'warning',
    value: contentLang || 'Absente',
    detail: contentLang ? `Content-Language : ${contentLang}` : 'Pas de meta content-language',
    recommendation: !contentLang
      ? 'Ajoutez <meta http-equiv="content-language" content="fr"> (optionnel si lang est présent)'
      : null,
  });

  // URL structure for i18n
  const urlStr = $('link[rel="alternate"][hreflang]').first().attr('href') || '';
  let structure = 'Non détectée';
  if (urlStr.match(/^https?:\/\/[a-z]{2}\./)) structure = 'Sous-domaine (fr.site.com)';
  else if (urlStr.match(/\/[a-z]{2}(\/|$)/)) structure = 'Sous-dossier (/fr/)';
  else if (urlStr.match(/[?&]lang=/)) structure = 'Paramètre (?lang=fr)';

  checks.push({
    name: 'Structure URL multilingue',
    status: hreflangs.length > 0 ? 'success' : 'warning',
    value: structure,
    detail: `Structure détectée : ${structure}`,
    recommendation: structure === 'Non détectée' && hreflangs.length === 0
      ? 'Utilisez des sous-dossiers (/fr/, /en/) pour une structure multilingue claire'
      : null,
  });

  return {
    name: 'Configuration technique i18n',
    checks,
    score: calculateCategoryScore(checks),
  };
}

async function analyzeLangues($, url) {
  const checks = [];

  const hreflangs = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    hreflangs.push({
      lang: $(el).attr('hreflang'),
      href: $(el).attr('href'),
    });
  });

  if (hreflangs.length === 0) {
    checks.push({
      name: 'Versions linguistiques',
      status: 'error',
      value: 'Aucune trouvée',
      detail: 'Aucune version alternative détectée via hreflang',
      recommendation: 'Ajoutez des balises hreflang pour déclarer les versions linguistiques',
    });
    return { name: 'Détection des langues', checks, score: 0 };
  }

  // Check each alternate URL
  for (const alt of hreflangs.filter((h) => h.lang !== 'x-default').slice(0, 10)) {
    try {
      const res = await fetch(alt.href, {
        headers: { 'User-Agent': 'AnalyseSite/1.0' },
        redirect: 'follow',
      });
      if (res.ok) {
        checks.push({
          name: `Version ${alt.lang}`,
          status: 'success',
          value: 'Accessible',
          detail: `${alt.href} — HTTP ${res.status}`,
          recommendation: null,
        });
      } else {
        checks.push({
          name: `Version ${alt.lang}`,
          status: 'error',
          value: `HTTP ${res.status}`,
          detail: `${alt.href} — Erreur ${res.status}`,
          recommendation: `La page ${alt.lang} retourne une erreur. Vérifiez l'URL.`,
        });
      }
    } catch {
      checks.push({
        name: `Version ${alt.lang}`,
        status: 'error',
        value: 'Inaccessible',
        detail: `${alt.href} — Impossible à atteindre`,
        recommendation: `Vérifiez que l'URL de la version ${alt.lang} est correcte`,
      });
    }
  }

  return {
    name: 'Détection des langues',
    checks,
    score: calculateCategoryScore(checks),
  };
}

async function analyzeCouverture($, url) {
  const checks = [];
  const baseUrl = new URL(url);

  // 1. Detect declared languages from hreflang
  const declaredLangs = new Set();
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang')?.toLowerCase();
    if (lang && lang !== 'x-default') declaredLangs.add(lang);
  });

  if (declaredLangs.size < 2) {
    checks.push({
      name: 'Couverture des traductions',
      status: 'warning',
      value: 'Non analysable',
      detail: declaredLangs.size === 0
        ? 'Aucune langue alternative détectée via hreflang'
        : 'Une seule langue détectée — pas de comparaison possible',
      recommendation: 'Configurez plusieurs langues (Shopify Markets) pour activer cette analyse',
    });
    return { name: 'Couverture des traductions', checks, score: declaredLangs.size === 0 ? 0 : 50 };
  }

  const langs = [...declaredLangs].sort();

  // Group regional variants by base language (e.g., de-de, en-de → de, en)
  // Shopify Markets creates variants like fr-de (French for Germany market)
  // that share the same translation as the base language (fr)
  const getBaseLang = (lang) => lang.split('-')[0];
  const baseLangsSet = new Set(langs.map(getBaseLang));
  const baseLangs = [...baseLangsSet].sort();
  const langVariants = {};
  for (const lang of langs) {
    const base = getBaseLang(lang);
    if (!langVariants[base]) langVariants[base] = [];
    langVariants[base].push(lang);
  }
  const hasRegionalVariants = langs.length > baseLangs.length;

  // Detect default language (no URL prefix) from <html lang> or x-default
  const htmlLang = $('html').attr('lang')?.toLowerCase();
  const xDefaultHref = $('link[rel="alternate"][hreflang="x-default"]').attr('href');
  let defaultLang = null;
  if (htmlLang) {
    // Match html lang (e.g. "de", "de-DE") to one of the declared langs
    defaultLang = langs.find((l) => l === htmlLang || l.startsWith(htmlLang) || htmlLang.startsWith(l));
  }
  if (!defaultLang && xDefaultHref) {
    // Try to detect from x-default URL (the one without lang prefix)
    try {
      const xPath = new URL(xDefaultHref).pathname;
      const xMatch = xPath.match(/^\/([a-z]{2}(?:-[a-z]{2,})?)(\/|$)/i);
      if (xMatch) defaultLang = xMatch[1].toLowerCase();
    } catch { /* ignore */ }
  }

  checks.push({
    name: 'Langues détectées',
    status: 'success',
    value: hasRegionalVariants ? `${baseLangs.length} langues (${langs.length} avec variantes)` : `${langs.length} langues`,
    detail: `Langues : ${baseLangs.join(', ')}${hasRegionalVariants ? ` | Variantes régionales ignorées : ${langs.filter((l) => l.includes('-')).join(', ')} (même traduction que la langue de base)` : ''}${defaultLang ? ` | Langue par défaut : ${defaultLang}` : ''}`,
    recommendation: null,
  });

  // 1b. Direct translation check — fetch each language version of THIS page
  const pageAlternates = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang')?.toLowerCase();
    const href = $(el).attr('href');
    if (lang && lang !== 'x-default' && href) {
      const base = getBaseLang(lang);
      if (!pageAlternates.some((a) => a.baseLang === base)) {
        pageAlternates.push({ lang, baseLang: base, href });
      }
    }
  });

  const currentBaseLang = defaultLang ? getBaseLang(defaultLang) : null;

  if (pageAlternates.length > 1 && currentBaseLang) {
    const altToCheck = pageAlternates.filter((a) => a.baseLang !== currentBaseLang);

    const altResults = await Promise.allSettled(
      altToCheck.map(async (alt) => {
        try {
          const res = await fetch(alt.href, {
            headers: { 'User-Agent': 'AnalyseSite/1.0' },
            redirect: 'follow',
          });
          if (!res.ok) return { ...alt, error: `HTTP ${res.status}` };
          const altHtml = await res.text();
          return { ...alt, html: altHtml };
        } catch (e) {
          return { ...alt, error: e.message };
        }
      })
    );

    const pageOk = [];
    const pageIssues = [];

    for (const result of altResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const altData = result.value;

      if (altData.error) {
        pageIssues.push({
          lang: altData.baseLang, element: 'Page inaccessible',
          text: `Erreur : ${altData.error}`, detectedLang: '-',
          fix: `Vérifiez que l'URL ${altData.href} est accessible`,
        });
        continue;
      }

      const $alt = cheerio.load(altData.html);
      const expectedFranc = LANG_TO_FRANC[altData.baseLang];
      if (!expectedFranc) { pageOk.push(altData.baseLang); continue; }

      const elements = [];
      const t = $alt('title').text().trim();
      if (t.length > 15) elements.push({
        name: 'Titre SEO', text: t,
        fix: `Translate & Adapt > langue "${altData.baseLang}" > ce produit > champ "Titre SEO"`,
      });
      const md = $alt('meta[name="description"]').attr('content')?.trim();
      if (md && md.length > 20) elements.push({
        name: 'Meta description', text: md,
        fix: `Translate & Adapt > langue "${altData.baseLang}" > ce produit > champ "Meta description"`,
      });
      const h1 = $alt('h1').first().text().trim();
      if (h1.length > 10) elements.push({
        name: 'Titre principal (H1)', text: h1,
        fix: `Translate & Adapt > langue "${altData.baseLang}" > ce produit > champ "Titre"`,
      });
      const desc = $alt('.product__description, .product-description, [class*="product"] .rte, .rte').first().text().trim();
      if (desc && desc.length > 40) elements.push({
        name: 'Description produit', text: desc,
        fix: `Translate & Adapt > langue "${altData.baseLang}" > ce produit > champ "Description"`,
      });

      let hasIssue = false;
      const issues = [];
      for (const el of elements) {
        const detected = franc(el.text);
        if (detected !== 'und' && detected !== expectedFranc) {
          hasIssue = true;
          issues.push({
            element: el.name, detectedLang: LANG_NAMES[detected] || detected,
            text: el.text.length > 120 ? el.text.substring(0, 120) + '...' : el.text,
            fix: el.fix,
          });
        }
      }

      if (hasIssue) {
        pageIssues.push(...issues.map((issue) => ({ lang: altData.baseLang, ...issue })));
      } else {
        pageOk.push(altData.baseLang);
      }
    }

    if (pageOk.length > 0) {
      checks.push({
        name: 'Traductions de cette page',
        status: pageIssues.length > 0 ? 'warning' : 'success',
        value: `${pageOk.length}/${altToCheck.length} langues OK`,
        detail: `Versions correctement traduites : ${pageOk.join(', ')}`,
        recommendation: null,
      });
    }

    if (pageIssues.length > 0) {
      const grouped = {};
      for (const item of pageIssues) {
        if (!grouped[item.lang]) {
          grouped[item.lang] = {
            title: $('h1').first().text().trim() || 'Cette page',
            path: new URL(url).pathname, lang: item.lang, items: [],
          };
        }
        grouped[item.lang].items.push({
          element: item.element, text: item.text,
          detectedLang: item.detectedLang, fix: item.fix,
        });
      }

      checks.push({
        name: 'Problèmes de traduction (cette page)',
        status: 'error',
        value: `${pageIssues.length} problème(s)`,
        detail: `${pageIssues.length} textes non traduits détectés sur les versions linguistiques de cette page`,
        detailCards: Object.values(grouped),
        recommendation: 'Allez dans Admin > Apps > Translate & Adapt, sélectionnez la langue, puis corrigez les champs indiqués',
      });
    }

    if (pageOk.length === 0 && pageIssues.length === 0) {
      checks.push({
        name: 'Traductions de cette page',
        status: 'warning',
        value: 'Non vérifiable',
        detail: 'Impossible de vérifier les traductions (contenu trop court ou langues non supportées)',
        recommendation: null,
      });
    }
  }

  // 2. Fetch and analyze sitemap index (structure only — no sub-sitemap fetches)
  let sitemapXml;
  try {
    const res = await fetch(`${baseUrl.origin}/sitemap.xml`, {
      headers: { 'User-Agent': 'AnalyseSite/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sitemapXml = await res.text();
  } catch (e) {
    checks.push({
      name: 'Analyse du sitemap',
      status: 'error',
      value: 'Inaccessible',
      detail: `Impossible de lire le sitemap : ${e.message}`,
      recommendation: 'Le sitemap est nécessaire pour analyser la couverture des traductions',
    });
    return { name: 'Couverture des traductions', checks, score: calculateCategoryScore(checks) };
  }

  const $index = cheerio.load(sitemapXml, { xmlMode: true });
  const subSitemaps = [];
  $index('sitemap loc').each((_, el) => {
    subSitemaps.push($index(el).text().trim());
  });

  // 3. Analyze sitemap structure — group by content type × base language
  const typeLabels = { products: 'Produits', pages: 'Pages', collections: 'Collections', blogs: 'Blog' };
  const sitemapMatrix = {}; // type -> Set of base langs

  for (const smUrl of subSitemaps) {
    try {
      const smPath = new URL(smUrl).pathname;
      let type = null;
      for (const t of Object.keys(typeLabels)) {
        if (smPath.includes(`sitemap_${t}`)) { type = t; break; }
      }
      if (!type) continue;

      const langMatch = smPath.match(/^\/([a-z]{2}(?:-[a-z]{2,})?)\/sitemap_/i);
      const lang = langMatch ? getBaseLang(langMatch[1].toLowerCase()) : (currentBaseLang || 'default');

      if (!sitemapMatrix[type]) sitemapMatrix[type] = new Set();
      sitemapMatrix[type].add(lang);
    } catch { /* ignore */ }
  }

  // 4. Report sitemap coverage per content type
  const allTypesFullyCovered = Object.keys(typeLabels).every((type) => {
    const langSet = sitemapMatrix[type];
    return langSet && baseLangs.every((lang) => langSet.has(lang));
  });

  for (const [type, label] of Object.entries(typeLabels)) {
    const langSet = sitemapMatrix[type] || new Set();
    const coveredLangs = baseLangs.filter((l) => langSet.has(l));
    const missingLangs = baseLangs.filter((l) => !langSet.has(l));

    checks.push({
      name: `Sitemap ${label}`,
      status: missingLangs.length === 0 ? 'success' : 'error',
      value: `${coveredLangs.length}/${baseLangs.length} langues`,
      detail: missingLangs.length === 0
        ? `Sitemap présent pour toutes les langues : ${coveredLangs.join(', ')}`
        : `Sitemaps manquants pour : ${missingLangs.join(', ')}`,
      recommendation: missingLangs.length > 0
        ? `Activez les langues manquantes dans Admin > Paramètres > Marchés pour ${label.toLowerCase()}`
        : null,
    });
  }

  // 5. Fetch default product sitemap for page count + product list (for deep scan)
  const defaultProductSm = subSitemaps.find((u) => {
    const p = new URL(u).pathname;
    return p.includes('sitemap_products') && !p.match(/^\/[a-z]{2}(-[a-z]{2,})?\//i);
  });

  const productPaths = [];
  if (defaultProductSm) {
    try {
      const res = await fetch(defaultProductSm, {
        headers: { 'User-Agent': 'AnalyseSite/1.0' },
      });
      if (res.ok) {
        const xml = await res.text();
        const $sm = cheerio.load(xml, { xmlMode: true });
        $sm('url').each((_, urlEl) => {
          const loc = $sm(urlEl).find('loc').first().text().trim();
          if (!loc) return;
          try {
            const p = new URL(loc).pathname;
            if (p.includes('/products/')) {
              const imageTitle = $sm(urlEl).find('image\\:title').first().text().trim();
              const slug = p.split('/').filter(Boolean).pop() || '';
              const title = imageTitle || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              productPaths.push({ path: p, title });
            }
          } catch { /* skip */ }
        });
      }
    } catch { /* skip */ }
  }

  // 6. Couverture globale
  if (allTypesFullyCovered) {
    checks.push({
      name: 'Couverture globale',
      status: 'success',
      value: '100%',
      detail: `Toutes les pages sont accessibles dans les ${baseLangs.length} langues (${baseLangs.join(', ')})${productPaths.length > 0 ? ` — ${productPaths.length} produits détectés` : ''}`,
      recommendation: null,
    });
  } else {
    const coveredTypes = Object.keys(typeLabels).filter((type) => {
      const langSet = sitemapMatrix[type];
      return langSet && baseLangs.every((lang) => langSet.has(lang));
    });
    const percent = Math.round((coveredTypes.length / Object.keys(typeLabels).length) * 100);
    checks.push({
      name: 'Couverture globale',
      status: percent >= 75 ? 'warning' : 'error',
      value: `${percent}%`,
      detail: `${coveredTypes.length}/${Object.keys(typeLabels).length} types de contenu entièrement couverts`,
      recommendation: 'Certains types de contenu n\'ont pas de sitemap pour toutes les langues',
    });
  }

  // 7. Deep scan — fetch sample product pages and verify actual translation quality
  const SAMPLE_SIZE = 10;
  const MAX_LANGS_CHECK = 4;

  const pageSample = productPaths.slice(0, SAMPLE_SIZE);
  const langsToScan = baseLangs
    .filter((l) => l !== currentBaseLang)
    .slice(0, MAX_LANGS_CHECK);

  if (pageSample.length > 0 && langsToScan.length > 0) {
    const fetchTasks = [];
    for (const page of pageSample) {
      for (const lang of langsToScan) {
        fetchTasks.push({
          path: page.path,
          lang,
          url: `${baseUrl.origin}/${lang}${page.path}`,
          title: page.title,
        });
      }
    }

    const fetchResults = await Promise.allSettled(
      fetchTasks.map(async (task) => {
        try {
          const res = await fetch(task.url, {
            headers: { 'User-Agent': 'AnalyseSite/1.0' },
            redirect: 'follow',
          });
          if (!res.ok) return null;
          const taskHtml = await res.text();
          return { ...task, html: taskHtml };
        } catch {
          return null;
        }
      })
    );

    const untranslated = [];

    for (const result of fetchResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { path, lang, title, html: fetchedHtml } = result.value;

      const $page = cheerio.load(fetchedHtml);
      const expectedFranc = LANG_TO_FRANC[lang];
      if (!expectedFranc) continue;

      const elements = [];

      const pageTitle = $page('title').text().trim();
      if (pageTitle.length > 15) elements.push({
        name: 'Titre SEO',
        text: pageTitle,
        fix: `Translate & Adapt > langue "${lang}" > ce produit > champ "Titre SEO"`,
      });

      const metaDesc = $page('meta[name="description"]').attr('content')?.trim();
      if (metaDesc && metaDesc.length > 20) elements.push({
        name: 'Meta description',
        text: metaDesc,
        fix: `Translate & Adapt > langue "${lang}" > ce produit > champ "Meta description"`,
      });

      const h1Text = $page('h1').first().text().trim();
      if (h1Text.length > 10) elements.push({
        name: 'Titre principal (H1)',
        text: h1Text,
        fix: `Translate & Adapt > langue "${lang}" > ce produit > champ "Titre"`,
      });

      const productDesc = $page('.product__description, .product-description, [class*="product"] .rte, .rte').first().text().trim();
      if (productDesc && productDesc.length > 40) elements.push({
        name: 'Description produit',
        text: productDesc,
        fix: `Translate & Adapt > langue "${lang}" > ce produit > champ "Description"`,
      });

      for (const el of elements) {
        const detected = franc(el.text);
        if (detected !== 'und' && detected !== expectedFranc) {
          untranslated.push({
            title, path, lang,
            element: el.name,
            text: el.text.length > 120 ? el.text.substring(0, 120) + '...' : el.text,
            detectedLang: LANG_NAMES[detected] || detected,
            fix: el.fix,
          });
        }
      }
    }

    if (untranslated.length > 0) {
      const grouped = {};
      for (const item of untranslated) {
        const key = `${item.path}__${item.lang}`;
        if (!grouped[key]) {
          grouped[key] = { title: item.title, path: item.path, lang: item.lang, items: [] };
        }
        grouped[key].items.push({
          element: item.element, text: item.text,
          detectedLang: item.detectedLang, fix: item.fix,
        });
      }

      checks.push({
        name: 'Contenu non traduit détecté (échantillon)',
        status: 'error',
        value: `${untranslated.length} texte(s)`,
        detail: `${untranslated.length} textes non traduits trouvés sur ${pageSample.length} produits × ${langsToScan.length} langues vérifiées (${langsToScan.join(', ')})`,
        detailCards: Object.values(grouped),
        recommendation: 'Pour chaque texte, allez dans Admin > Apps > Translate & Adapt, sélectionnez la langue, puis corrigez le champ indiqué',
      });
    } else {
      checks.push({
        name: 'Qualité des traductions (échantillon)',
        status: 'success',
        value: 'OK',
        detail: `${pageSample.length} produits × ${langsToScan.length} langues vérifiés — le contenu semble correctement traduit`,
        recommendation: null,
      });
    }
  }

  return {
    name: 'Couverture des traductions',
    checks,
    score: calculateCategoryScore(checks),
  };
}

function analyzeQualite($) {
  const checks = [];

  // Detect actual language vs declared
  const htmlLang = $('html').attr('lang')?.substring(0, 2)?.toLowerCase();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  if (bodyText.length > 50) {
    const detectedLang = franc(bodyText);
    const langName = LANG_NAMES[detectedLang] || detectedLang;

    // Map html lang to franc codes
    const langMap = {
      fr: 'fra', en: 'eng', es: 'spa', de: 'deu', it: 'ita',
      pt: 'por', nl: 'nld', ru: 'rus', ja: 'jpn', zh: 'zho',
      ko: 'kor', ar: 'ara', hi: 'hin', tr: 'tur', pl: 'pol',
    };
    const expectedCode = langMap[htmlLang];
    const matches = expectedCode === detectedLang;

    checks.push({
      name: 'Cohérence langue déclarée/contenu',
      status: !htmlLang ? 'warning' : matches ? 'success' : 'warning',
      value: matches ? 'Cohérent' : 'Possible incohérence',
      detail: `Déclarée : ${htmlLang || 'non définie'} | Détectée : ${langName}`,
      recommendation: !matches && htmlLang
        ? `La langue détectée (${langName}) ne correspond pas à la langue déclarée (${htmlLang})`
        : null,
    });
  }

  // Check alt attributes for translation
  const images = $('img[alt]');
  let altLangIssues = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt')?.trim();
    if (alt && alt.length > 10) {
      const altLang = franc(alt);
      const htmlLangCode = { fr: 'fra', en: 'eng', es: 'spa', de: 'deu', it: 'ita' }[htmlLang];
      if (htmlLangCode && altLang !== htmlLangCode && altLang !== 'und') {
        altLangIssues++;
      }
    }
  });
  checks.push({
    name: 'Traduction des attributs alt',
    status: altLangIssues === 0 ? 'success' : 'warning',
    value: altLangIssues === 0 ? 'OK' : `${altLangIssues} problème(s)`,
    detail: altLangIssues === 0
      ? 'Tous les alt semblent dans la bonne langue'
      : `${altLangIssues} attribut(s) alt possiblement non traduit(s)`,
    recommendation: altLangIssues > 0
      ? 'Vérifiez que les attributs alt des images sont traduits dans la langue de la page'
      : null,
  });

  // Check for Lorem Ipsum
  const hasLorem = bodyText.toLowerCase().includes('lorem ipsum');
  checks.push({
    name: 'Texte placeholder (Lorem Ipsum)',
    status: hasLorem ? 'error' : 'success',
    value: hasLorem ? 'Détecté' : 'Aucun',
    detail: hasLorem ? 'Du texte Lorem Ipsum a été trouvé sur la page' : 'Pas de texte placeholder détecté',
    recommendation: hasLorem ? 'Remplacez tout le texte Lorem Ipsum par du contenu réel' : null,
  });

  // Meta description translated
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc && htmlLang) {
    const metaLang = franc(metaDesc);
    const htmlLangCode = { fr: 'fra', en: 'eng', es: 'spa', de: 'deu', it: 'ita' }[htmlLang];
    const metaMatches = !htmlLangCode || metaLang === htmlLangCode || metaLang === 'und';
    checks.push({
      name: 'Meta description traduite',
      status: metaMatches ? 'success' : 'warning',
      value: metaMatches ? 'OK' : 'Possible problème',
      detail: metaMatches
        ? 'La meta description semble dans la bonne langue'
        : 'La meta description pourrait ne pas être traduite',
      recommendation: !metaMatches
        ? 'Vérifiez que la meta description est traduite dans la langue de la page'
        : null,
    });
  }

  return {
    name: 'Qualité des traductions',
    checks,
    score: calculateCategoryScore(checks),
  };
}

const FIX_ACTIONS = {
  'Attribut lang sur <html>': { id: 'i18n-html-lang', label: 'Ajouter lang dynamique sur <html>' },
  'Balises hreflang': { id: 'i18n-hreflang', label: 'Ajouter les balises hreflang dynamiques' },
  'Meta content-language': { id: 'i18n-content-language', label: 'Ajouter la meta content-language' },
};

const SHOPIFY_FIXES = {
  'Attribut lang sur <html>': 'Modifier le code > theme.liquid > Vérifiez que <html> a lang="{{ request.locale.iso_code }}". Automatique avec Shopify Markets.',
  'Balises hreflang': 'Activez Shopify Markets : Admin > Paramètres > Marchés. Les hreflang sont générés automatiquement pour chaque marché/langue.',
  'Langue par défaut (x-default)': 'Avec Shopify Markets activé, le x-default est géré automatiquement. Sinon : Modifier le code > theme.liquid > ajoutez le hreflang x-default dans le <head>.',
  'Meta content-language': 'Modifier le code > theme.liquid > Ajoutez <meta http-equiv="content-language" content="{{ request.locale.iso_code }}"> dans le <head>.',
  'Structure URL multilingue': 'Activez Shopify Markets : Admin > Paramètres > Marchés. Shopify crée automatiquement les sous-dossiers /fr/, /en/, etc.',
  'Versions linguistiques': 'Admin > Paramètres > Marchés > Ajoutez des marchés avec leurs langues. Installez l\'app "Translate & Adapt" pour traduire.',
  'Cohérence langue déclarée/contenu': 'Vérifiez vos traductions : Admin > Apps > Translate & Adapt. Assurez-vous que tout le contenu est traduit.',
  'Traduction des attributs alt': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue > Produits > Vérifiez les textes alternatifs des images.',
  'Texte placeholder (Lorem Ipsum)': 'Recherchez "Lorem Ipsum" dans vos pages et descriptions produits : Admin > Pages et Admin > Produits.',
  'Meta description traduite': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue > Vérifiez les meta descriptions dans la section SEO.',
  'Couverture des traductions': 'Admin > Paramètres > Marchés > Configurez plusieurs langues pour activer l\'analyse de couverture.',
  'Analyse du sitemap': 'Vérifiez que votre sitemap est accessible : votreSite.com/sitemap.xml. Shopify le génère automatiquement.',
  'Pages multilingues dans le sitemap': 'Activez Shopify Markets : Admin > Paramètres > Marchés. Le sitemap inclura automatiquement toutes les versions linguistiques.',
  'Couverture globale': 'Admin > Apps > Translate & Adapt > Vérifiez le statut de traduction pour chaque langue. Les pages non traduites y sont listées.',
};

const VERSION_FIX = 'Vérifiez l\'URL de cette version linguistique dans Admin > Paramètres > Marchés. Assurez-vous que le marché et la langue sont bien configurés.';

const TYPE_SHOPIFY_FIXES = {
  'Produits non traduits': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue > Onglet "Produits". Chaque produit listé doit être traduit individuellement.',
  'Collections non traduits': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue > Onglet "Collections". Traduisez le titre et la description de chaque collection.',
  'Pages non traduits': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue > Onglet "Pages". Traduisez le contenu complet de chaque page.',
  'Blog non traduits': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue > Onglet "Articles de blog". Traduisez chaque article.',
  'Autres pages non traduits': 'Admin > Apps > Translate & Adapt > Vérifiez les contenus non traduits dans chaque section pour cette langue.',
  'Contenu non traduit détecté': 'Admin > Apps > Translate & Adapt > Sélectionnez la langue concernée. Pour chaque page listée, vérifiez et corrigez le titre, la description et le contenu.',
};

function applyShopifyFixes(results) {
  for (const category of Object.values(results.categories)) {
    for (const check of category.checks) {
      if (check.recommendation) {
        if (SHOPIFY_FIXES[check.name]) {
          check.shopifyFix = SHOPIFY_FIXES[check.name];
        } else if (check.name.startsWith('Version ')) {
          check.shopifyFix = VERSION_FIX;
        } else if (TYPE_SHOPIFY_FIXES[check.name]) {
          check.shopifyFix = TYPE_SHOPIFY_FIXES[check.name];
        }
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
