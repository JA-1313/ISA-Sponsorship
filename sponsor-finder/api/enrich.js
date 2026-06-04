// api/enrich.js — Owner / decision-maker lookup via Apollo, by company domain.
// PROTECTED: requires a shared secret header so it can't be called publicly
// (you don't want to give away enriched owner emails to anonymous visitors).
// Call this from YOUR tooling / an authenticated dashboard, not the public widget.
// Runtime: Vercel serverless, Node 18+.

function domainFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // shared-secret guard
  if ((req.headers['x-enrich-secret'] || '') !== process.env.ENRICH_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return res.status(500).json({ error: 'Missing APOLLO_API_KEY env var' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const dom = body.domain || domainFrom(body.website || '');
  if (!dom) return res.status(400).json({ error: 'website or domain required' });

  const r = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apolloKey },
    body: JSON.stringify({
      q_organization_domains: dom,
      person_titles: ['owner', 'founder', 'president', 'ceo', 'partner',
                      'marketing manager', 'marketing director', 'general manager'],
      page: 1,
      per_page: 3
    })
  });
  const j = await r.json();

  const contacts = (j.people || []).map(p => ({
    name: [p.first_name, p.last_name].filter(Boolean).join(' '),
    title: p.title || '',
    email: p.email || null,        // may be locked unless your Apollo plan/credits reveal it
    linkedin: p.linkedin_url || '',
    org: p.organization?.name || ''
  }));

  res.json({ domain: dom, contacts });
}
