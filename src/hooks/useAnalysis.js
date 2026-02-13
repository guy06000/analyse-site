import { useState, useRef } from 'react';

export function useAnalysis() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const cache = useRef({});

  const analyze = async (url, type) => {
    const cacheKey = `${url}:${type}`;
    if (cache.current[cacheKey]) {
      setResults((prev) => ({ ...prev, [type]: cache.current[cacheKey] }));
      return;
    }

    setLoading((prev) => ({ ...prev, [type]: true }));
    setErrors((prev) => ({ ...prev, [type]: null }));

    try {
      const response = await fetch(`/.netlify/functions/analyze-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
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

  const clearCache = () => {
    cache.current = {};
    setResults({});
    setErrors({});
  };

  return { results, loading, errors, analyze, clearCache };
}
