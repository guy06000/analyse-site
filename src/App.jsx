import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Globe, Bot, Languages, Settings, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { ShopifyConfig } from '@/components/ShopifyConfig';
import { VisibilityPanel } from '@/components/VisibilityPanel';
import { useAnalysis } from '@/hooks/useAnalysis';

const TABS = [
  { id: 'seo', label: 'SEO', icon: Search, type: 'seo' },
  { id: 'ai', label: 'IA / LLM', icon: Bot, type: 'ai' },
  { id: 'i18n', label: 'Traductions', icon: Languages, type: 'i18n' },
  { id: 'visibility', label: 'Visibilité', icon: Eye, type: 'visibility' },
];

const QUICK_URLS = [
  { label: 'ISIS n GOLD', url: 'https://isisngold.com', storeKey: 'isis' },
  { label: 'Ma Formation Strass', url: 'https://ma-formation-strass.com', storeKey: 'ma-formation-strass' },
  { label: 'Strass Dentaires', url: 'https://strass-dentaires.fr', storeKey: 'strass-dentaires' },
];

// Domain → storeKey mapping for auto-detection
const DOMAIN_TO_STORE = {
  'isisingold.com': 'isis',
  'isisngold.com': 'isis',
  'goldy-isis.myshopify.com': 'isis',
  'ma-formation-strass.com': 'ma-formation-strass',
  'ma-formation-strass.myshopify.com': 'ma-formation-strass',
  'strass-dentaires.fr': 'strass-dentaires',
  'c31a20-3.myshopify.com': 'strass-dentaires',
};

function detectStoreKey(urlStr) {
  try {
    const hostname = new URL(urlStr).hostname.replace(/^www\./, '');
    return DOMAIN_TO_STORE[hostname] || null;
  } catch {
    return null;
  }
}

function App() {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState('seo');
  const [submitted, setSubmitted] = useState(false);
  const [showShopifyConfig, setShowShopifyConfig] = useState(false);
  const [stores, setStores] = useState([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [shopifyConfig, setShopifyConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('shopifyConfig')) || {};
      if (!saved.store) saved.store = 'goldy-isis.myshopify.com';
      return saved;
    } catch {
      return { store: 'goldy-isis.myshopify.com' };
    }
  });
  const { results, loading, errors, analyze, clearCache, fixingId, fixResults, applyFix, altSaving, altResults, updateImageAlt } = useAnalysis();
  const analyzedTabs = useRef(new Set());
  const [visibilityConfig, setVisibilityConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('visibilityConfig')) || {};
      if (!saved.n8nWebhookUrl) saved.n8nWebhookUrl = 'https://n8n.srv756714.hstgr.cloud/webhook/visibility-scan';
      return saved;
    } catch {
      return { n8nWebhookUrl: 'https://n8n.srv756714.hstgr.cloud/webhook/visibility-scan' };
    }
  });

  // Persist visibility config
  useEffect(() => {
    localStorage.setItem('visibilityConfig', JSON.stringify(visibilityConfig));
  }, [visibilityConfig]);

  // Load stores from Airtable on mount
  useEffect(() => {
    const airtableToken = visibilityConfig.airtableToken;
    if (!airtableToken) return;

    fetch('/.netlify/functions/get-stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airtableToken }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.stores?.length) {
          setStores(data.stores);
        }
      })
      .catch(() => {})
      .finally(() => setStoresLoaded(true));
  }, [visibilityConfig.airtableToken]);

  // Resolve the shopifyConfig for a given storeKey (synchronous, returns new config)
  const resolveStoreConfig = useCallback(
    (storeKey) => {
      if (!storeKey) return shopifyConfig;

      const found = stores.find((s) => s.id === storeKey);
      if (found) {
        return {
          ...shopifyConfig,
          store: found.store,
          accessToken: found.accessToken || shopifyConfig.accessToken,
          storeKey: found.id,
          storeName: found.name,
        };
      }
      // Fallback: keep current token, just update metadata
      const fallbackStore = QUICK_URLS.find((q) => q.storeKey === storeKey);
      if (fallbackStore) {
        return { ...shopifyConfig, storeKey, storeName: fallbackStore.label };
      }
      return shopifyConfig;
    },
    [stores, shopifyConfig]
  );

  const switchStore = useCallback(
    (storeKey) => {
      if (!storeKey) return;
      const newConfig = resolveStoreConfig(storeKey);
      setShopifyConfig(newConfig);
    },
    [resolveStoreConfig]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
      setUrl(normalizedUrl);
    }

    // Auto-detect store from URL and resolve config synchronously
    const detectedKey = detectStoreKey(normalizedUrl);
    const effectiveConfig = detectedKey ? resolveStoreConfig(detectedKey) : shopifyConfig;
    if (detectedKey) setShopifyConfig(effectiveConfig);

    clearCache();
    analyzedTabs.current = new Set();
    setSubmitted(true);

    analyze(normalizedUrl, 'seo', effectiveConfig);
    analyzedTabs.current.add('seo');
    setActiveTab('seo');
  };

  const handleQuickUrl = (q) => {
    setUrl(q.url);
    if (q.storeKey) switchStore(q.storeKey);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'visibility') return;
    if (submitted && !analyzedTabs.current.has(tabId)) {
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      analyze(normalizedUrl, tabId, shopifyConfig);
      analyzedTabs.current.add(tabId);
    }
  };

  const handleFix = (fixAction) => {
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    applyFix(fixAction, shopifyConfig, normalizedUrl);
  };

  const handleSaveAlt = (productId, imageId, alt) => {
    updateImageAlt(shopifyConfig.store, shopifyConfig.accessToken, productId, imageId, alt);
  };

  const isShopify = results.ai?.isShopify || stores.length > 0;
  const hasCredentials = !!(shopifyConfig.store && shopifyConfig.accessToken);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Globe className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Analyse Site</h1>
              <p className="text-sm text-muted-foreground">
                SEO, IA & Traductions
              </p>
            </div>
            {isShopify && (
              <Button
                variant={showShopifyConfig ? 'default' : 'outline'}
                size="sm"
                className="ml-auto"
                onClick={() => setShowShopifyConfig(!showShopifyConfig)}
              >
                <Settings className="mr-1 h-4 w-4" />
                Shopify
                {shopifyConfig.storeName && (
                  <span className="ml-1 text-xs opacity-75">({shopifyConfig.storeName})</span>
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="url"
            placeholder="https://exemple.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={!url.trim()}>
            <Search className="mr-2 h-4 w-4" />
            Analyser
          </Button>
        </form>
        <div className="flex gap-2 mt-2">
          {QUICK_URLS.map((q) => (
            <Button
              key={q.url}
              variant="ghost"
              size="sm"
              className={`text-xs hover:text-foreground ${
                shopifyConfig.storeKey === q.storeKey
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground'
              }`}
              onClick={() => handleQuickUrl(q)}
            >
              <Globe className="mr-1 h-3 w-3" />
              {q.label}
            </Button>
          ))}
        </div>

        {showShopifyConfig && (
          <div className="mt-4">
            <ShopifyConfig
              config={shopifyConfig}
              onChange={setShopifyConfig}
              stores={stores}
            />
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-4">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4">
              {tab.type === 'visibility' ? (
                <VisibilityPanel
                  config={visibilityConfig}
                  onConfigChange={setVisibilityConfig}
                  shopifyConfig={hasCredentials ? shopifyConfig : null}
                  analysisResults={results}
                />
              ) : (
                <AnalysisPanel
                  data={results[tab.type]}
                  loading={loading[tab.type]}
                  error={errors[tab.type]}
                  shopifyConfig={hasCredentials ? shopifyConfig : null}
                  onFix={handleFix}
                  fixingId={fixingId}
                  fixResults={fixResults}
                  onSaveAlt={handleSaveAlt}
                  altSaving={altSaving}
                  altResults={altResults}
                  tabType={tab.type}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

export default App;
