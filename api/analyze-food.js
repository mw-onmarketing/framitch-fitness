module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, mode } = req.body || {};
  if (!image) return res.status(400).json({ error: 'No image provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    let mediaType = 'image/jpeg';
    let base64Data = image;

    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        mediaType = match[1];
        base64Data = match[2];
      }
    }

    const prompt = mode === 'barcode'
      ? `Look at this image and find any barcode (EAN, UPC, etc.). Read the numbers below or within the barcode. Return ONLY valid JSON: { "barcode": "the number string" }. If no barcode found, return { "barcode": "" }.`
      : `You are a precise food nutrition analyzer. Analyze the food in this image carefully.

IMPORTANT RULES:
- If you can see a product label, brand name, or packaging, identify the EXACT product and use its REAL nutritional values (e.g. a Hanuta wafer is 119 kcal per piece, not 250)
- If it's a packaged product, look for any visible nutritional info on the packaging
- For home-cooked meals, estimate based on visible portion size (use a standard plate as ~25cm reference)
- Be CONSERVATIVE with estimates — it's better to be slightly under than wildly over
- For single items (one cookie, one fruit, one bar), use the standard single-serving values

Return ONLY valid JSON (no markdown, no code fences):
{
  "name": "Product/food name in German",
  "kcal": number (total for the visible portion),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "confidence": "high" if packaged product identified, "medium" if clear food visible, "low" if uncertain,
  "notes": "Brief German note: what you identified, portion size assumption"
}

If no food visible: {"name":"Nicht erkannt","kcal":0,"protein":0,"carbs":0,"fat":0,"confidence":"low","notes":"Kein Essen erkannt"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return res.status(500).json({ error: 'AI API error', message: `Status ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse AI response');
      }
    }

    // Barcode mode: return barcode directly
    if (mode === 'barcode') {
      return res.status(200).json({ barcode: String(result.barcode || '') });
    }

    return res.status(200).json({
      name: String(result.name || 'Unbekannt'),
      kcal: Math.round(Number(result.kcal) || 0),
      protein: Math.round(Number(result.protein) || 0),
      carbs: Math.round(Number(result.carbs) || 0),
      fat: Math.round(Number(result.fat) || 0),
      confidence: ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'low',
      notes: String(result.notes || ''),
    });
  } catch (error) {
    console.error('Food analysis error:', error);
    return res.status(500).json({ error: 'Analysis failed', message: error.message });
  }
};
