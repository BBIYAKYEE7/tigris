export type MergeRequest = {
  tableNum: number;
  requestedAt: string;
};

type MergeRequestStore = {
  listMergeRequests: () => Promise<MergeRequest[]>;
  addMergeRequest: (tableNum: number) => Promise<MergeRequest>;
  removeMergeRequest: (tableNum: number) => Promise<void>;
};

function createInMemoryMergeRequestStore(): MergeRequestStore {
  const requests = new Map<number, MergeRequest>();

  return {
    async listMergeRequests() {
      return Array.from(requests.values());
    },

    async addMergeRequest(tableNum: number) {
      const request: MergeRequest = {
        tableNum,
        requestedAt: new Date().toISOString(),
      };
      requests.set(tableNum, request);
      return request;
    },

    async removeMergeRequest(tableNum: number) {
      requests.delete(tableNum);
    },
  };
}

function createRedisMergeRequestStore(): MergeRequestStore {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.warn("Redis not configured, falling back to in-memory store");
    return createInMemoryMergeRequestStore();
  }

  return {
    async listMergeRequests() {
      try {
        const response = await fetch(`${redisUrl}/hgetall/merge-requests`, {
          headers: { Authorization: `Bearer ${redisToken}` },
        });
        const data = (await response.json()) as { result?: Record<string, string> };
        if (!data.result) {
          return [];
        }
        return Object.entries(data.result).map(([tableNumStr, requestedAt]) => ({
          tableNum: parseInt(tableNumStr, 10),
          requestedAt,
        }));
      } catch (error) {
        console.error("Failed to list merge requests from Redis:", error);
        return [];
      }
    },

    async addMergeRequest(tableNum: number) {
      try {
        const requestedAt = new Date().toISOString();
        await fetch(`${redisUrl}/hset/merge-requests`, {
          method: "POST",
          headers: { Authorization: `Bearer ${redisToken}` },
          body: JSON.stringify({
            fields: [{ name: String(tableNum), value: requestedAt }],
          }),
        });
        return { tableNum, requestedAt };
      } catch (error) {
        console.error("Failed to add merge request to Redis:", error);
        throw new Error("합석요청 저장 실패");
      }
    },

    async removeMergeRequest(tableNum: number) {
      try {
        await fetch(`${redisUrl}/hdel/merge-requests`, {
          method: "POST",
          headers: { Authorization: `Bearer ${redisToken}` },
          body: JSON.stringify({ fields: [String(tableNum)] }),
        });
      } catch (error) {
        console.error("Failed to remove merge request from Redis:", error);
        throw new Error("합석요청 제거 실패");
      }
    },
  };
}

let mergeRequestStore: MergeRequestStore | null = null;

export function getMergeRequestStore(): MergeRequestStore {
  if (!mergeRequestStore) {
    mergeRequestStore = createRedisMergeRequestStore();
  }
  return mergeRequestStore;
}
