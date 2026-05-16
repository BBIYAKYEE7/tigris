import { NextResponse } from "next/server";
import { getMergeRequestStore } from "@/lib/server/merge-request-store";

export async function GET() {
  try {
    const mergeRequests = await getMergeRequestStore().listMergeRequests();
    return NextResponse.json({ mergeRequests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "합석요청 목록 조회 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
