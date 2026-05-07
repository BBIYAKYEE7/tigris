"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OrderItem = {
  menuId: string;
  name: string;
  quantity: number;
  lineTotal: number;
};

type Order = {
  id: string;
  customerName: string;
  totalAmount: number;
  status: "PENDING" | "PAID";
  createdAt: string;
  items: OrderItem[];
};

type TablePendingSummary = {
  tableNum: number;
  pendingOrders: Order[];
  totalAmount: number;
  latestCreatedAt: string;
  mergedItems: Array<{
    menuId: string;
    name: string;
    quantity: number;
    lineTotal: number;
  }>;
};

const formatKrw = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const POLL_MS = 4000;

export default function AdminPage() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "/-/backend");
  const [writeToken, setWriteToken] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const mounted = useRef(true);
  const previousOrdersRef = useRef<Order[]>([]);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const [alertOrder, setAlertOrder] = useState<Order | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const url = `${apiBaseUrl}/audio/alert.mp3`;
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = 0.9;
    alertAudioRef.current = audio;
    return () => {
      audio.pause();
      alertAudioRef.current = null;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const unlock = () => {
      const audio = alertAudioRef.current;
      if (!audio) {
        return;
      }
      const prevVolume = audio.volume;
      audio.volume = 0;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = prevVolume;
        })
        .catch(() => {
          audio.volume = prevVolume;
        });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const playAlertSound = useCallback(() => {
    const audio = alertAudioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, []);

  const fetchOrders = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!mounted.current) {
        return;
      }
      const silent = opts?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      setError("");
      try {
        const response = await fetch(`${apiBaseUrl}/api/admin/orders`);
        const data = (await response.json()) as { orders?: Order[]; message?: string };
        if (!response.ok || !data.orders) {
          throw new Error(data.message ?? "주문 조회에 실패했습니다.");
        }
        if (!mounted.current) {
          return;
        }
        const nextOrders = data.orders;
        const prevOrders = previousOrdersRef.current;
        setOrders(nextOrders);
        previousOrdersRef.current = nextOrders;
        const prevIds = new Set(prevOrders.map((o) => o.id));
        const newPending = nextOrders.find(
          (order) => order.status === "PENDING" && !prevIds.has(order.id),
        );
        if (newPending) {
          playAlertSound();
          setAlertOrder(newPending);
          setAlertOpen(true);
        }
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (!mounted.current) {
          return;
        }
        if (!silent) {
          setError(err instanceof Error ? err.message : "주문 조회에 실패했습니다.");
        }
      } finally {
        if (!mounted.current) {
          return;
        }
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [apiBaseUrl, playAlertSound],
  );

  useEffect(() => {
    void fetchOrders({ silent: false });

    const intervalId = window.setInterval(() => {
      void fetchOrders({ silent: true });
    }, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchOrders({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOrders]);

  const TABLE_COUNT = 27;

  const pendingSummaryByTable = (tableNum: number): TablePendingSummary | null => {
    const label = `${tableNum}번 테이블`;
    const pendingOrders = orders.filter(
      (order) => order.customerName === label && order.status === "PENDING",
    );
    if (pendingOrders.length === 0) {
      return null;
    }
    const sorted = pendingOrders
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const mergedItemMap = new Map<string, { menuId: string; name: string; quantity: number; lineTotal: number }>();
    for (const order of sorted) {
      for (const item of order.items) {
        const key = item.menuId;
        const prev = mergedItemMap.get(key);
        if (!prev) {
          mergedItemMap.set(key, { ...item });
          continue;
        }
        prev.quantity += item.quantity;
        prev.lineTotal += item.lineTotal;
      }
    }
    return {
      tableNum,
      pendingOrders: sorted,
      totalAmount: sorted.reduce((sum, order) => sum + order.totalAmount, 0),
      latestCreatedAt: sorted[0].createdAt,
      mergedItems: Array.from(mergedItemMap.values()),
    };
  };

  const markOrdersPaid = async (orderIds: string[]) => {
    if (orderIds.length === 0) {
      return;
    }
    setError("");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (writeToken) {
        headers["x-admin-token"] = writeToken;
      }

      for (const orderId of orderIds) {
        const response = await fetch(`${apiBaseUrl}/api/admin/orders/${orderId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "PAID" }),
        });
        const data = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(data.message ?? "결제 상태 변경 실패");
        }
      }
      await fetchOrders({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 상태 변경 실패");
    }
  };

  const markTablePaid = async (tableNum: number) => {
    const summary = pendingSummaryByTable(tableNum);
    if (!summary) {
      return;
    }
    await markOrdersPaid(summary.pendingOrders.map((order) => order.id));
  };

  return (
    <main className="min-h-screen bg-pink-50 px-4 py-8 text-zinc-800 sm:px-6">
      <section className="mx-auto max-w-5xl rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-2xl font-extrabold text-pink-600">TIGRIS 관리자 화면</h1>
        <p className="mt-2 text-sm text-zinc-600">주문 메뉴와 결제 금액을 확인하고 결제완료 처리하세요.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-xs text-zinc-500">
            {loading && orders.length === 0
              ? "목록 불러오는 중…"
              : `약 ${Math.round(POLL_MS / 1000)}초마다 자동 새로고침됩니다.`}
            {lastUpdatedAt ? (
              <span className="ml-2 text-zinc-400">
                (마지막 갱신: {lastUpdatedAt.toLocaleTimeString("ko-KR")})
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => void fetchOrders({ silent: orders.length > 0 })}
            disabled={loading && orders.length === 0}
            className="h-9 rounded-lg border border-pink-200 bg-white px-3 text-xs font-semibold text-pink-700 transition hover:bg-pink-50 disabled:opacity-50"
          >
            지금 동기화
          </button>
        </div>

        <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700">
          <summary className="cursor-pointer select-none font-medium text-zinc-800">
            결제완료 처리가 &quot;관리자 인증 실패&quot;로 막힐 때만
          </summary>
          <p className="mt-2 text-xs text-zinc-600">
            서버에 <span className="font-mono">ADMIN_TOKEN</span>이 설정된 경우에만, 아래에 같은 값을 넣은 뒤 결제완료 버튼을 누르세요.
          </p>
          <input
            type="password"
            value={writeToken}
            onChange={(event) => setWriteToken(event.target.value)}
            placeholder="ADMIN_TOKEN (결제완료용)"
            className="mt-2 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-pink-400 focus:outline-none"
            autoComplete="off"
          />
        </details>

        <p className="mt-3 text-xs text-zinc-500">
          목록이 비어 있거나 주문이 안 맞으면 백엔드에{" "}
          <span className="font-mono text-zinc-600">UPSTASH_REDIS_REST_URL</span>,{" "}
          <span className="font-mono text-zinc-600">UPSTASH_REDIS_REST_TOKEN</span> 설정을 확인하세요.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="mx-auto mt-4 max-w-5xl space-y-4">
        <div className="rounded-2xl border border-pink-100 bg-white p-4 text-sm text-zinc-700">
          <h2 className="text-base font-bold text-pink-700">테이블별 주문 현황</h2>
          <p className="mt-1 text-xs text-zinc-500">
            1~27번 테이블 기준으로, 각 테이블의 가장 최근{" "}
            <span className="font-semibold">결제대기 주문</span>을 보여줍니다.
          </p>
          {loading && orders.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">주문 목록을 불러오는 중입니다…</p>
          ) : null}
          {!loading && orders.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              아직 접수된 주문이 없습니다. (테이블 카드들은 미리 보이지만, 실제 주문이 들어오면 자동으로 채워집니다.)
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: TABLE_COUNT }, (_, index) => {
            const tableNum = index + 1;
            const summary = pendingSummaryByTable(tableNum);
            return (
              <article
                key={tableNum}
                className="flex flex-col rounded-2xl border border-pink-100 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-pink-700">
                    {tableNum}번 테이블
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      summary
                        ? "bg-amber-100 text-amber-800"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {summary ? `결제대기 ${summary.pendingOrders.length}건` : "주문 없음"}
                  </span>
                </div>
                {summary ? (
                  <>
                    <p className="mt-1 text-xs text-zinc-500">
                      최근 주문: {new Date(summary.latestCreatedAt).toLocaleTimeString("ko-KR")}
                    </p>
                    <ul className="mt-2 grow space-y-0.5 text-xs text-zinc-700">
                      {summary.mergedItems.map((item) => (
                        <li key={`${tableNum}-${item.menuId}`}>
                          {item.name} × {item.quantity} ={" "}
                          {formatKrw(item.lineTotal)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs font-bold text-zinc-800">
                      누적 결제 금액: {formatKrw(summary.totalAmount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void markTablePaid(tableNum)}
                      className="mt-2 h-8 rounded-lg bg-emerald-600 px-2 text-[11px] font-bold text-white transition hover:bg-emerald-500"
                    >
                      테이블 결제완료 처리
                    </button>
                  </>
                ) : (
                  <p className="mt-2 grow text-xs text-zinc-500">
                    결제 대기 중인 주문이 없습니다.
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <div className="rounded-2xl border border-pink-50 bg-white/70 p-4 text-xs text-zinc-600">
          <h3 className="text-sm font-bold text-pink-600">전체 주문 리스트</h3>
          {orders.length === 0 ? (
            <p className="mt-2">주문이 들어오면 여기에도 시간순으로 쌓입니다.</p>
          ) : (
            <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">
                    {new Date(order.createdAt).toLocaleTimeString("ko-KR")}
                  </span>
                  <span className="text-xs font-semibold text-zinc-700">
                    {order.customerName}
                  </span>
                  <span className="text-xs text-zinc-500">{order.id}</span>
                  <span className="text-xs font-bold text-pink-700">
                    {formatKrw(order.totalAmount)}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      order.status === "PAID"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {order.status === "PAID" ? "결제완료" : "결제대기"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {alertOpen && alertOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-order-alert-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAlertOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2
              id="admin-order-alert-title"
              className="text-lg font-bold text-pink-700"
            >
              새 주문이 들어왔어요
            </h2>
            <p className="mt-1 text-sm text-zinc-700">
              {alertOrder.customerName}에 새로운 결제 대기 주문이 있습니다.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {new Date(alertOrder.createdAt).toLocaleString("ko-KR")}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-zinc-700">
              {alertOrder.items.map((item) => (
                <li key={`${alertOrder.id}-${item.menuId}`}>
                  {item.name} × {item.quantity} = {formatKrw(item.lineTotal)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-bold text-zinc-800">
              총 결제 금액: {formatKrw(alertOrder.totalAmount)}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAlertOpen(false)}
                className="h-9 rounded-lg border border-zinc-200 px-4 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                닫기
              </button>
              {alertOrder.status === "PENDING" ? (
                <button
                  type="button"
                  onClick={() => {
                    const tableNum = Number.parseInt(alertOrder.customerName, 10);
                    if (!Number.isNaN(tableNum)) {
                      void markTablePaid(tableNum);
                    } else {
                      void markOrdersPaid([alertOrder.id]);
                    }
                    setAlertOpen(false);
                  }}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-500"
                >
                  테이블 전체 결제완료
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
