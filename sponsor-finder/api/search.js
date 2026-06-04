// api/search.js — Live sponsor discovery + fit scoring
// Uses Google Geocoding (zip -> lat/lng) + Google Places API (New) Text Search.
// Returns scored local businesses. NO emails here (that's enrich.js / Apollo).
// Runtime: Vercel serverless, Node 18+ (global fetch available).

const CATS = [
  { key: 'Restaurant',   q: 'restaurant',          prop: 78 },
  { key: 'Real Estate',  q: 'real estate agency',  prop: 88 },
  { key: 'Mortgage',     q: 'mortgage lender',      prop: 85 },
  { key: 'Attorney',     q: 'attorney law firm',    prop: 75 },
  { key: 'Insurance',    q: 'insurance agency',      prop: 82 },
  { key: 'Auto Dealer',  q: 'car dealership',        prop: 80 },
  { key: 'Medical',      q: 'medical clinic',        prop: 90 },
  { key: 'Orthodontist', q: 'orthodontist',          prop: 100 },
  { key: 'Fitness',      q: 'gym fitness center',     prop: 72 },
];

function milesBetween(a, b) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const clamp = n => Math.max(0, Math.min(100, n));

// Fit score from the signals Google Places gives us.
// (Owner email + "already sponsors locally" come later via Apollo — see enrich.js.)
function scoreOf(p, prop, dist, radiusMi) {
  const proximity = clamp(100 - (dist / radiusMi) * 100);                      // closer = better
  const reviews   = clamp(Math.log10((p.userRatingCount || 0) + 1) / Math.log10(500) * 100); // ~500 reviews ≈ 100
  const web       = p.websiteUri ? 95 : 40;                                    // has a website = marketing-active
  const phone     = p.nationalPhoneNumber ? 100 : 55;                          // reachable
  const s = prop * 0.30 + proximity * 0.22 + reviews * 0.18 + web * 0.15 + phone * 0.15;
  return Math.min(99, Math.round(s));
}

async function geocode(zip, key) {
  const u = `https://maps.googleapis.com/maps/api/geocode/json?components=postal_code:${encodeURIComponent(zip)}&key=${key}`;
  const j = await (await fetch(u)).json();
  const loc = j.results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

async function searchCat(cat, center, radiusM, key) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.businessStatus'
    },
    body: JSON.stringify({
      textQuery: cat.q,
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
      maxResultCount: 20
    })
  });
  const j = await r.json();
  return (j.places || []).map(pl => ({
    id: pl.id,
    name: pl.displayName?.text || '',
    address: pl.formattedAddress || '',
    lat: pl.location?.latitude,
    lng: pl.location?.longitude,
    rating: pl.rating || null,
    userRatingCount: pl.userRatingCount || 0,
    websiteUri: pl.websiteUri || '',
    nationalPhoneNumber: pl.nationalPhoneNumber || '',
    status: pl.businessStatus || '',
    industry: cat.key,
    prop: cat.prop
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // tighten to your domain in production
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(500).json({ error: 'Missing GOOGLE_MAPS_KEY env var' });

  const { zip, radius = '30', industry = '', limit = '12' } = req.query;
  if (!zip) return res.status(400).json({ error: 'zip is required' });

  const radiusMi = Math.min(50, Math.max(1, parseInt(radius) || 30));
  const radiusM = Math.round(radiusMi * 1609.34);

  const center = await geocode(zip, key);
  if (!center) return res.status(404).json({ error: 'Could not find that zip code' });

  const cats = industry ? CATS.filter(c => c.key.toLowerCase() === industry.toLowerCase()) : CATS;
  if (cats.length === 0) return res.status(400).json({ error: 'Unknown industry' });

  const batches = await Promise.all(cats.map(c => searchCat(c, center, radiusM, key).catch(() => [])));

  const seen = new Set();
  let all = [];
  for (const arr of batches) {
    for (const p of arr) {
      if (!p.id || seen.has(p.id) || p.lat == null) continue;
      if (p.status && p.status !== 'OPERATIONAL') continue;
      const dist = milesBetween(center, { lat: p.lat, lng: p.lng });
      if (dist > radiusMi) continue;
      seen.add(p.id);
      p.distance = Math.round(dist * 10) / 10;
      p.fit = scoreOf(p, p.prop, dist, radiusMi);
      p.estBudget = p.fit >= 88 ? 2500 : p.fit >= 80 ? 1500 : p.fit >= 72 ? 1000 : 500;
      all.push(p);
    }
  }
  all.sort((a, b) => b.fit - a.fit);
  const top = all.slice(0, Math.min(25, parseInt(limit) || 12));

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); // cache identical searches for a day
  res.json({
    center,
    total: all.length,
    results: top.map(p => ({
      name: p.name, industry: p.industry, address: p.address, distance: p.distance,
      rating: p.rating, reviews: p.userRatingCount, website: p.websiteUri, phone: p.nationalPhoneNumber,
      fit: p.fit, estBudget: p.estBudget
    }))
  });
}
