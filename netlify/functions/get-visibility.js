const BASE_ID = 'appwXFqjbbTDEbCVW';
const SCORES_TABLE = 'tblMYErlB8UKy1Bvt';
const RESULTATS_TABLE = 'tbl3a2NNMbqUOKlUp';
const MODIFICATIONS_TABLE = 'tblwyvDq2yOhs4PDO';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { airtableToken, action } = JSON.parse(event.body || '{}');

  if (!airtableToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token Airtable requis' }) };
  }

  const headers = {
    Authorization: `Bearer ${airtableToken}`,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'scores') {
      const res = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${SCORES_TABLE}?sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=200`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Erreur Airtable');
      return {
        statusCode: 200,
        body: JSON.stringify({ scores: data.records.map((r) => r.fields) }),
      };
    }

    if (action === 'results') {
      const res = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${RESULTATS_TABLE}?sort%5B0%5D%5Bfield%5D=date_scan&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=500`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Erreur Airtable');
      return {
        statusCode: 200,
        body: JSON.stringify({ results: data.records.map((r) => r.fields) }),
      };
    }

    if (action === 'modifications') {
      const res = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${MODIFICATIONS_TABLE}?sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=100`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Erreur Airtable');
      return {
        statusCode: 200,
        body: JSON.stringify({ modifications: data.records.map((r) => r.fields) }),
      };
    }

    // Default: return all three
    const [scoresRes, resultsRes, modsRes] = await Promise.all([
      fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${SCORES_TABLE}?sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=200`,
        { headers }
      ),
      fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${RESULTATS_TABLE}?sort%5B0%5D%5Bfield%5D=date_scan&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=500`,
        { headers }
      ),
      fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${MODIFICATIONS_TABLE}?sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=100`,
        { headers }
      ),
    ]);

    const scores = await scoresRes.json();
    const results = await resultsRes.json();
    const mods = await modsRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        scores: scores.records?.map((r) => r.fields) || [],
        results: results.records?.map((r) => r.fields) || [],
        modifications: mods.records?.map((r) => r.fields) || [],
      }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
