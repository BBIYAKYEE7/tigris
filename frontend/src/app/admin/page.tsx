"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adjustedLineTotal, isTigrisSetMenuId } from "@/lib/billing";
import {
  computeSessionRevenue,
  formatBusinessSessionRange,
  getBusinessSessionBounds,
  getOrderPaidAt,
  isPaidOrderInBusinessSession,
} from "@/lib/business-session";

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
  paidAt?: string;
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
/** `frontend/public/audio/alert.mp3` → 브라우저에서는 `/audio/alert.mp3` */
const ALERT_SOUND_SRC = "/audio/alert.mp3";

export default function AdminPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [splitBrainWarning, setSplitBrainWarning] = useState(false);
  const mounted = useRef(true);
  const fetchSeqRef = useRef(0);
  const previousOrdersRef = useRef<Order[]>([]);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const [alertOrder, setAlertOrder] = useState<Order | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [guestActiveTables, setGuestActiveTables] = useState<Set<number>>(() => new Set());
  const [tableTigrisSetEvent, setTableTigrisSetEvent] = useState<Record<number, boolean>>({});
  const [eventToggleSaving, setEventToggleSaving] = useState<number | null>(null);
  const [sessionClock, setSessionClock] = useState(() => Date.now());
  const workerRef = useRef<Worker | null>(null);

  const sessionBounds = useMemo(
    () => getBusinessSessionBounds(new Date(sessionClock)),
    [sessionClock],
  );

  const sessionPaidOrders = useMemo(
    () =>
      orders
        .filter((order) => isPaidOrderInBusinessSession(order, sessionBounds))
        .sort(
          (a, b) =>
            (getOrderPaidAt(b)?.getTime() ?? 0) - (getOrderPaidAt(a)?.getTime() ?? 0),
        ),
    [orders, sessionBounds],
  );

  const sessionRevenue = useMemo(
    () => computeSessionRevenue(orders, sessionBounds),
    [orders, sessionBounds],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => setSessionClock(Date.now());
    const intervalId = window.setInterval(tick, 60_000);
    const { end } = getBusinessSessionBounds();
    const msUntilReset = end.getTime() + 1 - Date.now();
    const resetTimeoutId = window.setTimeout(
      () => {
        tick();
      },
      Math.max(msUntilReset, 1_000),
    );
    return () => {
      clearInterval(intervalId);
      clearTimeout(resetTimeoutId);
    };
  }, [sessionClock]);

  useEffect(() => {
    const audio = new Audio(ALERT_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = 0.9;
    alertAudioRef.current = audio;
    return () => {
      audio.pause();
      alertAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      const audio = alertAudioRef.current;
      if (!audio || audioUnlockedRef.current) {
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
          audioUnlockedRef.current = true;
        })
        .catch(() => {
          audio.volume = prevVolume;
        });
    };
    const opts: AddEventListenerOptions = { once: true, capture: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("click", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("click", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
      window.removeEventListener("touchstart", unlock, opts);
    };
  }, []);

  const playAlertSound = useCallback(() => {
    const src = ALERT_SOUND_SRC;
    const play = (el: HTMLAudioElement) => {
      el.currentTime = 0;
      return el.play();
    };
    const pooled = alertAudioRef.current;
    if (pooled) {
      void play(pooled).catch(() => {
        const oneShot = new Audio(src);
        oneShot.volume = 0.9;
        void oneShot.play().catch(() => {});
      });
      return;
    }
    const oneShot = new Audio(src);
    oneShot.volume = 0.9;
    void oneShot.play().catch(() => {});
  }, []);

  useEffect(() => {

    if (!alertOpen || !alertOrder) {
      return;
    }
    let cancelled = false;
    const run = () => {
      if (cancelled || !mounted.current) {
        return;
      }
      requestAnimationFrame(() => {
        if (cancelled || !mounted.current) {
          return;
        }
        playAlertSound();
      });
    };
    if (typeof queueMicrotask === "function") {
      queueMicrotask(run);
    } else {
      window.setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
    };
  }, [alertOpen, alertOrder?.id, playAlertSound]);

  const refreshTableTigrisSetEvents = useCallback(async () => {
    try {
      const r = await fetch(`${apiBaseUrl}/api/admin/table-events?_=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const j = (await r.json()) as { tableEvents?: Record<string, boolean> };
      if (!r.ok || !j.tableEvents || typeof j.tableEvents !== "object") {
        return;
      }
      if (!mounted.current) {
        return;
      }
      const next: Record<number, boolean> = {};
      for (const [key, value] of Object.entries(j.tableEvents)) {
        const tableNum = parseInt(key, 10);
        if (!Number.isNaN(tableNum) && value) {
          next[tableNum] = true;
        }
      }
      setTableTigrisSetEvent(next);
    } catch {
      /* ignore */
    }
  }, [apiBaseUrl]);

  const refreshTableGuestPresence = useCallback(async () => {
    try {
      const r = await fetch(`${apiBaseUrl}/api/admin/table-presence?_=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const j = (await r.json()) as { activeTables?: { tableNum: number }[] };
      if (!r.ok || !Array.isArray(j.activeTables)) {
        return;
      }
      if (!mounted.current) {
        return;
      }
      setGuestActiveTables(new Set(j.activeTables.map((x) => x.tableNum)));
    } catch {
      /* ignore */
    }
  }, [apiBaseUrl]);

  const fetchOrders = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!mounted.current) {
        return;
      }
      const silent = opts?.silent ?? false;
      const seq = ++fetchSeqRef.current;
      if (!silent) {
        setLoading(true);
      }
      setError("");
      try {
        const url = `${apiBaseUrl}/api/admin/orders?_=${Date.now()}`;
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        const data = (await response.json()) as { orders?: Order[]; message?: string };
        if (!response.ok || !Array.isArray(data.orders)) {
          throw new Error(data.message ?? "주문 조회에 실패했습니다.");
        }
        if (response.headers.get("X-Tigris-Orders-Split-Brain") === "1") {
          setSplitBrainWarning(true);
        } else {
          setSplitBrainWarning(false);
        }

        let nextOrders = data.orders;
        const prevOrders = previousOrdersRef.current;

        if (
          silent &&
          prevOrders.length > 0 &&
          nextOrders.length === 0 &&
          seq === fetchSeqRef.current
        ) {
          const retryUrl = `${apiBaseUrl}/api/admin/orders?_=${Date.now()}`;
          const retryRes = await fetch(retryUrl, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          });
          const retryData = (await retryRes.json()) as { orders?: Order[]; message?: string };
          if (
            retryRes.ok &&
            Array.isArray(retryData.orders) &&
            retryData.orders.length > 0 &&
            seq === fetchSeqRef.current
          ) {
            nextOrders = retryData.orders;
          }
        }

        if (!mounted.current || seq !== fetchSeqRef.current) {
          return;
        }

        setOrders(nextOrders);
        previousOrdersRef.current = nextOrders;
        const prevIds = new Set(prevOrders.map((o) => o.id));
        const newPending = nextOrders.find(
          (order) => order.status === "PENDING" && !prevIds.has(order.id),
        );
        if (newPending) {
          setAlertOrder(newPending);
          setAlertOpen(true);
          playAlertSound();
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
        void refreshTableGuestPresence();
        void refreshTableTigrisSetEvents();
      }
    },
    [apiBaseUrl, refreshTableGuestPresence, refreshTableTigrisSetEvents],
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

  // 백그라운드에서도 폴링하기 위해 Web Worker 시작
  useEffect(() => {
    if (typeof window === "undefined" || !("Worker" in window)) {
      return;
    }

    try {
      const worker = new Worker("/admin-worker.js");
      workerRef.current = worker;

      // 폴링 시작 신호
      worker.postMessage({ type: "START_POLLING" });

      // Worker로부터 새 주문 알림 받기
      worker.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "NEW_ORDERS_BACKGROUND" && mounted.current) {
          // 백그라운드에서 새 주문 감지됨 → 음성 알림 재생
          playAlertSound();
        }
      };

      return () => {
        if (workerRef.current) {
          workerRef.current.postMessage({ type: "STOP_POLLING" });
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };
    } catch {
      // Worker가 지원되지 않으면 무시
    }
  }, []);

  const TABLE_COUNT = 27;

  const tableHasTigrisSetPending = (summary: TablePendingSummary) =>
    summary.mergedItems.some((item) => isTigrisSetMenuId(item.menuId));

  const computeAdjustedTableTotal = (summary: TablePendingSummary, eventApplied: boolean) =>
    summary.pendingOrders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (lineSum, item) => lineSum + adjustedLineTotal(item, eventApplied),
          0,
        ),
      0,
    );

  const setTigrisSetEventForTable = async (tableNum: number, participating: boolean) => {
    setEventToggleSaving(tableNum);
    setError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/admin/tables/${tableNum}/tigris-set-event`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tigrisSetEventParticipating: participating }),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "이벤트 상태 저장 실패");
      }
      setTableTigrisSetEvent((prev) => {
        const next = { ...prev };
        if (participating) {
          next[tableNum] = true;
        } else {
          delete next[tableNum];
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "이벤트 상태 저장 실패");
    } finally {
      setEventToggleSaving(null);
    }
  };

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
      for (const orderId of orderIds) {
        const response = await fetch(`${apiBaseUrl}/api/admin/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
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
        {splitBrainWarning ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            서버가 공유 저장소 없이 동작 중입니다. 요청마다 다른 컴퓨터가 응답하면 주문 목록이 비었다가
            다시 보입니다. 같은 프로젝트에 아래 Upstash 환경 변수를 넣어 주세요.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="mx-auto mt-4 max-w-5xl space-y-4">
        <div className="rounded-2xl border border-pink-100 bg-white p-4 text-sm text-zinc-700">
          <h2 className="text-base font-bold text-pink-700">테이블별 주문 현황</h2>
          <p className="mt-1 text-xs text-zinc-500">
            손님이 메뉴판에서 테이블 번호를 적용하면{" "}
            <span className="font-semibold text-sky-800">손님 이용중</span>으로 표시됩니다. 결제대기 주문이 있으면
            함께 표시됩니다.
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
            const guestHere = guestActiveTables.has(tableNum);
            const tigrisSetEventApplied = tableTigrisSetEvent[tableNum] === true;
            const hasTigrisSet = summary ? tableHasTigrisSetPending(summary) : false;
            const adjustedTotal =
              summary != null ? computeAdjustedTableTotal(summary, tigrisSetEventApplied) : 0;
            const eventDiscount =
              summary != null && tigrisSetEventApplied
                ? summary.totalAmount - adjustedTotal
                : 0;
            return (
              <article
                key={tableNum}
                className="flex flex-col rounded-2xl border border-pink-100 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-pink-700">
                    {tableNum}번 테이블
                  </h3>
                  <div className="flex max-w-[min(100%,11rem)] flex-wrap justify-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        summary
                          ? "bg-amber-100 text-amber-800"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {summary ? `결제대기 ${summary.pendingOrders.length}건` : "주문 없음"}
                    </span>
                    {guestHere ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                        손님 이용중
                      </span>
                    ) : null}
                  </div>
                </div>
                {summary ? (
                  <>
                    <p className="mt-1 text-xs text-zinc-500">
                      최근 주문: {new Date(summary.latestCreatedAt).toLocaleTimeString("ko-KR")}
                    </p>
                    <ul className="mt-2 grow space-y-0.5 text-xs text-zinc-700">
                      {summary.mergedItems.map((item) => {
                        const displayTotal = adjustedLineTotal(item, tigrisSetEventApplied);
                        const discounted =
                          tigrisSetEventApplied && isTigrisSetMenuId(item.menuId);
                        return (
                          <li key={`${tableNum}-${item.menuId}`}>
                            {item.name} × {item.quantity} ={" "}
                            {discounted ? (
                              <>
                                <span className="text-zinc-400 line-through">
                                  {formatKrw(item.lineTotal)}
                                </span>{" "}
                                <span className="font-semibold text-pink-700">
                                  {formatKrw(displayTotal)}
                                </span>
                              </>
                            ) : (
                              formatKrw(displayTotal)
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {hasTigrisSet ? (
                      <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-pink-100 bg-pink-50/50 p-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-pink-300 text-pink-600 focus:ring-pink-400"
                          checked={tigrisSetEventApplied}
                          disabled={eventToggleSaving === tableNum}
                          onChange={(e) =>
                            void setTigrisSetEventForTable(tableNum, e.target.checked)
                          }
                        />
                        <span className="text-zinc-700">
                          <span className="font-semibold text-pink-700">스토리 이벤트 참여</span>
                          <span className="mt-0.5 block text-[11px] text-zinc-500">
                            @kutigris 태그 스토리 확인 시 티그세트 50% 할인
                          </span>
                        </span>
                      </label>
                    ) : null}
                    <p className="mt-2 text-xs font-bold text-zinc-800">
                      누적 결제 금액:{" "}
                      {tigrisSetEventApplied && eventDiscount > 0 ? (
                        <>
                          <span className="text-zinc-400 line-through">
                            {formatKrw(summary.totalAmount)}
                          </span>{" "}
                          {formatKrw(adjustedTotal)}
                          <span className="ml-1 font-medium text-pink-700">
                            (−{formatKrw(eventDiscount)})
                          </span>
                        </>
                      ) : (
                        formatKrw(summary.totalAmount)
                      )}
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
                    {guestHere
                      ? "결제 대기 주문은 없습니다. 손님이 메뉴판에서 이 테이블을 연 상태입니다."
                      : "결제 대기 중인 주문이 없습니다."}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <div className="rounded-2xl border border-pink-50 bg-white/70 p-4 text-xs text-zinc-600">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-bold text-pink-600">전체 주문 리스트</h3>
            <p className="text-[11px] text-zinc-500">
              영업일 {formatBusinessSessionRange(sessionBounds)} · 매일 03:00 초기화
            </p>
          </div>
          <p className="mt-3 rounded-xl bg-pink-50 px-3 py-2 text-sm font-bold text-pink-800">
            총 매출: {formatKrw(sessionRevenue)}
            <span className="ml-2 text-xs font-medium text-pink-600/80">
              (결제완료 {sessionPaidOrders.length}건)
            </span>
          </p>
          {sessionPaidOrders.length === 0 ? (
            <p className="mt-2">이번 영업일에 결제완료된 주문이 없습니다.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {sessionPaidOrders.map((order) => {
                const paidAt = getOrderPaidAt(order);
                return (
                  <li key={order.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-500">
                      {(paidAt ?? new Date(order.createdAt)).toLocaleTimeString("ko-KR")}
                    </span>
                    <span className="text-xs font-semibold text-zinc-700">
                      {order.customerName}
                    </span>
                    <span className="text-xs text-zinc-500">{order.id}</span>
                    <span className="text-xs font-bold text-pink-700">
                      {formatKrw(order.totalAmount)}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      결제완료
                    </span>
                  </li>
                );
              })}
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
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertOpen(false)}
                className="h-9 rounded-lg bg-pink-600 px-4 text-xs font-bold text-white transition hover:bg-pink-500"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
