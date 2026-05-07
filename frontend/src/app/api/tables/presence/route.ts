import { NextResponse } from "next/server";
import {
  clearTablePresence,
  pingTablePresence,
} from "@/lib/server/table-presence";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tableNum?: number };
    const tableNum = body.tableNum;
    if (typeof tableNum !== "number" || Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      return NextResponse.json({ message: "유효한 테이블 번호가 아닙니다." }, { status: 400 });
    }
    await pingTablePresence(tableNum);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "테이블 상태 갱신 실패" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { tableNum?: number };
    const tableNum = body.tableNum;
    if (typeof tableNum !== "number" || Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      return NextResponse.json({ message: "유효한 테이블 번호가 아닙니다." }, { status: 400 });
    }
    await clearTablePresence(tableNum);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "테이블 상태 삭제 실패" }, { status: 500 });
  }
}
