import { NextResponse } from "next/server";
import { runAgent } from "../../../lib/agent";

export async function POST(request) {
  try {
    const { messages } = await request.json();
    if (!Array.isArray(messages) || !messages.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }
    const userText = String([...messages].reverse().find(m => m.role === "user")?.content || "");
    const { reply, toolEvents } = await runAgent(messages);
    // persist the complaint so it survives refreshes and restarts
    let filed = false;
    try {
      const { readQueue } = await import("../../../lib/store");
      filed = (await readQueue()).length > 0;
    } catch {}
    try {
      const { appendComplaint } = await import("../../../lib/store");
      await appendComplaint({ user: userText, reply, filed });
    } catch (err) {
      console.error("[chat] history save failed:", err.message);
    }
    return NextResponse.json({ reply, toolEvents });
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json(
      { reply: `Something went wrong: ${err.message}`, toolEvents: [] },
      { status: 200 }
    );
  }
}
