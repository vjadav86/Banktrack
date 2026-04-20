export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY env var not set in Vercel.' });

  const { resumeText, jobs } = req.body || {};
  if (!jobs || !Array.isArray(jobs)) return res.status(400).json({ error: 'Missing field: jobs (array)' });

  const rc = (resumeText || '').substring(0, 3500) || 'Resume binary — analyze from job requirements only';
  const prompt = `Score each job against this resume.\n\nRESUME:\n${rc}\n\nJOBS:\n${JSON.stringify(jobs.map(j=>({id:j.id,title:j.title,bank:j.bank,description:(j.description||'').substring(0,300),skills:j.skills||[]})))}\n\nReturn ONLY a JSON array:\n[{"id":"id","matchScore":82,"matchLevel":"high","matchReason":"One sentence","matchStrengths":["s1","s2"],"matchGaps":["g1","g2"],"matchedSkills":["s1"]}]\nmatchLevel: "high"(75-100),"medium"(40-74),"low"(0-39)`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2500,
        system: 'Resume-to-job match analyzer. Respond ONLY with a JSON array. No markdown, no prose.',
        messages: [{ role: 'user', content: prompt }] })
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Anthropic error ${upstream.status}` });
    const data = await upstream.json();
    const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim()
      .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
    let arr = [];
    try { arr = JSON.parse(text); } catch { const m=text.match(/\[[\s\S]*\]/); if(m) arr=JSON.parse(m[0]); }
    return res.status(200).json({ results: arr });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic', detail: err.message });
  }
}
