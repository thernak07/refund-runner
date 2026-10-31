# ⚡ Refund Runner

> An AI agent that fights for your refunds. You describe what went wrong — it finds the bad charge in your PayPal activity, writes the dispute claim, and queues it. Money back, minus the phone call.

Built for the **PayPal AI Hackathon: Build What's Next with PayPal and AI** (Devpost, Nov 2026).

## What it does

1. **You chat.** "I was charged twice by a store" or "the headphones never arrived."
2. **The agent scans** your last 30 days of transactions (PayPal Transaction Search API; falls back to seeded demo data when sandbox is empty).
3. **It detects refundable charges** — duplicates, non-delivery, spoiled/defective items, unwanted renewals.
4. **It drafts the claim** — a factual, plain-language dispute paragraph with dates and amounts.
5. **It queues the dispute** in a READY TO SUBMIT state (sandbox Disputes API cannot create disputes, so drafts are prepared for one-click submission). The same transaction can never be queued twice — dedupe is enforced in code.
6. **Everything persists.** A file-backed ledger ("Past Complaints" in the sidebar) remembers every complaint and its outcome; the full conversation is restored on reload.
7. **The dispute tracker** sidebar shows open PayPal disputes + drafts the agent created.
8. **Code-level guardrails.** No dispute can be filed unless the user stated a concrete problem; claims can only reference real transactions; high-stakes money actions always stay under human approval.

## Why it fits this hackathon

| Judging criterion | How Refund Runner addresses it |
|---|---|
| Technological Implementation | Agent → tool-loop architecture calling **PayPal Transaction Search API + Disputes API** (OAuth client-credentials, sandbox) and an LLM (OpenRouter/OpenAI-compatible) as a JSON-protocol planner |
| Potential Impact | Disputes are the most painful, abandoned flow in payments; refunds are money that belongs to people |
| Innovation | Refunds as an *agentic* conversation, not a form |
| Design | Single-screen chat UI with live dispute tracker; zero configuration for the user |
| Presentation | 3-minute story: wrong charge → agent detects → claim written → dispute queued |

## Architecture

```
app/page.js                 chat UI + dispute tracker sidebar
app/api/chat/route.js       agent endpoint (multi-step tool loop)
app/api/disputes/route.js   sidebar data feed
lib/agent.js                system prompt, tool router, LLM JSON protocol
lib/paypal.js               PayPal OAuth + Transaction Search + Disputes APIs
lib/store.js                file-backed dispute draft queue
data/mockdata.js            demo transaction history (fallback when sandbox empty)
```

## Run it

```bash
npm install
cp .env.local.example .env.local   # then paste your keys
npm run dev                        # http://localhost:3000
```

**Keys you need (all free):**

1. **PayPal sandbox** — create a REST app at https://developer.paypal.com/dashboard/applications/sandbox → copy Client ID + Secret into `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
2. **AI key** — OpenRouter (`https://openrouter.ai/keys`) or any OpenAI-compatible endpoint. Set `AI_BASE_URL` and `AI_MODEL` accordingly.

**No PayPal keys?** The app still runs: it transparently falls back to the mock transaction history so the demo works anywhere.

## Tech stack

Next.js 15 · React 19 · plain JavaScript · PayPal REST APIs (sandbox) · any OpenAI-compatible LLM · zero UI libraries, hand-written CSS.

## Honest product boundaries

- Dispute **drafts** are queued locally rather than auto-submitted. Two reasons: the PayPal sandbox does not support creating disputes via API, and we believe high-stakes money actions deserve a human confirmation step — the draft queue is that step.
- In production, the queue would submit through the merchant-resolution / Disputes API against live credentials, behind the same human approval gate.

## Team

Built by **Raunak Tanwar** — BTech CSE, Lovely Professional University (LPU).
