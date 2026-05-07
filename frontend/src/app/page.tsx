"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { MENU_ITEMS, formatKrw } from "@/lib/menu";

const ORDER_HISTORY_KEY = "tigris:customerOrders:v1";

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

function readHistoryFromStorage(): OrderSnapshot[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(ORDER_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as OrderSnapshot[];
  } catch {
    return [];
  }
}

function writeHistoryToStorage(orders: OrderSnapshot[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(orders));
  } catch {
    /* storage full 또는 비공개 모드 */
  }
}

export default function Home() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "/-/backend");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [toastOrder, setToastOrder] = useState<OrderSnapshot | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderSnapshot[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tableInput, setTableInput] = useState("");
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    setOrderHistory(readHistoryFromStorage());
  }, []);

  const basicMenu = useMemo(() => MENU_ITEMS.filter((item) => item.category === "basic"), []);
  const specialMenu = useMemo(() => MENU_ITEMS.filter((item) => item.category === "set"), []);
  const drinksAndExtras = useMemo(() => MENU_ITEMS.filter((item) => item.category === "extra"), []);

  const totalAmount = useMemo(
    () =>
      MENU_ITEMS.reduce((sum, item) => {
        const quantity = quantities[item.id] ?? 0;
        return sum + item.price * quantity;
      }, 0),
    [quantities],
  );

  const setQuantity = (menuId: string, nextValue: number) => {
    const sanitized = Number.isNaN(nextValue) ? 0 : Math.max(0, Math.min(99, nextValue));
    setQuantities((prev) => ({ ...prev, [menuId]: sanitized }));
  };

  const openOrderModal = () => {
    setSubmitError("");
    setToastOrder(null);
    setModalError("");
    if (totalAmount <= 0) {
      setSubmitError("먼저 메뉴 수량을 선택해 주세요.");
      return;
    }
    setTableInput("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalError("");
    setTableInput("");
  };

  const appendHistory = (order: OrderSnapshot) => {
    setOrderHistory((prev) => {
      const withoutDup = prev.filter((o) => o.id !== order.id);
      const next = [order, ...withoutDup].slice(0, 80);
      writeHistoryToStorage(next);
      return next;
    });
  };

  const submitOrderFromModal = async () => {
    setModalError("");
    const trimmed = tableInput.trim();
    const tableNum = parseInt(trimmed, 10);
    if (!trimmed || Number.isNaN(tableNum) || tableNum < 1 || tableNum > 999) {
      setModalError("1~999 사이의 테이블 번호를 입력해 주세요.");
      return;
    }
    const customerName = `${tableNum}번 테이블`;

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
      appendHistory(data.order);
      setToastOrder(data.order);
      setQuantities({});
      closeModal();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "주문 처리 중 오류가 발생했습니다.");
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
        <input
          id={`qty-${menuId}`}
          type="number"
          min={0}
          max={99}
          value={quantities[menuId] ?? 0}
          onChange={(event) => setQuantity(menuId, Number(event.target.value))}
          className="w-20 rounded-lg border border-pink-200 bg-white px-2 py-1 text-right text-sm font-semibold focus:border-pink-400 focus:outline-none"
        />
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

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">기본 메뉴</h2>
            <ul className="mt-4 space-y-3">
              {basicMenu.map((item) => renderMenuCard(item.id, item.name, item.price))}
            </ul>
          </article>

          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">티그리스 세트</h2>
            <ul className="mt-4 space-y-3">
              {specialMenu.map((item) =>
                renderMenuCard(item.id, item.name, item.price, item.description),
              )}
            </ul>
          </article>

          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">음료 & 기타</h2>
            <ul className="mt-4 space-y-3">
              {drinksAndExtras.map((item) => renderMenuCard(item.id, item.name, item.price))}
            </ul>
          </article>
        </section>

        <section className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-pink-600">주문하기</h2>
          <p className="mt-2 text-sm text-zinc-600">
            메뉴를 고른 뒤 <span className="font-semibold text-pink-700">주문하기</span>를 누르면 테이블 번호를 입력하는 창이 열립니다.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={openOrderModal}
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-pink-600 px-6 text-sm font-bold text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              {isSubmitting ? "주문 처리 중..." : "주문하기"}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-pink-700">
            현재 선택 금액: {formatKrw(totalAmount)}
          </p>
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

        <section className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-pink-600">내 주문 내역</h2>
          <p className="mt-1 text-xs text-zinc-500">
            이 기기 브라우저에 저장됩니다. 새로고침해도 유지됩니다. (다른 폰이나 시크릿 창에서는 보이지 않습니다.) 카운터에서 결제가 끝나도 여기 표시된 &quot;결제대기&quot;는 자동으로 바뀌지 않을 수 있습니다.
          </p>
          {orderHistory.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">아직 저장된 주문이 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orderHistory.map((order) => (
                <li
                  key={order.id}
                  className="rounded-2xl border border-pink-100 bg-pink-50/40 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-pink-700">{order.id}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        order.status === "PAID"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {order.status === "PAID" ? "결제완료" : "결제대기"}
                    </span>
                  </div>
                  <p className="mt-1 text-zinc-700">
                    {order.customerName} · {formatKrw(order.totalAmount)}
                  </p>
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
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-pink-600">이벤트</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 sm:text-base">
              <li>인스타그램 스토리 태그 시 음료 500원 할인</li>
              <li>TIGRIS 관련 퀴즈 정답 시 랜덤 굿즈 증정</li>
              <li>20시 이후 3인 이상 방문 시 감자튀김 업그레이드</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-pink-600">주점 안내</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 sm:text-base">
              <li>운영 시간: 18:00 ~ 24:00</li>
              <li>결제: 카드 / 계좌이체 / 현금 가능</li>
              <li>문의: @kutigris (Instagram)</li>
              <li>관리자 페이지: /admin</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-pink-600">합석 안내</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 sm:text-base">
              <li>원하시는 분들끼리만 매칭 도와드립니다.</li>
              <li>원치 않으시면 합석 없이 이용하셔도 됩니다.</li>
              <li>합석 성사 시 안주 서비스가 제공될 수 있습니다.</li>
              <li>현장 스태프에게 &quot;합석 도와주세요&quot;라고 말씀해주세요.</li>
            </ul>
          </article>
        </section>
      </main>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="table-modal-title" className="text-lg font-bold text-pink-600">
              테이블 번호 입력
            </h3>
            <p className="mt-1 text-sm text-zinc-600">주문이 전달될 테이블 번호를 적어 주세요.</p>
            <label htmlFor="table-number" className="mt-4 block text-sm font-medium text-zinc-700">
              테이블 번호
              <input
                id="table-number"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={tableInput}
                onChange={(e) => setTableInput(e.target.value)}
                placeholder="예: 5"
                className="mt-1 w-full rounded-xl border border-pink-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    closeModal();
                  }
                  if (e.key === "Enter") {
                    void submitOrderFromModal();
                  }
                }}
              />
            </label>
            {modalError ? <p className="mt-2 text-sm text-rose-600">{modalError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void submitOrderFromModal()}
                className="h-10 rounded-xl bg-pink-600 px-4 text-sm font-bold text-white transition hover:bg-pink-500 disabled:bg-pink-300"
              >
                {isSubmitting ? "처리 중…" : "주문 확인"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
