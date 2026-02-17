exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { webhookUrl, maxPrompts } = JSON.parse(event.body || '{}');

  if (!webhookUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'URL webhook n8n requise' }) };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 590000); // 9m50s (Netlify max ~10min)

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxPrompts: maxPrompts || 0 }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();

    return {
      statusCode: response.ok ? 200 : 502,
      body: JSON.stringify(data),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        statusCode: 504,
        body: JSON.stringify({ error: 'Timeout: le scan prend trop de temps. Vérifiez les résultats dans Airtable.' }),
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
