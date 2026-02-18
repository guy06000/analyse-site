import { useState, useCallback, useRef } from 'react';

const POLL_INTERVAL = 10_000; // 10 secondes
const POLL_MAX_DURATION = 180_000; // 3 minutes max

export function useVisibility() {
  const [scores, setScores] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [pollStatus, setPollStatus] = useState(null); // 'waiting' | 'found' | null
  const pollRef = useRef(null);
  const baselineRef = useRef(null);

  const loadData = useCallback(async (airtableToken) => {
    if (!airtableToken) return null;
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
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    baselineRef.current = null;
  }, []);

  const startPolling = useCallback((airtableToken, baselineResultCount) => {
    stopPolling();
    baselineRef.current = baselineResultCount;
    setPollStatus('waiting');

    const startTime = Date.now();

    pollRef.current = setInterval(async () => {
      // Timeout : arrêter après 3 min
      if (Date.now() - startTime > POLL_MAX_DURATION) {
        stopPolling();
        setPollStatus(null);
        setScanning(false);
        setScanResult({
          launched: true,
          message: 'Le scan semble prendre plus de temps que prévu. Rafraîchissez manuellement.',
        });
        return;
      }

      try {
        const response = await fetch('/.netlify/functions/get-visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ airtableToken, action: 'all' }),
        });

        const data = await response.json();
        if (!response.ok) return;

        const newResults = data.results || [];
        const newScores = data.scores || [];

        // Détecter si de nouveaux résultats sont arrivés
        if (newResults.length > baselineRef.current) {
          setScores(newScores);
          setResults(newResults);
          stopPolling();
          setPollStatus('found');
          setScanning(false);

          // Calculer le résumé
          const latestDate = newScores[0]?.date;
          const latestScores = newScores.filter((s) => s.date === latestDate);
          const avgScore =
            latestScores.length > 0
              ? Math.round(
                  latestScores.reduce((sum, s) => sum + (s.score_moyen || 0), 0) /
                    latestScores.length
                )
              : 0;
          const latestResultDate = newResults[0]?.date_scan;
          const nbResults = newResults.filter((r) => r.date_scan === latestResultDate).length;
          const nbMentions = newResults.filter(
            (r) => r.date_scan === latestResultDate && r.mention_detected === 'oui'
          ).length;

          setScanResult({
            success: true,
            nb_mentions: nbMentions,
            nb_results: nbResults,
            score_global: avgScore,
          });

          // Effacer le statut "found" après 5s
          setTimeout(() => setPollStatus(null), 5000);
        }
      } catch {
        // Ignorer les erreurs de polling silencieusement
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  const triggerScan = useCallback(async (webhookUrl, airtableToken, maxPrompts = 0) => {
    if (!webhookUrl) return;
    setScanning(true);
    setScanResult(null);
    setError(null);

    // Sauvegarder le nombre actuel de résultats comme baseline
    const currentResultCount = results?.length || 0;

    try {
      const response = await fetch('/.netlify/functions/trigger-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, maxPrompts }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur');

      setScanResult(data);

      // Démarrer le polling pour détecter les nouveaux résultats
      if (airtableToken) {
        startPolling(airtableToken, currentResultCount);
      }
    } catch (err) {
      setError(err.message);
      setScanning(false);
    }
  }, [results, startPolling]);

  return {
    scores,
    results,
    loading,
    scanning,
    error,
    scanResult,
    pollStatus,
    loadData,
    triggerScan,
    stopPolling,
  };
}
