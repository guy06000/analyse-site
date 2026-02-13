# Analyse Site — Document de Design

**Date** : 2026-02-13
**Auteur** : Guy
**Statut** : Validé

---

## 1. Vision

Application web d'analyse de site internet permettant de vérifier la qualité SEO, la compatibilité IA/LLM, et les traductions d'une page web via une URL unique.

## 2. Décisions

| Décision | Choix |
|---|---|
| Usage | Personnel (évolutif équipe) |
| Frontend | React + Vite + Shadcn/ui + Tailwind CSS |
| Backend | Netlify Functions (serverless) |
| Analyse | URL unique (v1) |
| Hébergement | Local (`netlify dev`) → Netlify (futur) |
| Onglets | SEO / IA-LLM / Traductions |
| Scoring | Par catégorie + global, couleurs vert/orange/rouge |
| Export | PDF (v2) |
| BDD | Aucune |

## 3. Architecture

```
analyse-site/
├── src/                        # Frontend React
│   ├── components/             # Composants UI (onglets, cartes, scores)
│   ├── pages/                  # Page principale
│   ├── hooks/                  # Hooks personnalisés (useAnalysis...)
│   └── lib/                    # Utilitaires
├── netlify/
│   └── functions/              # Fonctions serverless (backend)
│       ├── analyze-seo.js      # Analyse SEO
│       ├── analyze-ai.js       # Analyse compatibilité IA
│       └── analyze-i18n.js     # Analyse traductions
├── public/
├── vite.config.js
├── tailwind.config.js
└── netlify.toml                # Config déploiement
```

**Fonctionnement :**
- L'utilisateur entre une URL et clique sur l'onglet d'analyse souhaité
- Le frontend appelle la fonction serverless correspondante
- La fonction fetch la page, l'analyse côté serveur (avec cheerio pour parser le HTML), et retourne un rapport JSON
- Le frontend affiche le rapport avec des scores, des indicateurs vert/orange/rouge, et des recommandations

## 4. Onglet SEO — 5 catégories

### 4.1 Meta & Contenu
- Titre de page (présent, longueur 50-60 car.)
- Meta description (présente, longueur 150-160 car.)
- Meta keywords
- URL canonique
- Balises Open Graph (og:title, og:description, og:image)
- Balises Twitter Card

### 4.2 Structure HTML
- Balise H1 (unique, présente)
- Hiérarchie H1→H6 (pas de saut de niveau)
- Ratio texte/HTML
- Attributs alt sur toutes les images
- Liens internes et externes (nombre, liens cassés)

### 4.3 Technique
- Présence de robots.txt
- Présence de sitemap.xml
- HTTPS actif
- Balise viewport (responsive)
- Temps de chargement estimé (taille de la page)
- Compression gzip/brotli

### 4.4 Contenu
- Nombre de mots sur la page
- Densité de mots-clés (top 10 mots récurrents)
- Présence de liens internes
- Présence de CTA (call-to-action)

### 4.5 Données structurées
- Présence de JSON-LD / Schema.org
- Types de schema détectés (Product, Article, FAQ...)
- Validation de la structure

## 5. Onglet IA/LLM — 4 catégories

### 5.1 Accessibilité aux crawlers IA
- Vérification du robots.txt pour les bots IA : GPTBot, Google-Extended, ChatGPT-User, PerplexityBot, ClaudeBot, Bytespider
- Statut par bot : autorisé / bloqué / non mentionné
- Recommandation sur quels bots autoriser/bloquer

### 5.2 Fichiers spécifiques IA
- Présence de llms.txt (nouveau standard pour guider les LLM)
- Présence de llms-full.txt
- Présence de .well-known/ai-plugin.json
- Qualité et contenu de ces fichiers si présents

### 5.3 Qualité du contenu pour les IA
- HTML sémantique (utilisation de article, section, nav, main)
- Contenu accessible sans JavaScript (les IA ne rendent pas le JS)
- Structure claire : titres hiérarchisés, paragraphes distincts
- Présence de FAQ structurée (très citée par les IA)
- Données structurées JSON-LD

### 5.4 Citabilité
- Présence d'informations d'auteur/source (E-E-A-T)
- Dates de publication/mise à jour visibles
- Sources et références citées
- Contenu unique vs générique

## 6. Onglet Traductions/i18n — 3 catégories

### 6.1 Configuration technique i18n
- Attribut lang sur la balise html (présent, valide)
- Balises hreflang (présentes, cohérentes entre elles)
- Balise link rel="alternate" pour chaque langue
- Structure d'URL multilingue détectée (sous-dossier, sous-domaine, paramètre)
- Meta content-language
- Langue par défaut (x-default) déclarée

### 6.2 Détection des langues disponibles
- Liste de toutes les versions linguistiques trouvées
- Vérification que chaque URL alternative est accessible (pas de 404)
- Comparaison de la structure : chaque page traduite a-t-elle les mêmes sections
- Détection de contenu non traduit (blocs restés dans la langue d'origine)

### 6.3 Qualité des traductions
- Détection de la langue réelle du contenu vs langue déclarée
- Incohérence langue déclarée / langue du contenu
- Éléments souvent oubliés : attributs alt des images, meta description, titre, boutons
- Placeholder ou texte Lorem Ipsum détecté

## 7. Interface utilisateur

```
┌─────────────────────────────────────────────┐
│  Analyse Site                    [logo]      │
├─────────────────────────────────────────────┤
│                                             │
│  [ Entrez une URL... https://         ] [▶] │
│                                             │
├──────────┬──────────────┬───────────────────┤
│   SEO    │   IA/LLM     │   Traductions    │
├──────────┴──────────────┴───────────────────┤
│                                             │
│  Score global : 72/100  ████████░░          │
│                                             │
│  Cartes par catégorie avec scores           │
│  Détails dépliables par catégorie           │
│  Statut par point : OK / Attention / Erreur │
│                                             │
└─────────────────────────────────────────────┘
```

**Parcours utilisateur :**
1. Entrer l'URL et cliquer Analyser
2. Onglet SEO actif par défaut, analyse se lance
3. Résultats : score global + cartes par catégorie
4. Clic sur carte → détails avec chaque point vérifié
5. Basculer entre onglets, analyse au premier clic
6. Cache des résultats entre onglets

## 8. Stack technique

**Frontend :**
- react + vite
- tailwindcss
- shadcn/ui (Tabs, Card, Progress, Badge, Button)
- lucide-react (icônes)

**Backend (Netlify Functions) :**
- cheerio (parser HTML)
- node-fetch (récupérer pages)
- franc (détection de langue)

**Outils dev :**
- netlify-cli (dev local + déploiement)
- eslint + prettier

## 9. Ordre de développement

1. Setup projet (React + Vite + Tailwind + Shadcn + Netlify)
2. Interface : barre URL + système d'onglets + layout cartes
3. Fonction serverless SEO (la plus complète)
4. Affichage résultats SEO
5. Fonction serverless IA/LLM
6. Fonction serverless Traductions
7. Polish : loading states, gestion d'erreurs, responsive
