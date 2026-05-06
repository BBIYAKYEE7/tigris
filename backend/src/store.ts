export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: "basic" | "set" | "extra";
  description?: string;
};

export type OrderStatus = "PENDING" | "PAID";

export type OrderItem = {
  menuId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  customerName: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
};

export const menuItems: MenuItem[] = [
  { id: "macaroni", name: "기본안주 마카로니", price: 3000, category: "basic" },
  { id: "ssy", name: "쏘야", price: 12000, category: "basic" },
  { id: "jeyuk", name: "제육볶음", price: 15000, category: "basic" },
  { id: "eomuk", name: "어묵탕", price: 14000, category: "basic" },
  { id: "hwangdo", name: "황도", price: 9000, category: "basic" },
  {
    id: "tigris-set",
    name: "티그리스 세트",
    price: 10000,
    category: "set",
    description: "초코파이 + 빼빼로 + 젤리 등",
  },
  { id: "soft-drink", name: "음료수", price: 2000, category: "extra" },
  { id: "hangover", name: "숙취해소제", price: 5000, category: "extra" },
  { id: "water", name: "생수", price: 1000, category: "extra" },
];

class InMemoryOrderStore {
  private orders: Order[] = [];

  listOrders() {
    return this.orders;
  }

  createOrder(customerName: string, quantities: Record<string, number>) {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([menuId, qty]) => {
        const menu = menuItems.find((item) => item.id === menuId);
        if (!menu) {
          throw new Error(`Unknown menu id: ${menuId}`);
        }
        return {
          menuId: menu.id,
          name: menu.name,
          unitPrice: menu.price,
          quantity: qty,
          lineTotal: menu.price * qty,
        };
      });

    if (items.length === 0) {
      throw new Error("최소 1개 이상 선택해주세요.");
    }

    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const order: Order = {
      id: `TGR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerName: customerName.trim() || "현장손님",
      items,
      totalAmount,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    this.orders.unshift(order);
    return order;
  }

  updateOrderStatus(id: string, status: OrderStatus) {
    const target = this.orders.find((order) => order.id === id);
    if (!target) {
      throw new Error("주문을 찾을 수 없습니다.");
    }
    target.status = status;
    return target;
  }
}

export const orderStore = new InMemoryOrderStore();
