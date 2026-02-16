import { useState } from 'react';
import { Store, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ShopifyConfig({ config, onChange }) {
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const update = (key, value) => {
    const updated = { ...config, [key]: value };
    onChange(updated);
  };

  const save = () => {
    localStorage.setItem('shopifyConfig', JSON.stringify(config));
    setTestResult({ success: true, message: 'Configuration sauvegardée' });
    setTimeout(() => setTestResult(null), 3000);
  };

  const testConnection = async () => {
    if (!config.store || !config.clientId || !config.clientSecret) {
      setTestResult({ success: false, message: 'Remplissez store, Client ID et Client Secret' });
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
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        }),
      });

      const data = await res.json();
      // 400 "Fix inconnu" = auth succeeded, fix ID invalid = connection OK
      // 401 = auth failed
      // 500 = network/other error
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

  return (
    <Card className="py-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4" />
          Configuration Shopify
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
          <div>
            <label className="text-sm font-medium text-muted-foreground">Store Shopify</label>
            <Input
              placeholder="ma-boutique.myshopify.com"
              value={config.store || ''}
              onChange={(e) => update('store', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Nom auteur (meta)</label>
            <Input
              placeholder="Nom ou marque"
              value={config.authorName || ''}
              onChange={(e) => update('authorName', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Client ID</label>
            <Input
              placeholder="Client ID de l'app custom"
              value={config.clientId || ''}
              onChange={(e) => update('clientId', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Client Secret</label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                placeholder="Client Secret"
                value={config.clientSecret || ''}
                onChange={(e) => update('clientSecret', e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
