import { NextResponse } from "next/server";
import { getOrderStore, type OrderStatus } from "@/lib/server/order-store";

const adminToken = process.env.ADMIN_TOKEN ?? "";

type RouteContext = { params: Promise<{ id: string }> };

function validateAdminWrite(requestToken: string | undefined) {
  if (!adminToken) {
    return null;
  }
  if (requestToken !== adminToken) {
    return "관리자 인증 실패";
  }
  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const authError = validateAdminWrite(request.headers.get("x-admin-token") ?? undefined);
  if (authError) {
    return NextResponse.json({ message: authError }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: OrderStatus };
    const status = body.status;
    if (!status || !["PENDING", "PAID"].includes(status)) {
      return NextResponse.json({ message: "유효한 상태값이 아닙니다." }, { status: 400 });
    }
    const order = await getOrderStore().updateOrderStatus(id, status);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상태 변경 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
