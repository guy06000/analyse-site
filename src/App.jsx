import { useState, useRef } from 'react';
import { Search, Globe, Bot, Languages } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { useAnalysis } from '@/hooks/useAnalysis';

const TABS = [
  { id: 'seo', label: 'SEO', icon: Search, type: 'seo' },
  { id: 'ai', label: 'IA / LLM', icon: Bot, type: 'ai' },
  { id: 'i18n', label: 'Traductions', icon: Languages, type: 'i18n' },
];

function App() {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState('seo');
  const [submitted, setSubmitted] = useState(false);
  const { results, loading, errors, analyze, clearCache } = useAnalysis();
  const analyzedTabs = useRef(new Set());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
      setUrl(normalizedUrl);
    }

    clearCache();
    analyzedTabs.current = new Set();
    setSubmitted(true);

    analyze(normalizedUrl, 'seo');
    analyzedTabs.current.add('seo');
    setActiveTab('seo');
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (submitted && !analyzedTabs.current.has(tabId)) {
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      analyze(normalizedUrl, tabId);
      analyzedTabs.current.add(tabId);
    }
  };

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

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-3">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4">
              <AnalysisPanel
                data={results[tab.type]}
                loading={loading[tab.type]}
                error={errors[tab.type]}
              />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

export default App;
