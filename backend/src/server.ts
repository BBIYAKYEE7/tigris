import "./env";
import cors from "cors";
import express from "express";
import { menuItems, orderStore, type OrderStatus } from "./store";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const adminToken = process.env.ADMIN_TOKEN ?? "";

app.use(
  cors({
    origin: true,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/menu", (_req, res) => {
  res.json({ menuItems });
});

app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body as { customerName?: string; quantities?: Record<string, number> };
    const order = await orderStore.createOrder(body.customerName ?? "", body.quantities ?? {});
    res.status(201).json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "주문 생성 실패";
    res.status(400).json({ message });
  }
});

app.get("/api/orders/by-table/:tableNum", async (req, res) => {
  const tableNum = parseInt(req.params.tableNum, 10);
  if (Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
    res.status(400).json({ message: "유효한 테이블 번호가 아닙니다." });
    return;
  }
  const label = `${tableNum}번 테이블`;
  const all = await orderStore.listOrders();
  const orders = all
    .filter((order) => order.customerName === label && order.status === "PENDING")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ orders });
});

const validateAdminWrite = (requestToken: string | undefined) => {
  if (!adminToken) {
    return null;
  }
  if (requestToken !== adminToken) {
    return "관리자 인증 실패";
  }
  return null;
};

app.get("/api/admin/orders", async (_req, res) => {
  const orders = await orderStore.listOrders();
  res.json({ orders });
});

app.patch("/api/admin/orders/:id", async (req, res) => {
  const authError = validateAdminWrite(req.header("x-admin-token"));
  if (authError) {
    res.status(401).json({ message: authError });
    return;
  }
  try {
    const status = req.body?.status as OrderStatus | undefined;
    if (!status || !["PENDING", "PAID"].includes(status)) {
      res.status(400).json({ message: "유효한 상태값이 아닙니다." });
      return;
    }
    const order = await orderStore.updateOrderStatus(req.params.id, status);
    res.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상태 변경 실패";
    res.status(400).json({ message });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(port, () => {
    console.log(`TIGRIS backend server running on http://localhost:${port}`);
  });
}

export default app;
