import { useState } from 'react';
import { Store, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ShopifyConfig({ config, onChange, stores = [] }) {
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const update = (key, value) => {
    const updated = { ...config, [key]: value };
    onChange(updated);
  };

  const handleStoreSelect = (storeId) => {
    const found = stores.find((s) => s.id === storeId);
    if (found) {
      onChange({
        ...config,
        store: found.store,
        accessToken: found.accessToken || '',
        storeKey: found.id,
        storeName: found.name,
      });
      setTestResult(null);
    }
  };

  const save = () => {
    localStorage.setItem('shopifyConfig', JSON.stringify(config));
    setTestResult({ success: true, message: 'Configuration sauvegardee' });
    setTimeout(() => setTestResult(null), 3000);
  };

  const testConnection = async () => {
    if (!config.store || !config.accessToken) {
      setTestResult({ success: false, message: 'Store et Access Token requis' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/.netlify/functions/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixId: '__test__',
          store: config.store,
          accessToken: config.accessToken,
        }),
      });

      const data = await res.json();
      if (res.status === 400) {
        setTestResult({ success: true, message: 'Connexion Shopify OK' });
      } else {
        setTestResult({ success: false, message: data.error || `Erreur ${res.status}` });
      }
    } catch (error) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const hasMultipleStores = stores.length > 1;
  const hasToken = !!config.accessToken;

  return (
    <Card className="py-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4" />
          Configuration Shopify
          {hasToken && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle className="h-3 w-3" />
              Connecte
            </span>
          )}
          {testResult && (
            <span className={`ml-auto flex items-center gap-1 text-sm font-normal ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
              {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult.message}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {hasMultipleStores ? (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Boutique</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={config.storeKey || ''}
                onChange={(e) => handleStoreSelect(e.target.value)}
              >
                <option value="">-- Choisir une boutique --</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.store})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Store Shopify</label>
              <Input
                placeholder="ma-boutique.myshopify.com"
                value={config.store || ''}
                onChange={(e) => update('store', e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Nom auteur (meta)</label>
            <Input
              placeholder="Nom ou marque"
              value={config.authorName || ''}
              onChange={(e) => update('authorName', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-muted-foreground">Access Token</label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder={hasMultipleStores ? 'Charge depuis Airtable' : 'shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                value={config.accessToken || ''}
                onChange={(e) => update('accessToken', e.target.value)}
                readOnly={hasMultipleStores && hasToken}
                className={`pr-10 ${hasMultipleStores && hasToken ? 'bg-muted' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {hasMultipleStores ? (
              <p className="mt-1 text-xs text-muted-foreground">Token charge automatiquement depuis Airtable</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Token permanent depuis Admin Shopify &gt; Apps &gt; votre app custom</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save}>
            Sauvegarder
          </Button>
          <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Tester la connexion
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
