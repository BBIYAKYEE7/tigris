"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { MENU_ITEMS, formatKrw } from "@/lib/menu";

type Order = {
  id: string;
  totalAmount: number;
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

export default function Home() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "");
  const [customerName, setCustomerName] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

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

  const submitOrder = async () => {
    setSubmitError("");
    setCreatedOrder(null);
    setIsSubmitting(true);

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

      const data = (await response.json()) as { order?: Order; message?: string };
      if (!response.ok || !data.order) {
        throw new Error(data.message ?? "주문 처리 중 오류가 발생했습니다.");
      }
      setCreatedOrder(data.order);
      setQuantities({});
      setCustomerName("");
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
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
              주문자 이름 (선택)
              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="예: 5번 테이블"
                className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={submitOrder}
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-pink-600 px-5 text-sm font-bold text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:bg-pink-300"
            >
              {isSubmitting ? "주문 처리 중..." : "주문하기"}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-pink-700">
            현재 선택 금액: {formatKrw(totalAmount)}
          </p>
          {submitError ? <p className="mt-2 text-sm text-rose-600">{submitError}</p> : null}
          {createdOrder ? (
            <div className="mt-3 rounded-2xl bg-pink-50 p-4 ring-1 ring-pink-100">
              <p className="font-bold text-pink-700">주문 완료! 주문번호: {createdOrder.id}</p>
              <p className="mt-1 text-sm text-zinc-700">
                결제 예정 금액: <span className="font-bold">{formatKrw(createdOrder.totalAmount)}</span>
              </p>
            </div>
          ) : null}
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
    </div>
  );
}
