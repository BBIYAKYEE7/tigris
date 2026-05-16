import { NextResponse } from "next/server";
import { getMergeRequestStore } from "@/lib/server/merge-request-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tableNum?: number };
    const tableNum = body.tableNum;

    if (!tableNum || tableNum < 1 || tableNum > 999) {
      return NextResponse.json(
        { message: "유효한 테이블 번호를 입력해 주세요" },
        { status: 400 },
      );
    }

    const mergeRequest = await getMergeRequestStore().addMergeRequest(tableNum);
    return NextResponse.json({ mergeRequest }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "합석요청 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
