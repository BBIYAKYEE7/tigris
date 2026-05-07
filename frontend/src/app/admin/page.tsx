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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
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
        setOrders(data.orders);
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
    [apiBaseUrl],
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

  const markPaid = async (orderId: string) => {
    setError("");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (writeToken) {
        headers["x-admin-token"] = writeToken;
      }

      const response = await fetch(`${apiBaseUrl}/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "PAID" }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "결제 상태 변경 실패");
      }
      await fetchOrders({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 상태 변경 실패");
    }
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

      <section className="mx-auto mt-4 max-w-5xl space-y-3">
        {loading && orders.length === 0 ? (
          <div className="rounded-2xl border border-pink-100 bg-white p-4 text-sm text-zinc-600">
            주문 목록을 불러오는 중입니다…
          </div>
        ) : null}
        {!loading && orders.length === 0 ? (
          <div className="rounded-2xl border border-pink-100 bg-white p-4 text-sm text-zinc-600">
            접수된 주문이 없습니다.
          </div>
        ) : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-pink-700">{order.id}</h2>
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${
                  order.status === "PAID"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {order.status === "PAID" ? "결제완료" : "결제대기"}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-700">주문자: {order.customerName}</p>
            <p className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleString("ko-KR")}</p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {order.items.map((item) => (
                <li key={`${order.id}-${item.menuId}`}>
                  {item.name} x {item.quantity} = {formatKrw(item.lineTotal)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-bold">총 결제 금액: {formatKrw(order.totalAmount)}</p>
            {order.status === "PENDING" ? (
              <button
                type="button"
                onClick={() => markPaid(order.id)}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                결제완료 처리
              </button>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
