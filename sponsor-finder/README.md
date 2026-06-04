# IOI Sponsor Finder — live search tool

A nationwide local-sponsor search you can embed on the site. It discovers real
businesses near any zip with the **Google Places API**, scores them with the
SponsorFlow fit model, shows the top 3 free, then captures the visitor with your
GoHighLevel form to unlock the rest. Owner/decision-maker emails come from
**Apollo** via a separate, protected endpoint.

```
Visitor types zip ─▶ /api/search ─▶ Google Geocoding + Google Places ─▶ fit scoring ─▶ top results
                                                                                          │
                                              (your tooling, gated) /api/enrich ─▶ Apollo ─▶ owner email
```

Files:
- `api/search.js` — public search + scoring (Google). No emails.
- `api/enrich.js` — protected owner lookup (Apollo). Secret-guarded.
- `public/index.html` — the embeddable widget (3 free, then GHL gate).
- `vercel.json`, `package.json` — config (no dependencies; uses built-in fetch).

---

## What you need (3 accounts)

1. **Google Cloud / Maps Platform** — for the business data. (Has a recurring free
   credit that covers thousands of searches/month.)
2. **Apollo.io** — for owner/decision-maker emails. (Paid plan required for API +
   email reveal.)
3. **Vercel** — free hosting for the two functions and the widget.

---

## Step 1 — Google Maps API key (~10 min)

1. Go to https://console.cloud.google.com/ and sign in.
2. Top bar → **Select a project** → **New Project** → name it `ioi-sponsor-finder` → Create.
3. Left menu → **APIs & Services → Library**. Search and **Enable** each of these:
   - **Geocoding API**
   - **Places API (New)**
4. Left menu → **APIs & Services → Credentials → + Create credentials → API key**. Copy the key.
5. (Important) Click the new key → **Restrict key**:
   - **API restrictions** → "Restrict key" → check **Geocoding API** and **Places API (New)**.
   - Save. (Later you can also add an HTTP-referrer restriction once you have the Vercel URL.)
6. Billing: if prompted, add a billing account. Google gives a recurring monthly
   credit; with caching this tool typically stays inside it. Set a **budget alert**
   under **Billing → Budgets & alerts** so you're never surprised.

Keep this key handy — it becomes `GOOGLE_MAPS_KEY` in Step 3.

---

## Step 2 — Apollo API key (~5 min)

1. Sign in at https://app.apollo.io/ (you need a plan that includes API access).
2. **Settings → Integrations → API** (or visit https://app.apollo.io/#/settings/integrations/api).
3. Create / copy your **API key**.

This becomes `APOLLO_API_KEY` in Step 3. Note: revealing verified emails consumes
Apollo credits, so we only enrich businesses you actually pursue — never the public widget.

---

## Step 3 — Deploy to Vercel (~10 min)

**Easiest path (no terminal):**
1. Create a free account at https://vercel.com/ (sign up with GitHub or email).
2. Put this folder in a GitHub repo (drag the files into a new repo at github.com/new),
   **or** use the Vercel CLI option below.
3. In Vercel → **Add New… → Project** → import that repo → **Deploy**.

**CLI path (if you prefer):**
```bash
npm i -g vercel
cd sponsor-finder
vercel            # follow prompts, accept defaults
vercel --prod     # deploys to your live URL
```

**Add your secrets** (Vercel → your project → **Settings → Environment Variables**),
then redeploy:

| Name               | Value                                  |
|--------------------|----------------------------------------|
| `GOOGLE_MAPS_KEY`  | the key from Step 1                    |
| `APOLLO_API_KEY`   | the key from Step 2                    |
| `ENRICH_SECRET`    | any long random string you make up    |

After deploy you'll get a URL like `https://ioi-sponsor-finder.vercel.app`.

---

## Step 4 — Test it

Open in a browser (replace with your URL + a real zip):
```
https://ioi-sponsor-finder.vercel.app/api/search?zip=34236&radius=30
```
You should get JSON with `results`. Then open the widget itself:
```
https://ioi-sponsor-finder.vercel.app/
```
Type a zip, hit Search — you'll see the top 3, then the gated form.

---

## Step 5 — Embed on the IOI site

Because the widget lives on Vercel, the simplest embed is an iframe. In a
Beaver Builder **HTML module** (or Custom HTML block) on the SponsorFlow page:

```html
<iframe src="https://ioi-sponsor-finder.vercel.app/"
        style="width:100%;height:1100px;border:none" title="Sponsor Finder"></iframe>
```

(Adjust the height to taste.) This replaces the mock finder section.

> Prefer no iframe? You can paste the contents of `public/index.html` (the `.box`
> markup + script) straight into a module instead — just set `API_BASE` at the top
> of the script to your Vercel URL (e.g. `"https://ioi-sponsor-finder.vercel.app"`),
> since it'll be calling the API cross-domain.

---

## Using the owner-enrichment endpoint (Apollo)

`/api/enrich` is intentionally **not** wired into the public widget — you don't want
to hand enriched emails to anonymous visitors. Call it from your own tooling once
you decide to pursue a business. It requires the secret header:

```bash
curl -X POST https://ioi-sponsor-finder.vercel.app/api/enrich \
  -H "Content-Type: application/json" \
  -H "x-enrich-secret: YOUR_ENRICH_SECRET" \
  -d '{"website":"https://example-orthodontics.com"}'
```
Returns the owner / marketing decision-maker name, title, and email (subject to
your Apollo plan's reveal credits). This is the hook for your internal prospecting
dashboard later.

---

## Cost & limits (rules of thumb)

- **Google**: each search calls Geocoding once + Places once per industry. Picking a
  specific industry = 2 calls; "All industries" = ~10 calls. Identical searches are
  cached for 24h (`s-maxage`), so repeats are free. Stay inside the monthly credit by
  keeping the default industry selector and the budget alert from Step 1.
- **Apollo**: only spent when you call `/api/enrich`. Zero cost from public searches.

---

## Later — Path B (your own database)

When you're ready to scale and own the data: bulk-pull businesses per region with
Outscraper/Apify, enrich with Apollo, and store in a database (e.g. Supabase). Point
`/api/search` at your database instead of Google. Same widget, richer data, cheaper
at volume — and it becomes the real prospecting engine behind SponsorFlow campaigns.
