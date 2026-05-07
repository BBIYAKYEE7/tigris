import { promises as fs } from "node:fs";
import path from "node:path";

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

type OrderStore = {
  listOrders: () => Promise<Order[]>;
  createOrder: (customerName: string, quantities: Record<string, number>) => Promise<Order>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<Order>;
};

const createOrderPayload = (customerName: string, quantities: Record<string, number>) => {
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

class FileBackedOrderStore implements OrderStore {
  private orders: Order[] = [];
  private readonly filePath: string;
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureLoaded() {
    if (this.loaded) {
      return;
    }
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        this.orders = parsed as Order[];
      } else {
        this.orders = [];
      }
    } catch {
      this.orders = [];
    } finally {
      this.loaded = true;
    }
  }

  private async persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.orders), "utf8");
    });
    await this.writeQueue;
  }

  async listOrders() {
    await this.ensureLoaded();
    return this.orders;
  }

  async createOrder(customerName: string, quantities: Record<string, number>) {
    await this.ensureLoaded();
    const order = createOrderPayload(customerName, quantities);
    this.orders.unshift(order);
    await this.persist();
    return order;
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    await this.ensureLoaded();
    const target = this.orders.find((order) => order.id === id);
    if (!target) {
      throw new Error("주문을 찾을 수 없습니다.");
    }
    target.status = status;
    await this.persist();
    return target;
  }
}

class UpstashOrderStore implements OrderStore {
  private readonly url: string;
  private readonly token: string;
  private readonly key = "tigris_orders";

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit) {
    const response = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
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

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isVercelRuntime = process.env.VERCEL === "1";

function createOrderStore(): OrderStore {
  if (upstashUrl && upstashToken) {
    return new UpstashOrderStore(upstashUrl, upstashToken);
  }
  // Vercel Lambda는 /var/task 가 읽기 전용이라 .data 디렉터리 생성(ENOENT)이 납니다.
  if (isVercelRuntime) {
    console.warn(
      "[TIGRIS] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 미설정: 서버리스에서는 메모리 저장소만 사용합니다. 프로덕션에서는 반드시 Upstash를 설정하세요.",
    );
    return new InMemoryOrderStore();
  }
  return new FileBackedOrderStore(path.resolve(process.cwd(), ".data/orders.json"));
}

export const orderStore: OrderStore = createOrderStore();
