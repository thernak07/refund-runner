/**
 * File-backed stores (runtime data, gitignored):
 *  - data/queue.json    : dispute drafts queued by the agent
 *  - data/history.json  : every user complaint + agent reply, ever
 */
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const QUEUE = path.join(DATA_DIR, "queue.json");
const HISTORY = path.join(DATA_DIR, "history.json");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

/* ---------- dispute queue ---------- */

export async function readQueue() {
  return readJson(QUEUE, []);
}

export async function writeQueue(q) {
  await writeJson(QUEUE, q);
}

export async function addDraft(draft) {
  const q = await readQueue();
  const entry = {
    ...draft,
    created: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  q.unshift(entry);
  await writeJson(QUEUE, q);
  return entry;
}

/* ---------- complaint history ---------- */

export async function appendComplaint({ user, reply, filed }) {
  const h = await readJson(HISTORY, []);
  h.unshift({
    id: `C-${Date.now()}`,
    when: new Date().toISOString().slice(0, 16).replace("T", " "),
    user: String(user).slice(0, 400),
    reply: String(reply).slice(0, 1200),
    filed: Boolean(filed),
  });
  // keep the last 100 complaints
  await writeJson(HISTORY, h.slice(0, 100));
  return h[0];
}

export async function readHistory(limit = 100) {
  const h = await readJson(HISTORY, []);
  return h.slice(0, limit);
}
