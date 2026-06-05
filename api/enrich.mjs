// api/enrich.mjs — Apollo lookup: top 2 owner/exec contacts for a company domain.
// Uses Apollo's NEW api_search endpoint + people/match to reveal emails.
const TITLES = ['owner','founder','ceo','president','partner','chief marketing officer','marketing director','vp of marketing','general manager'];
const PRIORITY = ['owner','founder','chief executive','ceo','president','partner','chief marketing','marketing director','director of marketing','vp of marketing','general manager'];

function domainFrom(u){
  try { return new URL(u.startsWith('http')?u:'https://'+u).hostname.replace(/^www\./,''); }
  catch { return (u||'').replace(/^www\./,'').split('/')[0]; }
}
function rank(t){ t=(t||'').toLowerCase(); const i=PRIORITY.findIndex(k=>t.includes(k)); return i===-1?99:i; }
const isLocked = e => !e || /not_unlocked|@domain\.com/i.test(e);

async function matchPerson(id, key){
  try{
    const r = await fetch('https://api.apollo.io/api/v1/people/match',{
      method:'POST',
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache','X-Api-Key':key},
      body: JSON.stringify({ id })
    });
    const j = await r.json();
    return (j.person && j.person.email) ? j.person.email : null;
  }catch{ return null; }
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const key = process.env.APOLLO_API_KEY;
  if(!key) return res.status(500).json({error:'Missing APOLLO_API_KEY env var'});
  const dom = domainFrom(req.query.website || req.query.domain || '');
  if(!dom) return res.status(400).json({error:'website or domain required'});

  const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search',{
    method:'POST',
    headers:{'Content-Type':'application/json','Cache-Control':'no-cache','X-Api-Key':key},
    body: JSON.stringify({
      q_organization_domains_list: [dom],
      person_titles: TITLES,
      page: 1,
      per_page: 10
    })
  });
  const j = await r.json();
  if(!r.ok) return res.status(r.status).json({error: j.error || j.message || (j.errors&&j.errors[0]) || 'Apollo error'});

  const people = (j.people || j.contacts || [])
    .sort((a,b)=>rank(a.title)-rank(b.title))
    .slice(0,2);

  const contacts = [];
  for(const p of people){
    let email = p.email || null;
    if(isLocked(email) && p.id){
      email = await matchPerson(p.id, key);   // reveal via enrichment (uses a credit)
    }
    contacts.push({
      firstName: p.first_name||'', lastName: p.last_name||'',
      name: [p.first_name,p.last_name].filter(Boolean).join(' '),
      title: p.title||'',
      email: isLocked(email) ? null : email,
      locked: isLocked(email),
      linkedin: p.linkedin_url||''
    });
  }

  res.json({ domain: dom, contacts });
}
