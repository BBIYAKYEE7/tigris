import { NextResponse } from "next/server";
import { listTableTigrisSetEvents } from "@/lib/server/table-tigris-event";

export async function GET() {
  try {
    const tableEvents = await listTableTigrisSetEvents();
    return NextResponse.json({ tableEvents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이벤트 상태 조회 실패";
    return NextResponse.json({ message }, { status: 500 });
  }
}
