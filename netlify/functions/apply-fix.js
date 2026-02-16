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
    const { fixId, store, accessToken, clientId, clientSecret, siteUrl, authorName } = JSON.parse(event.body);

    if (!fixId || !store || (!accessToken && (!clientId || !clientSecret))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Paramètres manquants : fixId, store, et accessToken (ou clientId+clientSecret) requis' }),
      };
    }

    const token = accessToken || await getShopifyToken(store, clientId, clientSecret);
    const themeId = await getActiveThemeId(store, token);

    const ctx = { store, token, themeId, siteUrl, authorName };
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
    'i18n-html-lang': fixHtmlLang,
    'i18n-hreflang': fixHreflang,
    'i18n-content-language': fixContentLanguage,
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
    'Google-Extended',
    'ChatGPT-User',
    'PerplexityBot',
    'ClaudeBot',
    'Bytespider',
    'anthropic-ai',
    'cohere-ai',
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
