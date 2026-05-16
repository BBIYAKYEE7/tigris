"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MENU_ITEMS,
  TABLE_FEE_AMOUNT,
  TABLE_FEE_EXAMPLE,
  TABLE_FEE_NAME,
  isTableFeeMenuId,
  formatKrw,
} from "@/lib/menu";

const ACTIVE_TABLE_SESSION = "tigris:activeTableNum";
const TABLE_POLL_MS = 4000;

type OrderItemLine = {
  menuId: string;
  name: string;
  quantity: number;
  lineTotal: number;
};

type OrderSnapshot = {
  id: string;
  customerName: string;
  totalAmount: number;
  createdAt: string;
  status: "PENDING" | "PAID";
  items: OrderItemLine[];
};

const snowflakes = Array.from({ length: 36 }, (_, index) => {
  const left = 2 + ((index * 11) % 96);
  const size = 4 + (index % 5);
  const delay = `${-(index % 9) * 1.1}s`;
  const duration = `${7.8 + (index % 7) * 0.75}s`;
  const driftDirection = index % 2 === 0 ? 1 : -1;
  const drift = `${driftDirection * (8 + (index % 6) * 3)}px`;

  return {
    left: `${left}%`,
    size,
    delay,
    duration,
    drift,
  };
});

function readSessionTable(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(ACTIVE_TABLE_SESSION);
  if (!raw) {
    return null;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 999) {
    return null;
  }
  return n;
}

function writeSessionTable(n: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(ACTIVE_TABLE_SESSION, String(n));
}

function clearSessionTable() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(ACTIVE_TABLE_SESSION);
}

function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return "네트워크 오류가 발생했습니다.";
  }
  if (error.message === "Failed to fetch") {
    return "서버에 연결하지 못했습니다. Vercel 배포가 성공했는지 `/api/health`를 열어보고, 환경 변수 `NEXT_PUBLIC_API_BASE_URL`에 localhost 등 잘못된 값이 없는지 확인해 주세요. 주문 API는 같은 도메인의 `/api`입니다.";
  }
  return error.message;
}

export default function Home() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const mounted = useRef(true);

  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [activeTableNum, setActiveTableNum] = useState<number | null>(null);
  const [tableChangeAllowed, setTableChangeAllowed] = useState(false);
  const [setupTableDraft, setSetupTableDraft] = useState("");
  const [setupTableError, setSetupTableError] = useState("");

  const [tableOrders, setTableOrders] = useState<OrderSnapshot[]>([]);
  const [tableOrdersError, setTableOrdersError] = useState("");
  const [tableOrdersLoading, setTableOrdersLoading] = useState(false);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [toastOrder, setToastOrder] = useState<OrderSnapshot | null>(null);
  const [orderConfirmOpen, setOrderConfirmOpen] = useState(false);
  const [orderConfirmError, setOrderConfirmError] = useState("");

  const tableNumberLocked = activeTableNum !== null && !tableChangeAllowed;
  const showTableSetupModal = sessionHydrated && activeTableNum === null;
  const anyModalOpen = showTableSetupModal || orderConfirmOpen;

  /** 결제대기 주문을 한 번이라도 본 뒤 목록이 비면 '카운터 결제 완료'로 간주하고 이용중 ping 중단 */
  const hadPendingTableOrdersRef = useRef(false);
  const guestPaidIdleRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const saved = readSessionTable();
    if (saved !== null) {
      setActiveTableNum(saved);
    }
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!anyModalOpen) {
      return;
    }
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [anyModalOpen]);

  const pingTableGuestPresence = useCallback(
    async (tableNum: number) => {
      try {
        await fetch(`${apiBaseUrl}/api/tables/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableNum }),
        });
      } catch {
        /* 무시: 주문 목록은 그대로 표시 */
      }
    },
    [apiBaseUrl],
  );

  const clearTableGuestPresence = useCallback(
    async (tableNum: number) => {
      try {
        await fetch(`${apiBaseUrl}/api/tables/presence`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableNum }),
        });
      } catch {
        /* 무시 */
      }
    },
    [apiBaseUrl],
  );

  const fetchTableOrders = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (activeTableNum === null) {
        setTableOrders([]);
        return;
      }
      const silent = opts?.silent ?? false;
      const tableNumForPing = activeTableNum;
      if (!silent) {
        setTableOrdersLoading(true);
      }
      setTableOrdersError("");
      try {
        const response = await fetch(`${apiBaseUrl}/api/orders/by-table/${activeTableNum}`);
        const data = (await response.json()) as { orders?: OrderSnapshot[]; message?: string };
        if (!response.ok || !data.orders) {
          throw new Error(data.message ?? "테이블 주문을 불러오지 못했습니다.");
        }
        if (!mounted.current) {
          return;
        }
        setTableOrders(data.orders);

        if (data.orders.length > 0) {
          guestPaidIdleRef.current = false;
          hadPendingTableOrdersRef.current = true;
          void pingTableGuestPresence(tableNumForPing);
        } else if (hadPendingTableOrdersRef.current) {
          hadPendingTableOrdersRef.current = false;
          guestPaidIdleRef.current = true;
          setTableChangeAllowed(true);
          void clearTableGuestPresence(tableNumForPing);
        } else if (!guestPaidIdleRef.current) {
          void pingTableGuestPresence(tableNumForPing);
        }
      } catch (e) {
        if (!mounted.current) {
          return;
        }
        setTableOrdersError(describeFetchFailure(e));
      } finally {
        if (!mounted.current) {
          return;
        }
        if (!silent) {
          setTableOrdersLoading(false);
        }
      }
    },
    [apiBaseUrl, activeTableNum, pingTableGuestPresence, clearTableGuestPresence],
  );

  useEffect(() => {
    if (activeTableNum === null) {
      setTableOrders([]);
      hadPendingTableOrdersRef.current = false;
      guestPaidIdleRef.current = false;
      setTableChangeAllowed(false);
      return;
    }

    void fetchTableOrders({ silent: false });

    const id = window.setInterval(() => {
      void fetchTableOrders({ silent: true });
    }, TABLE_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchTableOrders({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeTableNum, fetchTableOrders]);

  const confirmTableSetup = () => {
    setSetupTableError("");
    const n = parseInt(setupTableDraft.trim(), 10);
    if (Number.isNaN(n) || n < 1 || n > 999) {
      setSetupTableError("1~999 사이 테이블 번호를 입력해 주세요.");
      return;
    }
    hadPendingTableOrdersRef.current = false;
    guestPaidIdleRef.current = false;
    setTableChangeAllowed(false);
    writeSessionTable(n);
    setActiveTableNum(n);
    setSetupTableDraft("");
    void pingTableGuestPresence(n);
  };

  const startTableChangeAfterPayment = () => {
    if (!tableChangeAllowed || tableOrders.length > 0) {
      return;
    }
    const prev = activeTableNum;
    if (prev !== null) {
      void clearTableGuestPresence(prev);
    }
    hadPendingTableOrdersRef.current = false;
    guestPaidIdleRef.current = false;
    clearSessionTable();
    setActiveTableNum(null);
    setTableOrders([]);
    setTableOrdersError("");
    setTableChangeAllowed(false);
  };

  const basicMenu = useMemo(() => MENU_ITEMS.filter((item) => item.category === "basic"), []);
  const specialMenu = useMemo(() => MENU_ITEMS.filter((item) => item.category === "set"), []);
  const drinksAndExtras = useMemo(() => MENU_ITEMS.filter((item) => item.category === "extra"), []);

  const menuSubtotal = useMemo(
    () =>
      MENU_ITEMS.reduce((sum, item) => {
        const quantity = quantities[item.id] ?? 0;
        return sum + item.price * quantity;
      }, 0),
    [quantities],
  );

  const tableFeeAlreadyOnBill = useMemo(
    () => tableOrders.some((order) => order.items.some((item) => isTableFeeMenuId(item.menuId))),
    [tableOrders],
  );

  const tableFeeDue = activeTableNum !== null && !tableFeeAlreadyOnBill ? TABLE_FEE_AMOUNT : 0;
  const checkoutTotal = menuSubtotal + tableFeeDue;

  const setQuantity = (menuId: string, nextValue: number) => {
    const sanitized = Number.isNaN(nextValue) ? 0 : Math.max(0, Math.min(99, nextValue));
    setQuantities((prev) => ({ ...prev, [menuId]: sanitized }));
  };

  const openOrderConfirm = () => {
    setSubmitError("");
    setToastOrder(null);
    setOrderConfirmError("");
    if (activeTableNum === null) {
      setSubmitError("테이블 번호를 먼저 입력해 주세요.");
      return;
    }
    if (menuSubtotal <= 0) {
      setSubmitError("먼저 메뉴 수량을 선택해 주세요.");
      return;
    }
    setOrderConfirmOpen(true);
  };

  const closeOrderConfirm = () => {
    setOrderConfirmOpen(false);
    setOrderConfirmError("");
  };

  const submitOrder = async () => {
    setOrderConfirmError("");
    if (activeTableNum === null) {
      setOrderConfirmError("테이블 번호가 설정되지 않았습니다.");
      return;
    }

    const customerName = `${activeTableNum}번 테이블`;

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          quantities,
        }),
      });

      const data = (await response.json()) as { order?: OrderSnapshot; message?: string };
      if (!response.ok || !data.order) {
        throw new Error(data.message ?? "주문 처리 중 오류가 발생했습니다.");
      }
      setToastOrder(data.order);
      setQuantities({});
      guestPaidIdleRef.current = false;
      setTableChangeAllowed(false);
      closeOrderConfirm();
      void fetchTableOrders({ silent: true });
    } catch (error) {
      setSubmitError(describeFetchFailure(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMenuCard = (menuId: string, name: string, price: number, description?: string) => (
    <li
      key={menuId}
      className="rounded-2xl bg-pink-50/60 p-3 ring-1 ring-pink-100"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{name}</span>
        <span className="shrink-0 text-sm font-bold text-pink-700">{formatKrw(price)}</span>
      </div>
      {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`qty-${menuId}`} className="text-sm text-zinc-600">
          수량
        </label>
        <div className="flex items-center rounded-lg border border-pink-200 bg-white">
          <button
            type="button"
            aria-label={`${name} 수량 감소`}
            onClick={() => setQuantity(menuId, (quantities[menuId] ?? 0) - 1)}
            className="h-8 w-8 rounded-l-lg text-base font-bold text-zinc-700 transition hover:bg-pink-50"
          >
            -
          </button>
          <input
            id={`qty-${menuId}`}
            type="text"
            inputMode="numeric"
            readOnly
            value={quantities[menuId] ?? 0}
            className="h-8 w-12 border-x border-pink-200 bg-white text-center text-sm font-semibold text-zinc-800 focus:outline-none"
          />
          <button
            type="button"
            aria-label={`${name} 수량 증가`}
            onClick={() => setQuantity(menuId, (quantities[menuId] ?? 0) + 1)}
            className="h-8 w-8 rounded-r-lg text-base font-bold text-zinc-700 transition hover:bg-pink-50"
          >
            +
          </button>
        </div>
      </div>
    </li>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#ffe5ef,_#ffd7e8_35%,_#fff4f9_70%,_#ffffff)] px-4 py-6 text-zinc-800 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        {snowflakes.map((flake, index) => (
          <span
            key={`${flake.left}-${index}`}
            className="snow-particle"
            style={
              {
                left: flake.left,
                top: "-8%",
                width: `${flake.size}px`,
                height: `${flake.size}px`,
                animationDelay: flake.delay,
                animationDuration: flake.duration,
                "--drift": flake.drift,
              } as CSSProperties & Record<"--drift", string>
            }
          />
        ))}
      </div>
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 sm:gap-8">
        <section className="overflow-hidden rounded-3xl border border-pink-100 bg-white/85 shadow-lg backdrop-blur-sm">
          <Image
            src="/tigris-concept.png"
            alt="사랑의 티그핑 컨셉 배너"
            width={17008}
            height={1984}
            sizes="100vw"
            unoptimized
            priority
            className="block h-auto w-full"
          />
          <div className="space-y-2 px-5 py-5 sm:px-8">
            <p className="inline-block rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold tracking-wide text-pink-700">
              2026 석탑대동제
            </p>
            <h1 className="text-2xl font-extrabold text-pink-600 sm:text-3xl">
              고려대학교 아마추어 아이스하키 동아리 TIGRIS 주점
            </h1>
            <p className="text-sm text-zinc-600 sm:text-base">
              사랑스럽고 시원한 핑크 무드의 TIGRIS 바에서 특별한 밤을 즐겨보세요.
            </p>
          </div>
        </section>

        <section className="overflow-hidden bg-gradient-to-r from-pink-500 to-pink-400 py-2 shadow-sm sm:py-3">
          <div className="marquee-scroll whitespace-nowrap py-1 text-sm font-semibold text-white sm:text-base">
            ✨ 합석을 원하는 경우 카운터에 요청해주세요. 합석이 이루어지면 각자 계산 후 한 테이블로 합쳐드립니다. ✨
          </div>
        </section>

        {activeTableNum !== null ? (
          <section className="rounded-3xl border border-pink-100 bg-white px-5 py-4 shadow-sm sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-pink-700">
                {activeTableNum}번 테이블
                {tableNumberLocked ? (
                  <span className="ml-2 font-normal text-zinc-600">· 결제 전까지 번호 변경 불가</span>
                ) : (
                  <span className="ml-2 font-normal text-emerald-700">· 결제 완료, 테이블 변경 가능</span>
                )}
              </p>
              {tableChangeAllowed && tableOrders.length === 0 ? (
                <button
                  type="button"
                  onClick={startTableChangeAfterPayment}
                  className="text-sm font-semibold text-pink-600 underline-offset-2 hover:underline"
                >
                  다른 테이블로 변경
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">🍽️ 기본 메뉴</h2>
            <ul className="mt-4 space-y-3">
              {basicMenu.map((item) => renderMenuCard(item.id, item.name, item.price))}
            </ul>
          </article>

          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">🎁 티그세트</h2>
            <ul className="mt-4 space-y-3">
              {specialMenu.map((item) =>
                renderMenuCard(item.id, item.name, item.price, item.description),
              )}
            </ul>
          </article>

          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">🥤 음료 & 기타</h2>
            <ul className="mt-4 space-y-3">
              {drinksAndExtras.map((item) => renderMenuCard(item.id, item.name, item.price))}
            </ul>
          </article>
        </section>

        <section className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-pink-600">주문하기</h2>
          {activeTableNum !== null ? (
            <p className="mt-2 text-sm text-zinc-600">
              <span className="font-semibold text-pink-700">{activeTableNum}번 테이블</span>로 주문이 접수됩니다.
              카운터에서 결제 완료 처리되면 테이블 번호를 변경할 수 있습니다.
            </p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-600">
            테이블비 <span className="font-semibold">{formatKrw(TABLE_FEE_EXAMPLE)}</span>
          </p>
          {activeTableNum !== null ? (
            <div className="mt-5 border-t border-pink-50 pt-5">
              <h3 className="text-base font-bold text-pink-600">결제 대기 주문</h3>
              <p className="mt-1 text-xs text-zinc-500">
                약 {Math.round(TABLE_POLL_MS / 1000)}초마다 자동 갱신 · 같은 번호를 입력한 손님과 목록을 공유합니다.
              </p>
              {tableOrdersLoading && tableOrders.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">불러오는 중…</p>
              ) : null}
              {tableOrdersError ? (
                <p className="mt-3 text-sm text-rose-600">{tableOrdersError}</p>
              ) : null}
              {!tableOrdersLoading && tableOrders.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">결제 대기 중인 주문이 없습니다.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {tableOrders.map((order) => (
                    <li
                      key={order.id}
                      className="rounded-2xl border border-pink-100 bg-pink-50/40 p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-pink-700">{order.id}</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          결제대기
                        </span>
                      </div>
                      <p className="mt-1 text-zinc-700">{formatKrw(order.totalAmount)}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(order.createdAt).toLocaleString("ko-KR")}
                      </p>
                      <ul className="mt-2 space-y-0.5 text-zinc-600">
                        {order.items.map((item) => (
                          <li key={`${order.id}-${item.menuId}`}>
                            {item.name} × {item.quantity} = {formatKrw(item.lineTotal)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={openOrderConfirm}
              disabled={isSubmitting || activeTableNum === null}
              className="h-11 rounded-xl bg-pink-600 px-6 text-sm font-bold text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              {isSubmitting ? "주문 처리 중..." : "주문하기"}
            </button>
          </div>
          <div className="mt-3 space-y-1 text-sm text-zinc-700">
            <p>
              메뉴 합계: <span className="font-semibold">{formatKrw(menuSubtotal)}</span>
            </p>
            {tableFeeDue > 0 ? (
              <p>
                {TABLE_FEE_NAME}: <span className="font-semibold">{formatKrw(tableFeeDue)}</span>
              </p>
            ) : tableFeeAlreadyOnBill ? (
              <p className="text-zinc-500">{TABLE_FEE_NAME}은 이미 결제 대기 목록에 포함되어 있습니다.</p>
            ) : null}
            <p className="font-bold text-pink-700">결제 예정 총액: {formatKrw(checkoutTotal)}</p>
          </div>
          {submitError ? <p className="mt-2 text-sm text-rose-600">{submitError}</p> : null}
          {toastOrder ? (
            <div className="mt-3 rounded-2xl bg-pink-50 p-4 ring-1 ring-pink-100">
              <p className="font-bold text-pink-700">주문 완료! 주문번호: {toastOrder.id}</p>
              <p className="mt-1 text-sm text-zinc-700">
                테이블: <span className="font-semibold">{toastOrder.customerName}</span> · 결제 예정 금액:{" "}
                <span className="font-bold">{formatKrw(toastOrder.totalAmount)}</span>
              </p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-pink-600">이벤트</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 sm:text-base">
              <li>
                주점에서 노는 사진을 핑크색 이모티콘이나 스티커로 꾸며서 @kutigris 태그하여 스토리를 올리시면 티그세트를 50% 할인해 드립니다!
              </li>
            </ul>
          </article>
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-pink-600">주점 안내</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 sm:text-base">
              <li>테이블비: {formatKrw(TABLE_FEE_EXAMPLE)}</li>
              <li>운영 시간: 18:00 ~ 24:00</li>
              <li>결제: 카드 / 계좌이체 / 현금 가능</li>
              <li>문의: @kutigris (Instagram)</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-pink-600">합석 안내</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 sm:text-base">
              <li>일반 합석·블라인드 합석 중 원하시는 방식으로 진행합니다.</li>
              <li>합석을 원하시는 분께서 요청해 주시면 자리를 맞춰 드립니다.</li>
              <li>원치 않으시면 합석 없이 이용하셔도 됩니다.</li>
              <li>현장 스태프에게 &quot;합석 도와주세요&quot;라고 말씀해 주세요.</li>
            </ul>
          </article>
        </section>
      </main>

      {showTableSetupModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-setup-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-6 shadow-xl">
            <h3 id="table-setup-title" className="text-lg font-bold text-pink-600">
              테이블 번호 입력
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              앉으신 테이블 번호를 입력해 주세요. 결제가 완료되기 전까지는 번호를 변경할 수 없습니다.
            </p>
            <label htmlFor="table-setup-number" className="mt-4 block text-sm font-medium text-zinc-700">
              테이블 번호
              <input
                id="table-setup-number"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={setupTableDraft}
                onChange={(e) => setSetupTableDraft(e.target.value)}
                placeholder="예: 5"
                className="mt-1 w-full rounded-xl border border-pink-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    confirmTableSetup();
                  }
                }}
              />
            </label>
            {setupTableError ? <p className="mt-2 text-sm text-rose-600">{setupTableError}</p> : null}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={confirmTableSetup}
                className="h-10 rounded-xl bg-pink-600 px-5 text-sm font-bold text-white transition hover:bg-pink-500"
              >
                시작하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-confirm-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeOrderConfirm();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="order-confirm-title" className="text-lg font-bold text-pink-600">
              주문 확인
            </h3>
            <p className="mt-2 text-sm text-zinc-600">{activeTableNum}번 테이블로 주문합니다.</p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-zinc-700">
              {MENU_ITEMS.filter((item) => (quantities[item.id] ?? 0) > 0).map((item) => (
                <li key={item.id}>
                  {item.name} × {quantities[item.id]} = {formatKrw(item.price * (quantities[item.id] ?? 0))}
                </li>
              ))}
              {tableFeeDue > 0 ? (
                <li>
                  {TABLE_FEE_NAME} × 1 = {formatKrw(tableFeeDue)}
                </li>
              ) : null}
            </ul>
            <p className="mt-3 text-sm font-bold text-pink-700">결제 예정 총액: {formatKrw(checkoutTotal)}</p>
            {orderConfirmError ? <p className="mt-2 text-sm text-rose-600">{orderConfirmError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeOrderConfirm}
                className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void submitOrder()}
                className="h-10 rounded-xl bg-pink-600 px-4 text-sm font-bold text-white transition hover:bg-pink-500 disabled:bg-pink-300"
              >
                {isSubmitting ? "처리 중…" : "주문하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
