import { NextResponse } from "next/server";
import { readHistory } from "../../../lib/store";

export async function GET() {
  try {
    const history = await readHistory(100);
    return NextResponse.json({ history });
  } catch (err) {
    console.error("[history]", err);
    return NextResponse.json({ history: [], error: err.message }, { status: 200 });
  }
}
