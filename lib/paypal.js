/**
 * PayPal sandbox helpers.
 * All calls fail gracefully: if PayPal keys are missing or sandbox is empty,
 * the app falls back to mock data so the demo never breaks.
 */
import { getMockTransactions, getMockDisputes } from "../data/mockdata";

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export function paypalConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
  );
}

let cachedToken = null; // { token, expiresAt }
let paypalUnhealthyUntil = 0; // skip live calls after repeated failures

/** Returns true if we should try the live API, false if still in cooldown. */
function liveAllowed() {
  return Date.now() >= paypalUnhealthyUntil;
}

function markUnhealthy() {
  // cooldown: retry live PayPal after 3 minutes (per server process)
  paypalUnhealthyUntil = Date.now() + 3 * 60 * 1000;
}


async function getToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function paypalFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Transaction Search API (sandbox works with the free REST app).
 * Search window must be <= 31 days, so we query the last 30.
 */
export async function searchTransactions(days = 30) {
  if (!paypalConfigured() || !liveAllowed()) {
    return { source: "mock", transactions: getMockTransactions() };
  }
  try {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const data = await paypalFetch(
      `/v1/transactions/search?start_date=${start}&end_date=${new Date()
        .toISOString()
        .slice(0, 10)}&page_size=50`
    );
    const txs = (data.transaction_details || []).map((t) => {
      const info = t.transaction_info || {};
      return {
        id: info.transaction_id,
        date: info.transaction_initiation_date?.slice(0, 10),
        merchant: info.transaction_subject || info.transaction_note || "Unknown merchant",
        amount: info.transaction_amount?.value ?? "?",
        currency: info.transaction_amount?.currency_code || "USD",
        status: info.transaction_status,
        note: info.transaction_note || "",
      };
    });
    if (!txs.length) {
      return { source: "mock", transactions: getMockTransactions() };
    }
    return { source: "paypal-sandbox", transactions: txs };
  } catch (err) {
    console.error("[paypal] transaction search failed, using mock:", err.message);
    markUnhealthy();
    return { source: "mock", transactions: getMockTransactions() };
  }
}

/**
 * Disputes API — LIST works in sandbox. CREATE does not, so Refund Runner
 * queues new dispute drafts locally (with a "ready to submit" status).
 */
export async function listDisputes() {
  if (!paypalConfigured() || !liveAllowed()) return getMockDisputes();
  try {
    const data = await paypalFetch("/v2/customer/disputes");
    const disputes = (data.disputes || []).map((d) => ({
      id: d.dispute_id,
      status: d.status,
      subject: d.subject,
      amount: `${d.disputed_amount?.value ?? "?"} ${d.disputed_amount?.currency_code ?? ""}`,
      opened: d.create_time?.slice(0, 10),
      source: "paypal-sandbox",
    }));
    return disputes.length ? disputes : getMockDisputes();
  } catch (err) {
    console.error("[paypal] list disputes failed, using mock:", err.message);
    markUnhealthy();
    return getMockDisputes();
  }
}
