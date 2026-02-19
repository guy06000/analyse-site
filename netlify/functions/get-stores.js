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
    const { airtableToken } = JSON.parse(event.body);

    if (!airtableToken) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'airtableToken requis' }) };
    }

    // Fetch all Config records from Airtable
    const res = await fetch(
      `https://api.airtable.com/v0/appwXFqjbbTDEbCVW/tbl6QXEpuCerZssd2`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );

    if (!res.ok) {
      throw new Error(`Airtable error: ${res.status}`);
    }

    const { records } = await res.json();

    // Build key-value map
    const configMap = {};
    for (const r of records) {
      if (r.fields.cle && r.fields.valeur) {
        configMap[r.fields.cle] = r.fields.valeur;
      }
    }

    // Extract stores: look for shopify_store_* and shopify_token_* pairs
    const storeIds = new Set();
    for (const key of Object.keys(configMap)) {
      const storeMatch = key.match(/^shopify_store_(.+)$/);
      if (storeMatch) storeIds.add(storeMatch[1]);
    }

    const STORE_NAMES = {
      isis: 'ISIS n GOLD',
      'ma-formation-strass': 'Ma Formation Strass',
      'strass-dentaires': 'Strass Dentaires',
    };

    const stores = [];
    for (const id of storeIds) {
      const store = configMap[`shopify_store_${id}`];
      const accessToken = configMap[`shopify_token_${id}`];
      if (store) {
        stores.push({
          id,
          name: STORE_NAMES[id] || id,
          store,
          accessToken: accessToken || null,
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ stores }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
