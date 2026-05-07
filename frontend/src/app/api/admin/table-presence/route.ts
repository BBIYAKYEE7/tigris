import { NextResponse } from "next/server";
import { listActiveTablePresence } from "@/lib/server/table-presence";

export async function GET() {
  const headers = new Headers({
    "Cache-Control": "no-store, must-revalidate",
  });
  const activeTables = await listActiveTablePresence();
  return NextResponse.json({ activeTables }, { headers });
}
