import { useState, useCallback } from 'react';

export function useVisibility() {
  const [scores, setScores] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  const loadData = useCallback(async (airtableToken) => {
    if (!airtableToken) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/get-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airtableToken, action: 'all' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur');

      setScores(data.scores || []);
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerScan = useCallback(async (webhookUrl, maxPrompts = 0) => {
    if (!webhookUrl) return;
    setScanning(true);
    setScanResult(null);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/trigger-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, maxPrompts }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur');

      setScanResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, []);

  return { scores, results, loading, scanning, error, scanResult, loadData, triggerScan };
}
