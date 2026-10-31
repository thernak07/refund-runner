/**
 * Refund Runner agent brain.
 *
 * The agent speaks natural language and can call tools:
 *   - search_transactions  : fetch last 30 days of PayPal(-style) transactions
 *   - draft_claim          : get full details of one transaction for claim writing
 *   - file_dispute         : queue a dispute draft (id, reason, claim text)
 *   - queue_status         : list queued dispute drafts
 *   - list_disputes        : fetch open/past PayPal disputes
 *
 * The LLM is used in "JSON mode by convention": every response must be a
 * single JSON object. We loop until the model returns action:"final".
 */

const TOOLS_TEXT = `
Available actions (choose ONE per step):
- "search_transactions"   args: {}                        -> returns recent transactions. Use FIRST when user wants refunds or to find problems.
- "draft_claim"           args: {"transactionId": "..."}  -> returns the transaction's full details so you can draft the claim text.
- "file_dispute"          args: {"transactionId": "...", "reason": "short reason", "claimText": "full plain-language claim paragraph", "severity": "high|medium|low"} -> queues the dispute. ONLY after drafting.
- "queue_status"          args: {}                        -> list dispute drafts queued so far.
- "list_disputes"         args: {}                        -> list real/known PayPal disputes (OPEN / RESOLVED).
- "final"                 args: {}                        -> done answering; put your full user-facing answer in "reply".
`;

const SYSTEM_PROMPT = `You are Refund Runner, an AI agent that helps users find refundable charges in their activity and file refund disputes against merchants.

Style: direct, warm, confident, zero fluff. Use plain language. Dollar-values matter: quantify everything.

Workflow rules:
1. Refund-related request -> ALWAYS start with search_transactions (and list_disputes when relevant to know history).
2. For every candidate refund you found, tell the user which transaction you want to dispute and why, BEFORE filing.
3. To draft a claim: call draft_claim, then write a factual short claim (what happened, dates, why merchant owes money, desired outcome). Then call file_dispute.
4. Never invent transactions. Only reference ones from tool results.
5. If nothing looks refundable, say so honestly and suggest what to watch for.
6. You may combine multiple disorder orders into one answer, but file disputes one transaction at a time.
7. Important: news flashes such as pricing, sandbox limits or anything not in tool output -> never fabricate.
8. NEVER end your turn with an announcement of what you are ABOUT to do ("let me check...", "I'll look for that now"). That is lazy. Either DO the action now with tools, or ask the user a question. A final reply must contain an OUTCOME: a filed dispute ID, a list of found refundable charges, or a request for the missing information.
9. A dispute can be queued only ONCE per transaction - the tool enforces this. When the user says "yes", "submit", "go ahead" for an already-queued dispute: call queue_status to confirm it still exists, then answer that in the PayPal sandbox a dispute cannot be auto-submitted by third-party apps, so it remains READY TO SUBMIT there and would be one-click submitted with live credentials in production. NEVER request file_dispute again for the same transaction.

HARD SAFETY RULES - violating any of these is a failure:
A. If draft_claim says the transaction was NOT FOUND, you MUST NOT file any dispute. Instead tell the user that ID does not exist in the last 30 days and ask them to check the ID or pick from the search results. Never substitute a different transaction for a missing ID.
B. You may only file a dispute if the USER has stated a concrete problem (undelivered, wrong amount, duplicate, spoiled/defective, cancelled-then-charged, unwanted renewal) OR the transaction note clearly shows one. If the user asks to dispute something with no stated problem (e.g. a normal successful purchase), DO NOT file - ask the user what went wrong and list valid dispute reasons.
C. The claim text may only assert facts the user stated or facts visible in the transaction note. NEVER invent new reasons, symptoms, or feelings ("not satisfactory", "fraud", "scam") that neither the user nor the note mentioned. If the user uses vague or dramatic language, restate it factually or ask for specifics.
D. Amounts in replies: display charge amounts as positive ("$49.90"), never as "-49.90".

${TOOLS_TEXT}

Response format (STRICT - single JSON object, no markdown fences):
{"action":"<action name>","args":{...},"reply":"<text shown to the user right now or final answer>"}`;

function llmConfig() {
  const baseUrl = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "openai/gpt-4o-mini";
  return { baseUrl: `${baseUrl}/chat/completions`, model };
}

async function callLLM(messages) {
  const { baseUrl, model } = llmConfig();
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
    }),
    // hard timeout so a hung provider never freezes the agent
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

/** Pull the first JSON object out of the LLM output robustly. */
function parseAgentJSON(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { action: "final", args: {}, reply: cleaned || "..." };
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return { action: "final", args: {}, reply: cleaned };
  }
}

/* ---------------- tools ---------------- */

async function toolSearchTransactions() {
  const { searchTransactions } = await import("./paypal");
  const { source, transactions } = await searchTransactions();
  const lines = transactions
    .map(
      (t) =>
        `${t.id} | ${t.date} | ${t.merchant} | ${String(t.amount).replace(/^-/, "")} ${t.currency} | ${t.note}`
    )
    .join("\n");
  return `DATA SOURCE: ${source}\nTRANSACTIONS:\n${lines || "(none found)"}`;
}

async function toolDraftClaim(transactionId) {
  const { searchTransactions } = await import("./paypal");
  const { transactions } = await searchTransactions();
  const tx = transactions.find((t) => t.id === transactionId);
  if (!tx) return `Transaction ${transactionId} not found in the last 30 days.`;
  const details = { ...tx, amount: String(tx.amount).replace(/^-/, "") };
  return `FULL TRANSACTION DETAILS:\n${JSON.stringify(details, null, 2)}\nDraft the claim text now, then call file_dispute with it.`;
}

async function toolFileDispute(args, problemStated) {
  // code-level guardrail: no user-stated problem -> no dispute, period.
  if (!problemStated) {
    return `REJECTED: The user has not described any concrete problem (no undelivered item, duplicate, wrong amount, defect, cancellation or similar). Ask the user what actually went wrong first. Do NOT invent a reason yourself.`;
  }
  const { addDraft, readQueue } = await import("./store");
  // dedupe: the same transaction can only ever be queued once
  const existing = (await readQueue()).find(
    (d) => d.transactionId === args.transactionId
  );
  if (existing) {
    return `ALREADY QUEUED: a dispute for ${args.transactionId} (${existing.reason}) is already READY TO SUBMIT. Do NOT file it again. Tell the user this dispute is already pending - nothing more to do on it right now.`;
  }
  const entry = await addDraft({
    transactionId: args.transactionId || "unknown",
    reason: args.reason || "refund requested",
    claimText: args.claimText || "",
    severity: args.severity || "medium",
    status: "READY TO SUBMIT",
  });
  return `Dispute draft queued: ${JSON.stringify(entry)}. Tell the user it is READY TO SUBMIT and show the claim text.`;
}

async function toolQueueStatus() {
  const { readQueue } = await import("./store");
  const q = await readQueue();
  return q.length
    ? `QUEUE:\n${q
        .map((d) => `${d.transactionId} | ${d.reason} | ${d.status} | ${d.created}`)
        .join("\n")}`
    : "Queue is empty - no disputes drafted yet this session.";
}

async function toolListDisputes() {
  const { listDisputes } = await import("./paypal");
  const disputes = await listDisputes();
  return disputes.length
    ? `DISPUTES:\n${disputes
        .map((d) => `${d.id} | ${d.status} | ${d.subject} | ${d.amount}`)
        .join("\n")}`
    : "No disputes on record.";
}

const PROBLEM_REGEX =
  /(refund|never|not received|didn'?t (arrive|receive|get)|double|twice|duplicate|spoiled|defective|damaged|broken|cancel|charged|wrong|mistake|unauthorized|fraud|scam|hacked|renew|suspicious|problem|issue|don'?t want|no longer|missing|faulty|late)/i;

export async function runAgent(history) {
  // did the user state a concrete money problem anywhere in the conversation?
  const problemStated = (history || [])
    .filter((m) => m.role === "user" && !String(m.content).startsWith("TOOL_RESULT"))
    .some((m) => PROBLEM_REGEX.test(String(m.content)));

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolEvents = [];

  for (let step = 0; step < 5; step++) {
    const raw = await callLLM(messages);
    const parsed = parseAgentJSON(raw);

    // The model skipped its JSON protocol -> force one retry instead of
    // treating casual text as a finished answer.
    if (!parsed.action && step < 4) {
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content:
          "Invalid agent response: you did not answer in the required single-JSON format. Re-send your next step as {\"action\":..., \"args\":..., \"reply\":...} EXACTLY once. Continue the task - do not repeat the mistake. If you already have enough information to file, use file_dispute now.",
      });
      continue;
    }

    if (parsed.action === "final") {
      return { reply: parsed.reply || parsed.message || "Done.", toolEvents };
    }

    let result;
    try {
      switch (parsed.action) {
        case "search_transactions":
          result = await toolSearchTransactions();
          break;
        case "draft_claim":
          result = await toolDraftClaim(parsed.args?.transactionId);
          break;
        case "file_dispute":
          result = await toolFileDispute(parsed.args || {}, problemStated);
          break;
        case "queue_status":
          result = await toolQueueStatus();
          break;
        case "list_disputes":
          result = await toolListDisputes();
          break;
        default:
          result = `Unknown action "${parsed.action}". ${TOOLS_TEXT}`;
      }
    } catch (err) {
      result = `Tool error: ${err.message}`;
    }

    toolEvents.push({ action: parsed.action, summary: String(result).slice(0, 160) });
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `TOOL_RESULT for ${parsed.action}:\n${result}\nContinue with the next JSON step.`,
    });
  }

  return {
    reply:
      "I ran out of steps before finishing - try rephrasing your request (e.g. \"find refundable charges\").",
    toolEvents,
  };
}
