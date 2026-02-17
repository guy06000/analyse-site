import { useState, useRef, useCallback } from 'react';

export function useAnalysis() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [fixingId, setFixingId] = useState(null);
  const [fixResults, setFixResults] = useState({});
  const [altSaving, setAltSaving] = useState({});
  const [altResults, setAltResults] = useState({});
  const cache = useRef({});
  const lastUrl = useRef('');

  const analyze = async (url, type, shopifyConfig) => {
    lastUrl.current = url;
    const cacheKey = `${url}:${type}`;
    if (cache.current[cacheKey]) {
      setResults((prev) => ({ ...prev, [type]: cache.current[cacheKey] }));
      return;
    }

    setLoading((prev) => ({ ...prev, [type]: true }));
    setErrors((prev) => ({ ...prev, [type]: null }));

    try {
      const body = { url };
      // Pass Shopify credentials to SEO analyzer for product image audit
      if (shopifyConfig?.store && shopifyConfig?.accessToken) {
        body.store = shopifyConfig.store;
        body.accessToken = shopifyConfig.accessToken;
      }
      const response = await fetch(`/.netlify/functions/analyze-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Erreur HTTP ${response.status}`);
      }

      const data = await response.json();
      cache.current[cacheKey] = data;
      setResults((prev) => ({ ...prev, [type]: data }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [type]: error.message }));
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const applyFix = useCallback(async (fixAction, shopifyConfig, siteUrl) => {
    setFixingId(fixAction.id);
    setFixResults((prev) => ({ ...prev, [fixAction.id]: null }));

    try {
      const response = await fetch('/.netlify/functions/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixId: fixAction.id,
          store: shopifyConfig.store,
          accessToken: shopifyConfig.accessToken,
          siteUrl,
          authorName: shopifyConfig.authorName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erreur HTTP ${response.status}`);
      }

      setFixResults((prev) => ({ ...prev, [fixAction.id]: { success: true, message: data.message } }));

      // Invalidate cache and re-analyze after 2s (deduce type from fixId prefix)
      const url = lastUrl.current;
      if (url) {
        const type = fixAction.id.startsWith('seo-') ? 'seo'
          : fixAction.id.startsWith('i18n-') ? 'i18n'
          : 'ai';
        delete cache.current[`${url}:${type}`];
        setTimeout(() => analyze(url, type, shopifyConfig), 2000);
      }
    } catch (error) {
      setFixResults((prev) => ({ ...prev, [fixAction.id]: { success: false, error: error.message } }));
    } finally {
      setFixingId(null);
    }
  }, []);

  const updateImageAlt = useCallback(async (store, accessToken, productId, imageId, alt) => {
    setAltSaving((prev) => ({ ...prev, [imageId]: true }));
    setAltResults((prev) => ({ ...prev, [imageId]: null }));

    try {
      const response = await fetch('/.netlify/functions/update-image-alt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, accessToken, productId, imageId, alt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erreur HTTP ${response.status}`);
      }

      setAltResults((prev) => ({ ...prev, [imageId]: { success: true, message: data.message } }));

      // Invalidate SEO cache and re-analyze after 2s
      const url = lastUrl.current;
      if (url) {
        delete cache.current[`${url}:seo`];
        setTimeout(() => analyze(url, 'seo', { store, accessToken }), 2000);
      }
    } catch (error) {
      setAltResults((prev) => ({ ...prev, [imageId]: { success: false, error: error.message } }));
    } finally {
      setAltSaving((prev) => ({ ...prev, [imageId]: false }));
    }
  }, []);

  const clearCache = () => {
    cache.current = {};
    setResults({});
    setErrors({});
    setFixResults({});
    setAltSaving({});
    setAltResults({});
  };

  return { results, loading, errors, analyze, clearCache, fixingId, fixResults, applyFix, altSaving, altResults, updateImageAlt };
}
