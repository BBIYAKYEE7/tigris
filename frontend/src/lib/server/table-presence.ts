/** 최근 ping 이후 이 시간이 지나면 관리자 화면에서 이용중 표시 해제 */
export const TABLE_PRESENCE_TTL_MS = 120_000;

type PresenceMap = Record<string, string>;

const REDIS_KEY = "tigris_table_presence";

function normalizeMap(raw: unknown): PresenceMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as PresenceMap;
}

class MemoryPresence {
  private map: PresenceMap = {};

  async read(): Promise<PresenceMap> {
    return { ...this.map };
  }

  async write(next: PresenceMap): Promise<void> {
    this.map = next;
  }
}

class UpstashPresence {
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

  async read(): Promise<PresenceMap> {
    const data = await this.request<{ result: PresenceMap | string | null }>(`/get/${this.encodedKey()}`);
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

  async write(next: PresenceMap): Promise<void> {
    await this.request<{ result: string }>(`/set/${this.encodedKey()}`, {
      method: "POST",
      body: JSON.stringify(next),
    });
  }
}

let memorySingleton: MemoryPresence | null = null;
function getBackend(): MemoryPresence | UpstashPresence {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new UpstashPresence(url, token);
  }
  if (!memorySingleton) {
    memorySingleton = new MemoryPresence();
  }
  return memorySingleton;
}

export async function pingTablePresence(tableNum: number): Promise<void> {
  const backend = getBackend();
  const map = await backend.read();
  map[String(tableNum)] = new Date().toISOString();
  await backend.write(map);
}

export async function clearTablePresence(tableNum: number): Promise<void> {
  const backend = getBackend();
  const map = await backend.read();
  delete map[String(tableNum)];
  await backend.write(map);
}

export type ActiveTablePing = { tableNum: number; lastPingAt: string };

export async function listActiveTablePresence(nowMs = Date.now()): Promise<ActiveTablePing[]> {
  const backend = getBackend();
  const map = await backend.read();
  const out: ActiveTablePing[] = [];
  for (const [key, iso] of Object.entries(map)) {
    const tableNum = parseInt(key, 10);
    if (Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      continue;
    }
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) {
      continue;
    }
    if (nowMs - t <= TABLE_PRESENCE_TTL_MS) {
      out.push({ tableNum, lastPingAt: iso });
    }
  }
  out.sort((a, b) => a.tableNum - b.tableNum);
  return out;
}
