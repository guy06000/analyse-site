export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { store, accessToken, productId, imageId, alt } = JSON.parse(event.body);

    if (!store || !accessToken || !productId || !imageId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Paramètres manquants : store, accessToken, productId, imageId requis' }),
      };
    }

    if (typeof alt !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Le champ alt doit être une chaîne de caractères' }),
      };
    }

    const res = await fetch(
      `https://${store}/admin/api/2024-01/products/${productId}/images/${imageId}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ image: { alt } }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      const error = new Error(`Shopify API error (${res.status}): ${errText}`);
      error.statusCode = res.status;
      throw error;
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Alt mis à jour pour l'image ${imageId}`,
        alt: data.image?.alt,
      }),
    };
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
