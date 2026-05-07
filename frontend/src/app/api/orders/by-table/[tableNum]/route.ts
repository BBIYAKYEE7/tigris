import { NextResponse } from "next/server";
import { getOrderStore } from "@/lib/server/order-store";

type RouteContext = { params: Promise<{ tableNum: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { tableNum: raw } = await context.params;
  const tableNum = parseInt(raw, 10);
  if (Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
    return NextResponse.json({ message: "유효한 테이블 번호가 아닙니다." }, { status: 400 });
  }
  const label = `${tableNum}번 테이블`;
  const all = await getOrderStore().listOrders();
  const orders = all
    .filter((order) => order.customerName === label && order.status === "PENDING")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ orders });
}
