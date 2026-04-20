export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return res.status(500).json({ error: 'ADZUNA_APP_ID and ADZUNA_APP_KEY env vars are not set in Vercel.' });

  const { what, where, company, results_per_page = 10, page = 1 } = req.query;
  if (!what) return res.status(400).json({ error: 'Missing required param: what' });

  const params = new URLSearchParams({
    app_id: appId, app_key: appKey,
    results_per_page: String(Math.min(Number(results_per_page), 20)),
    'content-type': 'application/json',
  });
  if (what)    params.set('what', what);
  if (where)   params.set('where', where);
  if (company) params.set('company', company);

  try {
    const upstream = await fetch(`https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params}`);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Adzuna error ${upstream.status}`, detail: (await upstream.text()).substring(0,200) });
    return res.status(200).json(await upstream.json());
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Adzuna', detail: err.message });
  }
}
