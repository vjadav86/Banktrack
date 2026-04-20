// api/jobs.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return res.status(500).json({ error: 'ADZUNA_APP_ID and ADZUNA_APP_KEY env vars not set in Vercel.' });

  // Health-check ping — just verify credentials work
  if (req.query.ping) {
    const pingUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=1&what=compliance`;
    try {
      const r = await fetch(pingUrl);
      return res.status(r.ok ? 200 : r.status).json({ ok: r.ok, status: r.status });
    } catch(e) {
      return res.status(502).json({ ok: false, error: e.message });
    }
  }

  const { what, what_or, where, company, results_per_page = 10, page = 1 } = req.query;
  if (!what && !what_or) return res.status(400).json({ error: 'Missing required param: what or what_or' });

  const params = new URLSearchParams({
    app_id:  appId,
    app_key: appKey,
    results_per_page: String(Math.min(Number(results_per_page), 20)),
    'content-type': 'application/json',
  });

  // For OR mode: use what_or. If company is also set, Adzuna requires what to
  // be present too — so we pass what_or terms as what in that case as a fallback.
  if (what_or && company) {
    // Adzuna doesn't support what_or + company together reliably;
    // fall back to what (AND) when filtering by company since it's already
    // narrow enough via the company param.
    params.set('what', what_or);
  } else if (what_or) {
    params.set('what_or', what_or);
  } else {
    params.set('what', what);
  }

  if (where)   params.set('where', where);
  if (company) params.set('company', company);

  const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;

  try {
    const upstream = await fetch(adzunaUrl);
    if (!upstream.ok) {
      const body = await upstream.text();
      let detail = body.substring(0, 300);
      // Try to extract a readable message from Adzuna's JSON error
      try { const j = JSON.parse(body); detail = j.exception || j.display || detail; } catch {}
      return res.status(upstream.status).json({
        error: `Adzuna returned ${upstream.status}`,
        detail,
        url_used: adzunaUrl.replace(appKey, '***') // safe to log without key
      });
    }
    return res.status(200).json(await upstream.json());
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Adzuna API', detail: err.message });
  }
}
