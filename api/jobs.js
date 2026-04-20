// api/jobs.js
// Vercel serverless function — proxies Adzuna API to bypass browser CORS restrictions.
// Environment variables required (set in Vercel dashboard):
//   ADZUNA_APP_ID   — your Adzuna App ID
//   ADZUNA_APP_KEY  — your Adzuna App Key

export default async function handler(req, res) {
  // Allow cross-origin requests from the browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return res.status(500).json({
      error: 'Server misconfigured — ADZUNA_APP_ID and ADZUNA_APP_KEY environment variables are not set. Add them in your Vercel project settings.'
    });
  }

  // Forward query params from the browser request
  // what     = AND mode: all keywords must appear
  // what_or  = OR mode:  any keyword can appear
  const { what, what_or, where, company, results_per_page = 10, page = 1 } = req.query;

  if (!what && !what_or) {
    return res.status(400).json({ error: 'Missing required param: what or what_or' });
  }

  // Build the Adzuna URL
  const params = new URLSearchParams({
    app_id:  appId,
    app_key: appKey,
    results_per_page: String(Math.min(Number(results_per_page), 20)),
    'content-type': 'application/json',
  });

  if (what)     params.set('what', what);
  if (what_or)  params.set('what_or', what_or);
  if (where)    params.set('where', where);
  if (company)  params.set('company', company);

  const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;

  try {
    const upstream = await fetch(adzunaUrl);

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({
        error: `Adzuna returned ${upstream.status}`,
        detail: body.substring(0, 200)
      });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('Adzuna fetch error:', err);
    return res.status(502).json({ error: 'Failed to reach Adzuna API', detail: err.message });
  }
}
