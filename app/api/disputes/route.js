import { NextResponse } from "next/server";
import { listDisputes } from "../../../lib/paypal";
import { readQueue } from "../../../lib/store";

export async function GET() {
  try {
    const [disputes, queue] = await Promise.all([listDisputes(), readQueue()]);
    return NextResponse.json({ disputes, queue });
  } catch (err) {
    console.error("[disputes]", err);
    return NextResponse.json(
      { disputes: [], queue: [], error: err.message },
      { status: 200 }
    );
  }
}
