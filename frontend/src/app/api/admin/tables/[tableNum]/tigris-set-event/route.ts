import { NextResponse } from "next/server";
import { setTableTigrisSetEvent } from "@/lib/server/table-tigris-event";

type RouteContext = { params: Promise<{ tableNum: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { tableNum: tableNumRaw } = await context.params;
    const tableNum = parseInt(tableNumRaw, 10);
    if (Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      return NextResponse.json({ message: "유효한 테이블 번호가 아닙니다." }, { status: 400 });
    }

    const body = (await request.json()) as { tigrisSetEventParticipating?: boolean };
    if (typeof body.tigrisSetEventParticipating !== "boolean") {
      return NextResponse.json({ message: "tigrisSetEventParticipating 값이 필요합니다." }, { status: 400 });
    }

    await setTableTigrisSetEvent(tableNum, body.tigrisSetEventParticipating);

    return NextResponse.json({
      tableNum,
      tigrisSetEventParticipating: body.tigrisSetEventParticipating,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이벤트 상태 저장 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
