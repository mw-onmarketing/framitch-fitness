module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, redirectUri } = req.body || {};
  if (!code) return res.status(400).json({ error: 'No authorization code provided' });
  if (!redirectUri) return res.status(400).json({ error: 'No redirect URI provided' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth credentials not configured' });
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google token exchange error:', response.status, errorText);
      return res.status(500).json({ error: 'Token exchange failed', message: `Status ${response.status}` });
    }

    const data = await response.json();

    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in: data.expires_in || 3600
    });
  } catch (error) {
    console.error('Google Fit auth error:', error);
    return res.status(500).json({ error: 'Authentication failed', message: error.message });
  }
};
