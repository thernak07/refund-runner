"use client";

import { useState, useEffect, useRef } from "react";

const SAMPLE_PROMPTS = [
  "Find charges that look refundable",
  "I was charged twice by a store — fix it",
  "I want a refund for the headphones I never got",
  "What disputes are already in progress?",
];

/** tiny formatter: strips markdown bold markers for clean chat display */
const fmt = (c) => (c || "").replace(/\*\*/g, "");

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hey, I'm Refund Runner 🤖💳\n\nGive me your PayPal activity and a problem — double charges, undelivered orders, surprise renewals — and I'll find the bad charge, write the claim, and queue the dispute. What's draining your wallet lately?",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolEvents, setToolEvents] = useState({});
  const [disputes, setDisputes] = useState([]);
  const [queue, setQueue] = useState([]);
  const [past, setPast] = useState([]);
  const [restored, setRestored] = useState(false);
  const chatRef = useRef(null);

  async function refreshSidebars() {
    try {
      const res = await fetch("/api/disputes");
      const data = await res.json();
      setDisputes(data.disputes || []);
      setQueue(data.queue || []);
    } catch {
      /* sidebar refresh is non-critical */
    }
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      const history = data.history || [];
      setPast(history);
      // restore the saved conversation on load (once)
      setMessages((prev) => {
        if (restored || history.length === 0) return prev;
        const convo = [...history].reverse().flatMap((h) => [
          { role: "user", content: h.user },
          { role: "assistant", content: h.reply },
        ]);
        setRestored(true);
        return [...prev, ...convo];
      });
    } catch {
      /* history refresh is non-critical */
    }
  }

  useEffect(() => {
    refreshSidebars();
  }, []);

  // surface hidden UI errors so they are visible in DevTools console
  useEffect(() => {
    const h = (e) => console.error("Refund Runner UI error:", e.error || e.reason);
    window.addEventListener("error", h);
    window.addEventListener("unhandledrejection", h);
    return () => {
      window.removeEventListener("error", h);
      window.removeEventListener("unhandledrejection", h);
    };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text) {
    const cleaned = (text ?? input).trim();
    if (!cleaned || busy) return;
    setInput("");
    const history = [...messages, { role: "user", content: cleaned }];
    setMessages(history);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        // abort after 3 minutes no matter what -> busy never sticks forever
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json();
      setMessages([
        ...history,
        { role: "assistant", content: data.reply || "..." },
      ]);
      if (data.toolEvents?.length) {
        setToolEvents((prev) => ({
          ...prev,
          [history.length]: data.toolEvents,
        }));
      }
    } catch (err) {
      setMessages([
        ...history,
        { role: "assistant", content: `Network error: ${err.message}` },
      ]);
    } finally {
      setBusy(false);
      refreshSidebars();
    }
  }

  function statusBadge(status) {
    const s = (status || "").toUpperCase();
    if (s === "OPEN") return <span className="badge open">OPEN</span>;
    if (s === "READY TO SUBMIT") return <span className="badge ready">READY</span>;
    return <span className="badge resolved">{s || "RESOLVED"}</span>;
  }

  return (
    <div className="layout">
      {/* ---------------- sidebar ---------------- */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">⚡</div>
          <div>
            Refund Runner
            <span className="sub">AI agent · PayPal Disputes · sandbox</span>
          </div>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="section-title">Disputes in progress</div>
          {disputes.length === 0 && (
            <div className="card row2">Nothing open. That&apos;s a good wallet.</div>
          )}
          {disputes.map((d) => (
            <div key={d.id} className="card">
              <div className="row1">
                <span>{d.id}</span> {statusBadge(d.status)}
              </div>
              <div className="row2">
                {d.subject} · {d.amount} · filed {d.opened}
              </div>
            </div>
          ))}

          <div className="section-title" style={{ marginTop: 18 }}>
            Queued by agent
          </div>
          {queue.length === 0 && (
            <div className="card row2">
              No drafts yet — tell the agent about a bad charge.
            </div>
          )}
          {queue.map((d, i) => (
            <div key={i} className="card">
              <div className="row1">
                <span>{d.transactionId}</span> {statusBadge(d.status)}
              </div>
              <div className="row2">{d.reason}</div>
              {d.claimText && <div className="claim">{d.claimText}</div>}
            </div>
          ))}
          <div className="section-title" style={{ marginTop: 18 }}>
            Past complaints
          </div>
          {past.length === 0 && (
            <div className="card row2">No complaints yet — saved ones will appear here.</div>
          )}
          {past.slice(0, 12).map((p) => (
            <div key={p.id} className="card">
              <div className="row1">
                <span style={{ maxWidth: "78%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.user}
                </span>
                <span className={`badge ${p.filed ? "ready" : "open"}`}>
                  {p.filed ? "FILED" : "LOGGED"}
                </span>
              </div>
              <div className="row2">{p.when}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------------- chat ---------------- */}
      <main className="panel chat">
        <div className="messages" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div className={`msg ${m.role}`}>{fmt(m.content)}</div>
              {toolEvents[i] && (
                <div className="tools">
                  {toolEvents[i].map((t, j) => (
                    <span key={j} className="tool-chip">
                      🛠 {t.action}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="typing">
              🛠 Agent is scanning transactions, drafting the claim and filing it…
              (this takes 15–30s, real multi-step work — not frozen)
            </div>
          )}
        </div>

        <div className="sample-row">
          {SAMPLE_PROMPTS.map((p) => (
            <button key={p} className="sample-btn" onClick={() => send(p)} disabled={busy}>
              {p}
            </button>
          ))}
        </div>

        <div className="composer">
          <input
            value={input}
            placeholder="Describe what went wrong — e.g. 'charged twice for pizza night'"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy && input.trim()) send();
            }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={busy || !input.trim()}
          >
            {busy ? "Working…" : "Send"}
          </button>
        </div>
      </main>
    </div>
  );
}
