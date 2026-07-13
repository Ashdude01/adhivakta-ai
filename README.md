# Erolt AI — Legal Workspace (Next.js)

AI-powered legal **drafting**, **case & draft library**, **document review + chat**, and **e-signature** for Indian advocates. Built with Next.js 14 (App Router) + TypeScript. Fully responsive, installable as a PWA, with 5 switchable themes and a pluggable AI/e-sign provider layer.

> **Runs out of the box with ZERO API keys** in offline "demo" mode. Add free keys later to switch on real AI and e-signature.

---

## 🚀 Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy env (already provided as .env.local — runs in mock mode)
#    Edit .env.local to add keys later.

# 3. Run
npm run dev
# open http://localhost:3000
```

**Demo login:** `advocate@adhivakta.ai` / `advocate123`

---

## 🔑 Adding AI models (free first)

Paste a key into `.env.local` and leave `AI_PROVIDER` blank — the app picks
whichever provider has a key. Set `AI_PROVIDER` to pin one, or to `mock` to stay
offline with keys present.

| Provider | Get a key | Free models |
|---|---|---|
| **Gemini** | https://aistudio.google.com/app/apikey | Gemini 3.x Flash |
| **Groq** | https://console.groq.com/keys | Meta Llama 3.3 (fast) |
| **OpenRouter** | https://openrouter.ai/keys | many `:free` models |
| **Hugging Face** | https://huggingface.co/settings/tokens | Mistral, etc. |
| OpenAI (paid) | https://platform.openai.com | gpt-4o-mini |

```env
AI_PROVIDER=
GEMINI_API_KEY=your-key-here
```

The drafting screen shows a **model picker** listing only the providers whose key
is present — the keys never reach the browser.

**Gemini model note:** `gemini-1.5-flash` and `gemini-2.5-flash` are retired for
new API keys, and `gemini-2.0-flash` has no free-tier quota. Leave `GEMINI_MODEL`
blank to use the app's default. Google's free quota is *per model*, so when the
chosen model is busy (503) or out of quota (429) the app automatically falls back
to another free model and tells you which one wrote the draft.

Drafts **stream** as they are written, with a Stop button. If the provider fails
mid-stream the error is shown and the partial text kept — demo text is never
silently spliced into a real draft. Non-streaming calls (chat, review) still
degrade to demo output rather than crashing.

---

## ✍️ e-Signature

- **Manual** (draw-to-sign) → works right now.
- **Aadhaar eSign / DSC** → add `LEEGALITY_API_KEY` or `DIGIO_*` creds in `.env.local`.
- **DocuSign** → add `DOCUSIGN_*` creds.

A built-in **IT Act Schedule I** check blocks documents that legally cannot be e-signed (wills, certain PoAs, sale deeds, etc.).

---

## 🎨 Theming

5 themes (Light, Dark, Aqua, Magenta, Evergreen) switchable in **Settings**. Every colour is a CSS variable in `app/globals.css` — change a token once and it applies everywhere. To add a theme, copy a `[data-theme="..."]` block and add it to `THEMES` in `components/ThemeProvider.tsx`.

---

## 📱 PWA (installable web app)

`public/manifest.webmanifest` + `public/sw.js` make the app installable on phone/desktop. When supported, an **Install** button appears. Works across phone, tablet and desktop (responsive layout with a mobile drawer).

---

## 🗂️ Project structure

```
app/
  (app)/            ← authenticated shell + pages
    dashboard, draft, review, library, esign, settings, matters
  api/              ← draft, chat, review, esign, auth
  login/            ← sign-in
  globals.css       ← design system + 5 themes (all CSS variables)
components/         ← AppShell, Sidebar/Topbar, ThemeProvider, SignaturePad, Icons
lib/
  ai/               ← provider abstraction (mock + gemini/groq/openrouter/openai/hf)
  esign/            ← provider abstraction + IT Act Schedule I check
  auth.ts           ← NextAuth (JWT, bcrypt)
  data/cases.ts     ← offline library seed
```

---

## 🧭 Roadmap (phases)

- **Phase 0 — Foundation** ✅ project, auth/session, responsive shell, themes, PWA, Supabase Postgres schema + migrations, audit-log skeleton.
- **Phase 1 — Core AI** ✅ Drafting with **deterministic citation verifier** (statute registry + library resolution, verify links, export block + logged override), draft versions, court-format **DOCX export**, Review+Chat with **persisted sessions, FTS-chunk grounding and ¶-citations**, Library with **verify links**.
- **Phase 2 — e-Sign + Moat** ✅ manual sign + IT Act Schedule I eligibility engine (decisions stored as compliance artefacts), e-sign event trail, **contribution pipeline with rule-based PII anonymiser** (anonymise → contributor confirms redactions → automated duplicate/residual-PII moderation gate → publish + credit ledger), DPDP consent records. Aadhaar/DSC/DocuSign adapters ready — *add provider keys to switch on*.
- **Phase 2.5 — Matters** ✅ guided matter intake (type, parties, court, key dates), matter folder (drafts / signatures / reviews filed per matter), append-only audit log on every sensitive action.
- **Phase 3 — Scale** ⏳ pgvector embeddings (needs an embedding API key), OCR for scans/handwriting (Document AI key), Indian Kanoon live ingestion (API token), Hindi/regional generation, WhatsApp bot, firm workspaces, Razorpay billing.

---

## ✅ What works now vs. needs keys

**Works offline (no keys):** login, all screens, theme switching, PWA install, case library search, manual e-sign, drafting templates, keyword-based review/chat.

**Needs a (free) key:** full AI drafting, AI review summaries, semantic chat → add an AI key. Aadhaar/DSC/DocuSign → add provider keys. Persistent users/matters → add Postgres (`DATABASE_URL`).

---

## 📋 What I need from you (to go further)

1. **One free AI key** (Gemini or Groq) to turn on real drafting/chat.
2. **Postgres URL** (e.g. Neon/Supabase free tier) when you want real accounts + saved matters.
3. **e-sign provider** decision (Leegality / Digio) + sandbox keys for Aadhaar eSign.
4. **Indian Kanoon API token** to expand the live judgment library.
5. **OCR provider** key (Google Document AI / Azure) for scanned/handwritten files.
