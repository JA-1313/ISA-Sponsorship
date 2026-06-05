// api/enrich.mjs — Apollo lookup: top 2 owner/exec contacts for a company domain.
const TITLES = ['owner','founder','ceo','president','partner','chief marketing officer','marketing director','vp of marketing','general manager'];
const PRIORITY = ['owner','founder','chief executive','ceo','president','partner','chief marketing','marketing director','director of marketing','vp of marketing','general manager'];

function domainFrom(u){
  try { return new URL(u.startsWith('http')?u:'https://'+u).hostname.replace(/^www\./,''); }
  catch { return (u||'').replace(/^www\./,'').split('/')[0]; }
}
function rank(t){ t=(t||'').toLowerCase(); const i=PRIORITY.findIndex(k=>t.includes(k)); return i===-1?99:i; }

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const key = process.env.APOLLO_API_KEY;
  if(!key) return res.status(500).json({error:'Missing APOLLO_API_KEY env var'});
  const dom = domainFrom(req.query.website || req.query.domain || '');
  if(!dom) return res.status(400).json({error:'website or domain required'});

  const r = await fetch('https://api.apollo.io/v1/mixed_people/search',{
    method:'POST',
    headers:{'Content-Type':'application/json','Cache-Control':'no-cache','X-Api-Key':key},
    body: JSON.stringify({ q_organization_domains: dom, person_titles: TITLES, page:1, per_page:10 })
  });
  const j = await r.json();
  if(!r.ok) return res.status(r.status).json({error: j.error || j.message || 'Apollo error'});

  const contacts = (j.people||[]).map(p=>({
    firstName: p.first_name||'', lastName: p.last_name||'',
    name: [p.first_name,p.last_name].filter(Boolean).join(' '),
    title: p.title||'',
    email: p.email||null,
    locked: !p.email || /not_unlocked/i.test(p.email||''),
    linkedin: p.linkedin_url||''
  })).sort((a,b)=>rank(a.title)-rank(b.title)).slice(0,2);

  res.json({ domain: dom, contacts });
}
