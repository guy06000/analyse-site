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
        qualite: analyzeQualite($),
      },
    };

    results.score = calculateGlobalScore(results.categories);

    return { statusCode: 200, headers, body: JSON.stringify(results) };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Erreur lors de l'analyse : ${error.message}` }),
    };
  }
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

function calculateCategoryScore(checks) {
  if (checks.length === 0) return 0;
  const scores = checks.map((c) => (c.status === 'success' ? 100 : c.status === 'warning' ? 50 : 0));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function calculateGlobalScore(categories) {
  const scores = Object.values(categories).map((c) => c.score);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
