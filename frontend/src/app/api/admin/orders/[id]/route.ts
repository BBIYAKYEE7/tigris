import { NextResponse } from "next/server";
import { getOrderStore, type OrderStatus } from "@/lib/server/order-store";
import {
  clearTablePresence,
  parseTableNumFromCustomerName,
} from "@/lib/server/table-presence";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: OrderStatus };
    const status = body.status;
    if (!status || !["PENDING", "PAID"].includes(status)) {
      return NextResponse.json({ message: "유효한 상태값이 아닙니다." }, { status: 400 });
    }
    const order = await getOrderStore().updateOrderStatus(id, status);
    if (status === "PAID") {
      const tableNum = parseTableNumFromCustomerName(order.customerName);
      if (tableNum !== null) {
        const label = `${tableNum}번 테이블`;
        const all = await getOrderStore().listOrders();
        const stillPending = all.some((o) => o.customerName === label && o.status === "PENDING");
        if (!stillPending) {
          await clearTablePresence(tableNum);
        }
      }
    }
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상태 변경 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
