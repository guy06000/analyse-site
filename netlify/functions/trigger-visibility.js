exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { webhookUrl, maxPrompts } = JSON.parse(event.body || '{}');

  if (!webhookUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'URL webhook n8n requise' }) };
  }

  // Fire-and-forget : on envoie la requête sans attendre la réponse
  // Le scan n8n prend ~72s, on ne peut pas attendre (timeout Netlify ~10s)
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxPrompts: maxPrompts || 0 }),
  }).catch(() => {});

  return {
    statusCode: 202,
    body: JSON.stringify({
      launched: true,
      message: 'Scan lancé. Les résultats apparaîtront dans quelques minutes.',
      timestamp: new Date().toISOString(),
    }),
  };
};
