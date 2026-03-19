module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.query.q;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query too short' });
  }

  try {
    const params = new URLSearchParams({
      q: query.trim(),
      page_size: '10',
      fields: 'product_name,nutriments,brands,serving_size,serving_quantity,code',
      countries_tags_en: 'germany',
    });

    const url = `https://search.openfoodfacts.org/search?${params.toString()}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FramitchFitness/1.0 (contact@framitch.de)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error('OFF Search API error:', response.status);
      return res.status(502).json({ error: 'Upstream search failed', status: response.status });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Search proxy error:', error);
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Search timed out' });
    }
    return res.status(500).json({ error: 'Search failed', message: error.message });
  }
};
