import { NextResponse } from "next/server";
import { getOrderStore } from "@/lib/server/order-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      customerName?: string;
      quantities?: Record<string, number>;
    };
    const order = await getOrderStore().createOrder(
      body.customerName ?? "",
      body.quantities ?? {},
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "주문 생성 실패";
    return NextResponse.json({ message }, { status: 400 });
  }
}
