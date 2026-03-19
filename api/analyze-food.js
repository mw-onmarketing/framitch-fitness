const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body || {};

  if (!image) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Extract media type and base64 data from data URL
    let mediaType = 'image/jpeg';
    let base64Data = image;

    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mediaType = match[1];
        base64Data = match[2];
      }
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `Analyze the food in this image. Estimate the nutritional values as accurately as possible based on typical portion sizes visible in the photo.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "name": "Name of the meal/food in German",
  "kcal": estimated total calories (number),
  "protein": estimated protein in grams (number),
  "carbs": estimated carbs in grams (number),
  "fat": estimated fat in grams (number),
  "confidence": "high" or "medium" or "low",
  "notes": "Brief note in German about the estimation, e.g. portion size assumptions"
}

If you cannot identify food in the image, return:
{
  "name": "Nicht erkannt",
  "kcal": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "confidence": "low",
  "notes": "Kein Essen im Bild erkannt"
}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0]?.text || '';

    // Try to parse JSON from the response
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // Try to extract JSON from the response text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse AI response as JSON');
      }
    }

    // Validate and sanitize the result
    const sanitized = {
      name: String(result.name || 'Unbekannt'),
      kcal: Math.round(Number(result.kcal) || 0),
      protein: Math.round(Number(result.protein) || 0),
      carbs: Math.round(Number(result.carbs) || 0),
      fat: Math.round(Number(result.fat) || 0),
      confidence: ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'low',
      notes: String(result.notes || ''),
    };

    return res.status(200).json(sanitized);
  } catch (error) {
    console.error('Food analysis error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message || 'Unknown error',
    });
  }
};
