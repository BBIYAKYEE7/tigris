import Image from "next/image";
import type { CSSProperties } from "react";

const basicMenu = [
  { name: "기본안주 마카로니", price: "현장 문의" },
  { name: "쏘야", price: "현장 문의" },
  { name: "제육볶음", price: "현장 문의" },
  { name: "어묵탕", price: "현장 문의" },
  { name: "황도", price: "현장 문의" },
];

const specialMenu = [
  {
    name: "티그리스 세트",
    description: "초코파이 + 빼빼로 + 젤리 등",
    price: "현장 문의",
  },
];

const drinksAndExtras = [
  { name: "음료수", price: "현장 문의" },
  { name: "숙취해소제", price: "현장 문의" },
  { name: "생수", price: "현장 문의" },
];

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
              {basicMenu.map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between rounded-2xl bg-pink-50/60 p-3 ring-1 ring-pink-100"
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="shrink-0 text-sm font-bold text-pink-700">{item.price}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">티그리스 세트</h2>
            <ul className="mt-4 space-y-3">
              {specialMenu.map((item) => (
                <li
                  key={item.name}
                  className="rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 p-4 ring-1 ring-pink-100"
                >
                  <p className="text-lg font-bold">{item.name}</p>
                  <p className="mt-1 text-sm text-zinc-600">{item.description}</p>
                  <p className="mt-3 text-right text-sm font-extrabold text-pink-700">
                    {item.price}
                  </p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-pink-600">음료 & 기타</h2>
            <ul className="mt-4 space-y-3">
              {drinksAndExtras.map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between rounded-2xl bg-pink-50/60 p-3 ring-1 ring-pink-100"
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-sm font-bold text-pink-700">{item.price}</span>
                </li>
              ))}
            </ul>
          </article>
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
