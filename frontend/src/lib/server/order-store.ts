import { MENU_ITEMS } from "@/lib/menu";

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

type OrderStore = {
  listOrders: () => Promise<Order[]>;
  createOrder: (customerName: string, quantities: Record<string, number>) => Promise<Order>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<Order>;
};

const createOrderPayload = (customerName: string, quantities: Record<string, number>) => {
  const items = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([menuId, qty]) => {
      const menu = MENU_ITEMS.find((item) => item.id === menuId);
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

  return order;
};

class InMemoryOrderStore implements OrderStore {
  private orders: Order[] = [];

  async listOrders() {
    return this.orders;
  }

  async createOrder(customerName: string, quantities: Record<string, number>) {
    const order = createOrderPayload(customerName, quantities);
    this.orders.unshift(order);
    return order;
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    const target = this.orders.find((order) => order.id === id);
    if (!target) {
      throw new Error("주문을 찾을 수 없습니다.");
    }
    target.status = status;
    return target;
  }
}

class UpstashOrderStore implements OrderStore {
  private readonly key = "tigris_orders";

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/$/, "");
    this.token = token;
  }

  private readonly baseUrl: string;
  private readonly token: string;

  private async request<T>(path: string, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Upstash 요청 실패: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private encodedKey() {
    return encodeURIComponent(this.key);
  }

  private async readOrders() {
    const data = await this.request<{ result: Order[] | string | null }>(`/get/${this.encodedKey()}`);
    if (!data.result) {
      return [];
    }
    if (typeof data.result === "string") {
      try {
        return JSON.parse(data.result) as Order[];
      } catch {
        return [];
      }
    }
    return data.result;
  }

  private async writeOrders(orders: Order[]) {
    await this.request<{ result: string }>(`/set/${this.encodedKey()}`, {
      method: "POST",
      body: JSON.stringify(orders),
    });
  }

  async listOrders() {
    return this.readOrders();
  }

  async createOrder(customerName: string, quantities: Record<string, number>) {
    const order = createOrderPayload(customerName, quantities);
    const current = await this.readOrders();
    current.unshift(order);
    await this.writeOrders(current);
    return order;
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    const current = await this.readOrders();
    const target = current.find((order) => order.id === id);
    if (!target) {
      throw new Error("주문을 찾을 수 없습니다.");
    }
    target.status = status;
    await this.writeOrders(current);
    return target;
  }
}

function createOrderStore(): OrderStore {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    return new UpstashOrderStore(upstashUrl, upstashToken);
  }
  if (process.env.VERCEL === "1") {
    console.warn(
      "[TIGRIS] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 미설정 — 메모리 저장소만 사용합니다.",
    );
  }
  return new InMemoryOrderStore();
}

let store: OrderStore | null = null;

export function getOrderStore(): OrderStore {
  if (!store) {
    store = createOrderStore();
  }
  return store;
}

export function ordersPersistenceSplitBrain(): boolean {
  return (
    process.env.VERCEL === "1" &&
    !(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}
