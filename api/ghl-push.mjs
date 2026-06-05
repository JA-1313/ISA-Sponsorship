// api/ghl-push.mjs — Upsert a contact into GoHighLevel and tag it
// 'sponsorflow-prospect' so the GHL workflow (triggered by that tag) fires.
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});

  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID || 'ROvx2oZCZLAIAahr6LlX';
  if(!token) return res.status(500).json({error:'Missing GHL_TOKEN env var'});

  const b = typeof req.body==='string' ? JSON.parse(req.body||'{}') : (req.body||{});
  if(!b.email) return res.status(400).json({error:'email required'});

  const payload = {
    locationId,
    firstName: b.firstName||'', lastName: b.lastName||'',
    email: b.email,
    companyName: b.companyName||'',
    website: b.website||'',
    tags: ['sponsorflow-prospect'],
    source: 'SponsorFlow Finder'
  };

  const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert',{
    method:'POST',
    headers:{
      'Authorization':'Bearer '+token,
      'Version':'2021-07-28',
      'Content-Type':'application/json',
      'Accept':'application/json'
    },
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if(!r.ok) return res.status(r.status).json({error: j.message || 'GHL error'});
  res.json({ ok:true, contactId: j.contact && j.contact.id || null });
}
