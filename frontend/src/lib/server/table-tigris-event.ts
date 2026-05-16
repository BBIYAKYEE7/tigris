type EventMap = Record<string, boolean>;

const REDIS_KEY = "tigris_table_tigris_set_event";

function normalizeMap(raw: unknown): EventMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as EventMap;
}

class MemoryStore {
  private map: EventMap = {};

  async read(): Promise<EventMap> {
    return { ...this.map };
  }

  async write(next: EventMap): Promise<void> {
    this.map = next;
  }
}

class UpstashStore {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

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
    return encodeURIComponent(REDIS_KEY);
  }

  async read(): Promise<EventMap> {
    const data = await this.request<{ result: EventMap | string | null }>(`/get/${this.encodedKey()}`);
    if (!data.result) {
      return {};
    }
    if (typeof data.result === "string") {
      try {
        return normalizeMap(JSON.parse(data.result));
      } catch {
        return {};
      }
    }
    return normalizeMap(data.result);
  }

  async write(next: EventMap): Promise<void> {
    await this.request<{ result: string }>(`/set/${this.encodedKey()}`, {
      method: "POST",
      body: JSON.stringify(next),
    });
  }
}

let memorySingleton: MemoryStore | null = null;

function getBackend(): MemoryStore | UpstashStore {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new UpstashStore(url, token);
  }
  if (!memorySingleton) {
    memorySingleton = new MemoryStore();
  }
  return memorySingleton;
}

function assertTableNum(tableNum: number) {
  if (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > 999) {
    throw new Error("유효한 테이블 번호가 아닙니다.");
  }
}

export async function listTableTigrisSetEvents(): Promise<Record<number, boolean>> {
  const map = await getBackend().read();
  const out: Record<number, boolean> = {};
  for (const [key, value] of Object.entries(map)) {
    const tableNum = parseInt(key, 10);
    if (Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      continue;
    }
    if (value) {
      out[tableNum] = true;
    }
  }
  return out;
}

export async function getTableTigrisSetEvent(tableNum: number): Promise<boolean> {
  assertTableNum(tableNum);
  const map = await getBackend().read();
  return map[String(tableNum)] === true;
}

export async function setTableTigrisSetEvent(tableNum: number, participating: boolean): Promise<void> {
  assertTableNum(tableNum);
  const backend = getBackend();
  const map = await backend.read();
  if (participating) {
    map[String(tableNum)] = true;
  } else {
    delete map[String(tableNum)];
  }
  await backend.write(map);
}

export async function clearTableTigrisSetEvent(tableNum: number): Promise<void> {
  assertTableNum(tableNum);
  const backend = getBackend();
  const map = await backend.read();
  delete map[String(tableNum)];
  await backend.write(map);
}
