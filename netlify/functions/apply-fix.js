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
    const { fixId, store, accessToken, clientId, clientSecret, siteUrl, authorName, customSnippet } = JSON.parse(event.body);

    if (!fixId || !store || (!accessToken && (!clientId || !clientSecret))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Paramètres manquants : fixId, store, et accessToken (ou clientId+clientSecret) requis' }),
      };
    }

    const token = accessToken || await getShopifyToken(store, clientId, clientSecret);
    const themeId = await getActiveThemeId(store, token);

    const ctx = { store, token, themeId, siteUrl, authorName, customSnippet };
    const result = await executeFix(fixId, ctx);

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// ── Shopify Auth (Client Credentials) ──

async function getShopifyToken(store, clientId, clientSecret) {
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    const error = new Error(`Authentification Shopify échouée : ${err}`);
    error.statusCode = 401;
    throw error;
  }

  const data = await res.json();
  return data.access_token;
}

// ── Shopify API helpers ──

async function getActiveThemeId(store, token) {
  const res = await shopifyFetch(store, token, '/admin/api/2024-01/themes.json');
  if (!res.ok) {
    const err = await res.text();
    const error = new Error(`Erreur API Shopify (${res.status}): ${err}`);
    error.statusCode = res.status;
    throw error;
  }
  const data = await res.json();
  const main = data.themes.find((t) => t.role === 'main');
  if (!main) throw new Error('Thème principal introuvable');
  return main.id;
}

async function getAsset(store, token, themeId, key) {
  const res = await shopifyFetch(
    store, token,
    `/admin/api/2024-01/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.asset;
}

async function putAsset(store, token, themeId, key, value) {
  const res = await shopifyFetch(store, token, `/admin/api/2024-01/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur PUT asset ${key} : ${err}`);
  }
  return res.json();
}

async function createRedirect(store, token, path, target) {
  // Check if redirect already exists
  const listRes = await shopifyFetch(store, token, `/admin/api/2024-01/redirects.json?path=${encodeURIComponent(path)}`);
  if (listRes.ok) {
    const data = await listRes.json();
    if (data.redirects && data.redirects.length > 0) {
      return data.redirects[0]; // Already exists
    }
  }

  const res = await shopifyFetch(store, token, '/admin/api/2024-01/redirects.json', {
    method: 'POST',
    body: JSON.stringify({ redirect: { path, target } }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur création redirect ${path} : ${err}`);
  }
  return res.json();
}

async function shopifyFetch(store, token, endpoint, options = {}) {
  return fetch(`https://${store}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...options.headers,
    },
    body: options.body,
  });
}

// ── Fix dispatcher ──

async function executeFix(fixId, ctx) {
  const handlers = {
    'robots-txt-ai': fixRobotsTxt,
    'llms-txt': fixLlmsTxt,
    'llms-full-txt': fixLlmsFullTxt,
    'meta-author': fixMetaAuthor,
    'seo-canonical': fixCanonical,
    'seo-open-graph': fixOpenGraph,
    'seo-twitter-card': fixTwitterCard,
    'seo-json-ld': fixJsonLd,
    'seo-json-ld-geo': fixJsonLdGeo,
    'seo-meta-keywords': fixMetaKeywords,
    'seo-lazy-loading': fixLazyLoading,
    'ai-date-publication': fixDatePublication,
    'ai-semantic-html': fixSemanticHtml,
    'ai-faq-schema': fixFaqSchema,
    'ai-plugin-json': fixAiPluginJson,
    'i18n-html-lang': fixHtmlLang,
    'i18n-hreflang': fixHreflang,
    'i18n-content-language': fixContentLanguage,
    'geo-multisite-canonical': fixMultisiteCanonical,
    'geo-seo-content': fixSeoContent,
    'geo-blog-content': fixBlogContent,
  };

  const handler = handlers[fixId];
  if (!handler) {
    const error = new Error(`Fix inconnu : ${fixId}`);
    error.statusCode = 400;
    throw error;
  }

  return handler(ctx);
}

// ── Fix handlers ──

async function fixRobotsTxt(ctx) {
  const { store, token, themeId } = ctx;

  const existing = await getAsset(store, token, themeId, 'templates/robots.txt.liquid');

  const aiBots = [
    'GPTBot',
    'OAI-SearchBot',
    'Google-Extended',
    'ChatGPT-User',
    'PerplexityBot',
    'ClaudeBot',
    'Bytespider',
    'Amazonbot',
    'Applebot-Extended',
    'meta-externalagent',
    'CCBot',
    'cohere-ai',
    'anthropic-ai',
  ];

  if (existing && existing.value) {
    // Check which bots are already mentioned
    const content = existing.value;
    const missingBots = aiBots.filter(
      (bot) => !content.toLowerCase().includes(bot.toLowerCase())
    );

    if (missingBots.length === 0) {
      return { success: true, fixId: 'robots-txt-ai', message: 'Tous les bots IA sont déjà mentionnés dans robots.txt' };
    }

    // Append rules for missing bots
    const newRules = missingBots
      .map((bot) => `User-agent: ${bot}\nAllow: /`)
      .join('\n\n');

    const updatedContent = content.trimEnd() + '\n\n# IA Bots (ajouté par Analyse Site)\n' + newRules + '\n';
    await putAsset(store, token, themeId, 'templates/robots.txt.liquid', updatedContent);
  } else {
    // Create new robots.txt.liquid with Shopify defaults + AI bots
    const content = `{% comment %}
  Shopify robots.txt - Généré par Analyse Site
{% endcomment %}
Sitemap: {{ shop.url }}/sitemap.xml

User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account
Disallow: /*?*variant=*
Disallow: /*?*discount=*
Disallow: /*?*preview_theme_id*

# IA Bots - Autorisés explicitement
${aiBots.map((bot) => `User-agent: ${bot}\nAllow: /`).join('\n\n')}
`;
    await putAsset(store, token, themeId, 'templates/robots.txt.liquid', content);
  }

  return { success: true, fixId: 'robots-txt-ai', message: 'robots.txt mis à jour avec les règles pour les bots IA' };
}

async function fixLlmsTxt(ctx) {
  const { store, token, themeId, siteUrl } = ctx;
  const baseUrl = siteUrl ? new URL(siteUrl) : null;
  const siteName = baseUrl ? baseUrl.hostname.replace('www.', '') : store.replace('.myshopify.com', '');

  const content = `# ${siteName}
> Boutique en ligne

## À propos
Bienvenue sur ${siteName}. Ce fichier aide les grands modèles de langage (LLM) à comprendre notre site.

## Pages principales
- [Accueil](${siteUrl || `https://${store}`})
- [Produits](${siteUrl || `https://${store}`}/collections/all)
- [À propos](${siteUrl || `https://${store}`}/pages/about)
- [Contact](${siteUrl || `https://${store}`}/pages/contact)

## Informations complémentaires
Pour plus de détails, consultez /llms-full.txt
`;

  await putAsset(store, token, themeId, 'assets/llms.txt', content);
  await createRedirect(store, token, '/llms.txt', '/cdn/shop/files/llms.txt');

  return { success: true, fixId: 'llms-txt', message: 'llms.txt créé et redirect configuré' };
}

async function fixLlmsFullTxt(ctx) {
  const { store, token, themeId, siteUrl } = ctx;
  const baseUrl = siteUrl ? new URL(siteUrl) : null;
  const siteName = baseUrl ? baseUrl.hostname.replace('www.', '') : store.replace('.myshopify.com', '');

  const content = `# ${siteName} - Informations complètes
> Boutique en ligne - Guide détaillé pour les LLM

## À propos de ${siteName}
${siteName} est une boutique en ligne. Ce fichier fournit des informations détaillées pour aider les grands modèles de langage à comprendre et référencer correctement notre contenu.

## Structure du site
### Pages principales
- Accueil : ${siteUrl || `https://${store}`}
- Catalogue : ${siteUrl || `https://${store}`}/collections/all
- À propos : ${siteUrl || `https://${store}`}/pages/about
- Contact : ${siteUrl || `https://${store}`}/pages/contact

### Ressources
- Sitemap : ${siteUrl || `https://${store}`}/sitemap.xml
- Fichier llms.txt : ${siteUrl || `https://${store}`}/llms.txt

## Comment citer ce site
Veuillez citer notre contenu en incluant le nom du site (${siteName}) et l'URL de la page source.

## Politique de crawling
Nous accueillons les bots IA. Consultez notre robots.txt pour les détails.
`;

  await putAsset(store, token, themeId, 'assets/llms-full.txt', content);
  await createRedirect(store, token, '/llms-full.txt', '/cdn/shop/files/llms-full.txt');

  return { success: true, fixId: 'llms-full-txt', message: 'llms-full.txt créé et redirect configuré' };
}

async function fixMetaAuthor(ctx) {
  const { store, token, themeId, authorName } = ctx;

  if (!authorName) {
    const error = new Error('Nom d\'auteur requis (authorName). Configurez-le dans les paramètres Shopify.');
    error.statusCode = 400;
    throw error;
  }

  const asset = await getAsset(store, token, themeId, 'layout/theme.liquid');
  if (!asset || !asset.value) {
    throw new Error('Impossible de lire layout/theme.liquid');
  }

  let content = asset.value;

  // Check if meta author already exists
  if (content.includes('meta name="author"')) {
    return { success: true, fixId: 'meta-author', message: 'La balise meta author existe déjà' };
  }

  // Inject before </head>
  const metaTag = `  <meta name="author" content="${authorName}">\n`;
  content = content.replace('</head>', metaTag + '</head>');

  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'meta-author', message: `Meta author "${authorName}" ajouté dans theme.liquid` };
}

// ── Helper: inject before </head> ──

function injectBeforeHeadClose(content, snippet) {
  if (!content.includes('</head>')) {
    throw new Error('Balise </head> introuvable dans theme.liquid');
  }
  return content.replace('</head>', snippet + '\n</head>');
}

async function getThemeLiquid(store, token, themeId) {
  const asset = await getAsset(store, token, themeId, 'layout/theme.liquid');
  if (!asset || !asset.value) {
    throw new Error('Impossible de lire layout/theme.liquid');
  }
  return asset.value;
}

// ── SEO Fix handlers ──

async function fixCanonical(ctx) {
  const { store, token, themeId } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes('canonical')) {
    return { success: true, fixId: 'seo-canonical', message: 'La balise canonical existe déjà dans theme.liquid' };
  }

  const snippet = `  <link rel="canonical" href="{{ canonical_url }}">`;
  content = injectBeforeHeadClose(content, snippet);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'seo-canonical', message: 'Balise canonical ajoutée dans theme.liquid' };
}

async function fixOpenGraph(ctx) {
  const { store, token, themeId } = ctx;

  const ogSnippet = `{%- comment -%} Open Graph meta tags — généré par Analyse Site {%- endcomment -%}
<meta property="og:type" content="{% if template contains 'product' %}product{% elsif template contains 'article' %}article{% else %}website{% endif %}">
<meta property="og:title" content="{{ page_title | escape }}">
<meta property="og:description" content="{{ page_description | escape }}">
<meta property="og:url" content="{{ canonical_url }}">
<meta property="og:site_name" content="{{ shop.name | escape }}">
{%- if page_image -%}
  <meta property="og:image" content="https:{{ page_image | image_url: width: 1200 }}">
  <meta property="og:image:width" content="1200">
{%- endif -%}
`;

  await putAsset(store, token, themeId, 'snippets/og-meta.liquid', ogSnippet);

  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes("render 'og-meta'")) {
    return { success: true, fixId: 'seo-open-graph', message: 'Snippet og-meta déjà inclus dans theme.liquid' };
  }

  const includeTag = `  {% render 'og-meta' %}`;
  content = injectBeforeHeadClose(content, includeTag);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'seo-open-graph', message: 'Balises Open Graph ajoutées (snippet og-meta.liquid + inclusion dans theme.liquid)' };
}

async function fixTwitterCard(ctx) {
  const { store, token, themeId } = ctx;

  const twitterSnippet = `{%- comment -%} Twitter Card meta tags — généré par Analyse Site {%- endcomment -%}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{ page_title | escape }}">
<meta name="twitter:description" content="{{ page_description | escape }}">
{%- if page_image -%}
  <meta name="twitter:image" content="https:{{ page_image | image_url: width: 1200 }}">
{%- endif -%}
`;

  await putAsset(store, token, themeId, 'snippets/twitter-meta.liquid', twitterSnippet);

  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes("render 'twitter-meta'")) {
    return { success: true, fixId: 'seo-twitter-card', message: 'Snippet twitter-meta déjà inclus dans theme.liquid' };
  }

  const includeTag = `  {% render 'twitter-meta' %}`;
  content = injectBeforeHeadClose(content, includeTag);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'seo-twitter-card', message: 'Balises Twitter Card ajoutées (snippet twitter-meta.liquid + inclusion dans theme.liquid)' };
}

async function fixJsonLd(ctx) {
  const { store, token, themeId } = ctx;

  const jsonLdSnippet = `{%- comment -%} Schema.org JSON-LD — généré par Analyse Site {%- endcomment -%}
{%- if template contains 'product' -%}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": {{ product.title | json }},
    "description": {{ product.description | strip_html | json }},
    "url": "{{ canonical_url }}",
    {%- if product.featured_image -%}
    "image": "https:{{ product.featured_image | image_url: width: 1024 }}",
    {%- endif -%}
    "brand": {
      "@type": "Brand",
      "name": {{ product.vendor | json }}
    },
    "offers": {
      "@type": "Offer",
      "url": "{{ canonical_url }}",
      "priceCurrency": {{ cart.currency.iso_code | json }},
      "price": {{ product.selected_or_first_available_variant.price | money_without_currency | json }},
      "availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}"
    }
  }
  </script>
{%- endif -%}

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": {{ shop.name | json }},
  "url": "{{ shop.url }}",
  "logo": "https:{{ shop.brand.logo | image_url: width: 500 }}"
}
</script>

{%- if template contains 'product' -%}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": {{ shop.name | json }},
        "item": "{{ shop.url }}"
      }
      {%- if product.collections.size > 0 -%}
      ,{
        "@type": "ListItem",
        "position": 2,
        "name": {{ product.collections.first.title | json }},
        "item": "{{ shop.url }}/collections/{{ product.collections.first.handle }}"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": {{ product.title | json }},
        "item": "{{ canonical_url }}"
      }
      {%- else -%}
      ,{
        "@type": "ListItem",
        "position": 2,
        "name": {{ product.title | json }},
        "item": "{{ canonical_url }}"
      }
      {%- endif -%}
    ]
  }
  </script>
{%- endif -%}
`;

  await putAsset(store, token, themeId, 'snippets/schema-jsonld.liquid', jsonLdSnippet);

  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes("render 'schema-jsonld'")) {
    return { success: true, fixId: 'seo-json-ld', message: 'Snippet schema-jsonld déjà inclus dans theme.liquid' };
  }

  const includeTag = `  {% render 'schema-jsonld' %}`;
  content = injectBeforeHeadClose(content, includeTag);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'seo-json-ld', message: 'Données structurées JSON-LD ajoutées (snippet schema-jsonld.liquid + inclusion dans theme.liquid)' };
}

async function fixJsonLdGeo(ctx) {
  const { store, token, themeId, customSnippet } = ctx;

  if (!customSnippet) {
    const error = new Error('customSnippet requis pour seo-json-ld-geo');
    error.statusCode = 400;
    throw error;
  }

  // Create the GEO-optimized snippet
  await putAsset(store, token, themeId, 'snippets/schema-jsonld-geo.liquid', customSnippet);

  let content = await getThemeLiquid(store, token, themeId);

  // Remove old basic JSON-LD if present (upgrade)
  if (content.includes("render 'schema-jsonld'")) {
    content = content.replace(/\s*\{%\s*render\s+'schema-jsonld'\s*%\}/g, '');
  }

  // Add new GEO snippet if not already present
  if (!content.includes("render 'schema-jsonld-geo'")) {
    const includeTag = `  {% render 'schema-jsonld-geo' %}`;
    content = injectBeforeHeadClose(content, includeTag);
  }

  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return {
    success: true,
    fixId: 'seo-json-ld-geo',
    message: 'JSON-LD GEO optimise applique (snippet schema-jsonld-geo.liquid). L\'ancien schema-jsonld basique a ete remplace.',
  };
}

// ── Additional SEO Fix handlers ──

async function fixMetaKeywords(ctx) {
  const { store, token, themeId, siteUrl } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes('meta name="keywords"')) {
    return { success: true, fixId: 'seo-meta-keywords', message: 'La balise meta keywords existe déjà dans theme.liquid' };
  }

  const keywordsTag = `  <meta name="keywords" content="{{ page_title | escape }}, {{ shop.name | escape }}">`;
  content = injectBeforeHeadClose(content, keywordsTag);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'seo-meta-keywords', message: 'Meta keywords dynamique ajouté dans theme.liquid' };
}

async function fixLazyLoading(ctx) {
  const { store, token, themeId } = ctx;

  // Create a snippet that adds lazy loading via JS for images missing it
  const lazySnippet = `{%- comment -%} Lazy loading — généré par Analyse Site {%- endcomment -%}
<script>
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('img:not([loading])').forEach(function(img) {
      img.setAttribute('loading', 'lazy');
    });
  });
</script>
`;

  await putAsset(store, token, themeId, 'snippets/lazy-loading.liquid', lazySnippet);

  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes("render 'lazy-loading'")) {
    return { success: true, fixId: 'seo-lazy-loading', message: 'Snippet lazy-loading déjà inclus dans theme.liquid' };
  }

  const includeTag = `  {% render 'lazy-loading' %}`;
  content = content.replace('</body>', includeTag + '\n</body>');
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'seo-lazy-loading', message: 'Lazy loading ajouté (snippet lazy-loading.liquid avant </body>)' };
}

// ── AI Fix handler ──

async function fixDatePublication(ctx) {
  const { store, token, themeId } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes('article:published_time') || content.includes('date-publication')) {
    return { success: true, fixId: 'ai-date-publication', message: 'Les meta de date de publication existent déjà' };
  }

  const dateMeta = `  {%- if article -%}
    <meta property="article:published_time" content="{{ article.published_at | date: '%Y-%m-%dT%H:%M:%S' }}">
    <meta property="article:modified_time" content="{{ article.updated_at | date: '%Y-%m-%dT%H:%M:%S' }}">
  {%- elsif product -%}
    <meta property="article:published_time" content="{{ product.created_at | date: '%Y-%m-%dT%H:%M:%S' }}">
    <meta property="article:modified_time" content="{{ product.updated_at | date: '%Y-%m-%dT%H:%M:%S' }}">
  {%- endif -%}`;
  content = injectBeforeHeadClose(content, dateMeta);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'ai-date-publication', message: 'Meta dates de publication ajoutées (article:published_time + article:modified_time)' };
}

// ── AI Fix handlers (semantic, FAQ, ai-plugin.json) ──

async function fixSemanticHtml(ctx) {
  const { store, token, themeId } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  // Check if <main> already exists
  if (content.includes('<main') && content.includes('</main>')) {
    return { success: true, fixId: 'ai-semantic-html', message: 'La balise <main> existe déjà dans theme.liquid' };
  }

  // Find {{ content_for_layout }} and wrap it with <main>
  if (!content.includes('content_for_layout')) {
    throw new Error('Variable {{ content_for_layout }} introuvable dans theme.liquid');
  }

  // Wrap content_for_layout with <main role="main">
  content = content.replace(
    /(\{\{-?\s*content_for_layout\s*-?\}\})/,
    '<main role="main" aria-label="Contenu principal">\n      $1\n    </main>'
  );

  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'ai-semantic-html', message: 'Balise <main role="main"> ajoutée autour du contenu principal dans theme.liquid' };
}

async function fixFaqSchema(ctx) {
  const { store, token, themeId } = ctx;

  const faqSnippet = `{%- comment -%} FAQ Schema (FAQPage) — généré par Analyse Site {%- endcomment -%}
{%- if template == 'index' or template contains 'page' -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Quels produits proposez-vous ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Découvrez notre catalogue complet sur {{ shop.url }}/collections/all"
      }
    },
    {
      "@type": "Question",
      "name": "Comment passer commande ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ajoutez vos articles au panier puis suivez les étapes de paiement sécurisé."
      }
    },
    {
      "@type": "Question",
      "name": "Quels sont les délais de livraison ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Les délais varient selon votre localisation. Consultez notre page livraison pour plus de détails."
      }
    },
    {
      "@type": "Question",
      "name": "Comment contacter le service client ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Contactez-nous via notre page contact : {{ shop.url }}/pages/contact"
      }
    }
  ]
}
</script>
{%- endif -%}
`;

  await putAsset(store, token, themeId, 'snippets/faq-schema.liquid', faqSnippet);

  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes("render 'faq-schema'")) {
    return { success: true, fixId: 'ai-faq-schema', message: 'Snippet faq-schema déjà inclus dans theme.liquid' };
  }

  const includeTag = `  {% render 'faq-schema' %}`;
  content = injectBeforeHeadClose(content, includeTag);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'ai-faq-schema', message: 'FAQ structurée (FAQPage schema) ajoutée — le cache Shopify peut mettre 1-2 min à se rafraîchir. Personnalisez les questions dans snippets/faq-schema.liquid' };
}

async function fixAiPluginJson(ctx) {
  const { store, token, themeId, siteUrl } = ctx;
  const baseUrl = siteUrl || `https://${store}`;
  const siteName = siteUrl ? new URL(siteUrl).hostname.replace('www.', '') : store.replace('.myshopify.com', '');

  const content = JSON.stringify({
    schema_version: 'v1',
    name_for_human: siteName,
    name_for_model: siteName.replace(/[^a-zA-Z0-9]/g, '_'),
    description_for_human: `Boutique en ligne ${siteName}`,
    description_for_model: `Online store ${siteName}. Browse products, collections, and pages.`,
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: `${baseUrl}/sitemap.xml`,
    },
    logo_url: `${baseUrl}/favicon.ico`,
    contact_email: '',
    legal_info_url: `${baseUrl}/policies/terms-of-service`,
  }, null, 2);

  await putAsset(store, token, themeId, 'assets/ai-plugin.json', content);

  // Shopify ne supporte pas les redirects vers .well-known/
  // On crée le redirect depuis /ai-plugin.json à la place
  const assetUrl = `https://${store}/cdn/shop/t/${themeId}/assets/ai-plugin.json`;
  await createRedirect(store, token, '/ai-plugin.json', assetUrl);

  // Tenter aussi .well-known (peut échouer silencieusement sur Shopify)
  try {
    await createRedirect(store, token, '/.well-known/ai-plugin.json', assetUrl);
  } catch {
    // Attendu — Shopify bloque souvent les chemins .well-known
  }

  return { success: true, fixId: 'ai-plugin-json', message: 'ai-plugin.json créé — accessible via /ai-plugin.json (Shopify bloque .well-known)' };
}

// ── i18n Fix handlers ──

async function fixHtmlLang(ctx) {
  const { store, token, themeId } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  // Check if lang attribute already uses Liquid variable
  if (content.match(/<html[^>]*lang=["']\{\{/)) {
    return { success: true, fixId: 'i18n-html-lang', message: 'L\'attribut lang dynamique existe déjà sur <html>' };
  }

  // Replace <html with or without existing lang attribute
  if (content.match(/<html[^>]*lang=/)) {
    // Replace existing static lang
    content = content.replace(
      /(<html[^>]*?)lang=["'][^"']*["']/,
      '$1lang="{{ request.locale.iso_code }}"'
    );
  } else {
    // Add lang attribute
    content = content.replace(/<html/, '<html lang="{{ request.locale.iso_code }}"');
  }

  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'i18n-html-lang', message: 'Attribut lang="{{ request.locale.iso_code }}" ajouté sur <html>' };
}

async function fixHreflang(ctx) {
  const { store, token, themeId } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes('hreflang') && content.includes('published_locales')) {
    return { success: true, fixId: 'i18n-hreflang', message: 'Les balises hreflang dynamiques existent déjà dans theme.liquid' };
  }

  const snippet = `  {%- comment -%} Hreflang tags — généré par Analyse Site {%- endcomment -%}
  {%- for locale in shop.published_locales -%}
    <link rel="alternate" hreflang="{{ locale.iso_code }}" href="{{ canonical_url | replace: request.locale.iso_code, locale.iso_code }}">
  {%- endfor -%}
  <link rel="alternate" hreflang="x-default" href="{{ canonical_url }}">`;

  content = injectBeforeHeadClose(content, snippet);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'i18n-hreflang', message: 'Balises hreflang dynamiques ajoutées dans theme.liquid (avec x-default)' };
}

async function fixContentLanguage(ctx) {
  const { store, token, themeId } = ctx;
  let content = await getThemeLiquid(store, token, themeId);

  if (content.includes('http-equiv="content-language"')) {
    return { success: true, fixId: 'i18n-content-language', message: 'La meta content-language existe déjà dans theme.liquid' };
  }

  const snippet = `  <meta http-equiv="content-language" content="{{ request.locale.iso_code }}">`;
  content = injectBeforeHeadClose(content, snippet);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'i18n-content-language', message: 'Meta content-language ajoutée dans theme.liquid' };
}

// ── GEO Fix handlers ──

async function fixMultisiteCanonical(ctx) {
  const { store, token, themeId } = ctx;

  const geoCanonicalSnippet = `{%- comment -%} GEO Canonical multisite — généré par Analyse Site {%- endcomment -%}
{%- assign canonical_path = canonical_url | remove: shop.url -%}
<link rel="canonical" href="https://isisingold.com{{ canonical_path }}">
<link rel="alternate" hreflang="fr" href="https://isisingold.com{{ canonical_path }}">
<link rel="alternate" hreflang="fr" href="https://goldy-isis.myshopify.com{{ canonical_path }}">
<link rel="alternate" hreflang="fr" href="https://strass-dentaires.fr{{ canonical_path }}">
<link rel="alternate" hreflang="x-default" href="https://isisingold.com{{ canonical_path }}">
`;

  await putAsset(store, token, themeId, 'snippets/geo-canonical.liquid', geoCanonicalSnippet);

  let content = await getThemeLiquid(store, token, themeId);

  // Supprimer l'ancien canonical Shopify par défaut si présent
  content = content.replace(/\s*<link\s+rel="canonical"\s+href="\{\{[^}]*canonical_url[^}]*\}\}"[^>]*>/g, '');

  if (content.includes("render 'geo-canonical'")) {
    return { success: true, fixId: 'geo-multisite-canonical', message: 'Snippet geo-canonical déjà inclus dans theme.liquid' };
  }

  const includeTag = `  {% render 'geo-canonical' %}`;
  content = injectBeforeHeadClose(content, includeTag);
  await putAsset(store, token, themeId, 'layout/theme.liquid', content);

  return { success: true, fixId: 'geo-multisite-canonical', message: 'Canonical multisite configuré : canonical vers isisingold.com + hreflang cross-domaine (3 sites)' };
}

async function fixSeoContent(ctx) {
  const { store, token, customSnippet } = ctx;

  if (!customSnippet) {
    const error = new Error('customSnippet requis pour geo-seo-content (JSON des produits optimisés)');
    error.statusCode = 400;
    throw error;
  }

  let products;
  try {
    products = JSON.parse(customSnippet);
  } catch {
    const error = new Error('customSnippet invalide : JSON attendu');
    error.statusCode = 400;
    throw error;
  }

  let frSuccess = 0;
  let enSuccess = 0;
  let failCount = 0;
  const errors = [];

  for (const product of products) {
    // 1. Mise à jour FR (langue par défaut) via REST API
    try {
      const fr = product.fr || {};
      const updateData = { product: {} };
      if (fr.meta_title) updateData.product.metafields_global_title_tag = fr.meta_title;
      if (fr.meta_description) updateData.product.metafields_global_description_tag = fr.meta_description;
      if (fr.tags) updateData.product.tags = fr.tags;

      if (Object.keys(updateData.product).length > 0) {
        const res = await shopifyFetch(store, token, `/admin/api/2024-01/products/${product.id}.json`, {
          method: 'PUT',
          body: JSON.stringify(updateData),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`FR produit ${product.id}: ${err}`);
        }
        frSuccess++;
      }
    } catch (err) {
      failCount++;
      errors.push(err.message);
    }

    // 2. Traductions EN via GraphQL Translations API
    const en = product.en;
    if (en) {
      try {
        await registerProductTranslations(store, token, product.id, 'en', en);
        enSuccess++;
      } catch (err) {
        errors.push(`EN produit ${product.id}: ${err.message}`);
      }
    }
  }

  return {
    success: frSuccess > 0 || enSuccess > 0,
    fixId: 'geo-seo-content',
    message: `SEO bilingue : ${frSuccess} FR + ${enSuccess} EN mis à jour, ${failCount} échecs`,
    details: { frSuccess, enSuccess, failCount, errors: errors.slice(0, 5) },
  };
}

// ── Shopify GraphQL Translations ──

async function shopifyGraphQL(store, token, query, variables = {}) {
  const res = await fetch(`https://${store}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GraphQL error (${res.status}): ${err}`);
  }
  return res.json();
}

async function registerProductTranslations(store, token, productId, locale, translations) {
  const gid = `gid://shopify/Product/${productId}`;

  // 1. Récupérer les digests des champs traduisibles
  const digestQuery = `query ($resourceId: ID!) {
    translatableResource(resourceId: $resourceId) {
      translatableContent {
        key
        digest
        locale
      }
    }
  }`;

  const digestResult = await shopifyGraphQL(store, token, digestQuery, { resourceId: gid });
  const contents = digestResult.data?.translatableResource?.translatableContent || [];

  // Map key → digest (pour la locale par défaut)
  const digestMap = {};
  for (const c of contents) {
    digestMap[c.key] = c.digest;
  }

  // 2. Préparer les traductions
  const translationInputs = [];
  if (translations.meta_title && digestMap.meta_title) {
    translationInputs.push({
      key: 'meta_title',
      value: translations.meta_title,
      locale,
      translatableContentDigest: digestMap.meta_title,
    });
  }
  if (translations.meta_description && digestMap.meta_description) {
    translationInputs.push({
      key: 'meta_description',
      value: translations.meta_description,
      locale,
      translatableContentDigest: digestMap.meta_description,
    });
  }

  if (translationInputs.length === 0) return;

  // 3. Enregistrer les traductions
  const registerMutation = `mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        field
        message
      }
      translations {
        key
        value
        locale
      }
    }
  }`;

  const result = await shopifyGraphQL(store, token, registerMutation, {
    resourceId: gid,
    translations: translationInputs,
  });

  const userErrors = result.data?.translationsRegister?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(', '));
  }
}

async function fixBlogContent(ctx) {
  const { store, token, customSnippet } = ctx;

  if (!customSnippet) {
    const error = new Error('customSnippet requis pour geo-blog-content (JSON de l\'article)');
    error.statusCode = 400;
    throw error;
  }

  let article;
  try {
    article = JSON.parse(customSnippet);
  } catch {
    const error = new Error('customSnippet invalide : JSON attendu');
    error.statusCode = 400;
    throw error;
  }

  // Trouver le blog principal
  const blogsRes = await shopifyFetch(store, token, '/admin/api/2024-01/blogs.json');
  if (!blogsRes.ok) {
    const err = await blogsRes.text();
    if (blogsRes.status === 403) {
      const error = new Error('Scope write_content manquant sur l\'app Shopify. Ajoutez ce scope dans les paramètres de l\'app.');
      error.statusCode = 403;
      throw error;
    }
    throw new Error(`Erreur lecture blogs : ${err}`);
  }

  const blogsData = await blogsRes.json();
  const blog = blogsData.blogs?.[0];
  if (!blog) {
    throw new Error('Aucun blog trouvé sur le store Shopify. Créez un blog d\'abord.');
  }

  // Créer l'article en brouillon
  const articleRes = await shopifyFetch(store, token, `/admin/api/2024-01/blogs/${blog.id}/articles.json`, {
    method: 'POST',
    body: JSON.stringify({
      article: {
        title: article.title,
        body_html: article.html_content,
        tags: article.tags || '',
        summary_html: article.meta_description || '',
        published: false,
      },
    }),
  });

  if (!articleRes.ok) {
    const err = await articleRes.text();
    if (articleRes.status === 403) {
      const error = new Error('Scope write_content manquant sur l\'app Shopify. Ajoutez ce scope dans les paramètres de l\'app.');
      error.statusCode = 403;
      throw error;
    }
    throw new Error(`Erreur création article : ${err}`);
  }

  const articleData = await articleRes.json();
  const createdArticle = articleData.article;
  const adminUrl = `https://${store}/admin/articles/${createdArticle.id}`;

  return {
    success: true,
    fixId: 'geo-blog-content',
    message: `Article "${createdArticle.title}" créé en brouillon`,
    details: { articleId: createdArticle.id, adminUrl, blogId: blog.id },
  };
}
