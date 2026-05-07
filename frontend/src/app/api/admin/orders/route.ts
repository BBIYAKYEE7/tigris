import { NextResponse } from "next/server";
import { getOrderStore, ordersPersistenceSplitBrain } from "@/lib/server/order-store";

export async function GET() {
  const headers = new Headers({
    "Cache-Control": "no-store, must-revalidate",
  });
  if (ordersPersistenceSplitBrain()) {
    headers.set("X-Tigris-Orders-Split-Brain", "1");
  }
  const orders = await getOrderStore().listOrders();
  return NextResponse.json({ orders }, { headers });
}
