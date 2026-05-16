import { NextResponse } from "next/server";
import { getMergeRequestStore } from "@/lib/server/merge-request-store";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tableNum: string }> },
) {
  try {
    const { tableNum: tableNumStr } = await params;
    const tableNum = parseInt(tableNumStr, 10);

    if (Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      return NextResponse.json(
        { message: "유효한 테이블 번호를 입력해 주세요" },
        { status: 400 },
      );
    }

    await getMergeRequestStore().removeMergeRequest(tableNum);
    return NextResponse.json({ message: "합석요청 이 제거되었습니다" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "합석요청 제거 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
