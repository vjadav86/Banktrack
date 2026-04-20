// api/match.js
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

  const rc = (resumeText || '').substring(0, 3000) ||
    'Resume not provided — score based on job requirements only';

  // Cap at 12 jobs and trim descriptions to keep prompt small
  const jobSlice = jobs.slice(0, 12).map(j => ({
    id:          j.id,
    title:       j.title,
    bank:        j.bank,
    description: (j.description || '').substring(0, 200),
    skills:      (j.skills || []).slice(0, 6)
  }));

  const prompt = `Score each job against this resume.

RESUME:
${rc}

JOBS:
${JSON.stringify(jobSlice)}

Return ONLY a JSON array — no markdown, no text outside the array:
[{"id":"job_id","matchScore":82,"matchLevel":"high","matchReason":"One sentence","matchStrengths":["s1","s2"],"matchGaps":["g1","g2"],"matchedSkills":["skill1"]}]

Rules:
- matchLevel: "high" (score 75-100), "medium" (score 40-74), "low" (score 0-39)
- matchScore: integer 0-100
- matchStrengths: 2-3 items max
- matchGaps: 2-3 items max`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system:     'You are a resume-to-job match analyzer. Respond ONLY with a valid JSON array. No markdown fences, no explanation, no text outside the JSON array.',
        messages:   [{ role: 'user', content: prompt }]
      })
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      // Extract readable message from Anthropic error JSON
      let detail = body.substring(0, 400);
      try {
        const j = JSON.parse(body);
        detail = j.error?.message || j.error?.type || detail;
      } catch {}
      console.error('Anthropic error:', upstream.status, detail);
      return res.status(upstream.status).json({
        error:  `Anthropic error ${upstream.status}`,
        detail
      });
    }

    const data  = await upstream.json();
    const text  = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const clean = text.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();

    let arr = [];
    try { arr = JSON.parse(clean); }
    catch { const m = clean.match(/\[[\s\S]*\]/); if (m) try { arr = JSON.parse(m[0]); } catch {} }

    return res.status(200).json({ results: arr });

  } catch (err) {
    console.error('match handler error:', err);
    return res.status(502).json({ error: 'Failed to reach Anthropic API', detail: err.message });
  }
}
