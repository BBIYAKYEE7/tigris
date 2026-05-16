/** 주점 영업일: 매일 03:00 ~ 익일 02:59:59 (한국 시간) */
export const BUSINESS_SESSION_RESET_HOUR_KST = 3;
export const BUSINESS_TIMEZONE = "Asia/Seoul";

export type BusinessSessionBounds = {
  start: Date;
  end: Date;
};

type OrderForSession = {
  status: "PENDING" | "PAID";
  createdAt: string;
  paidAt?: string;
  totalAmount: number;
};

function getKstHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
}

function getKstYmd(now: Date): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return { year, month, day };
}

function kstWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+09:00`,
  );
}

/** 현재 시각이 속한 영업일 구간 (03:00 ~ 익일 02:59:59.999) */
export function getBusinessSessionBounds(now = new Date()): BusinessSessionBounds {
  const { year, month, day } = getKstYmd(now);
  const hour = getKstHour(now);

  let startYear = year;
  let startMonth = month;
  let startDay = day;

  if (hour < BUSINESS_SESSION_RESET_HOUR_KST) {
    const noon = kstWallTimeToUtc(year, month, day, 12, 0, 0);
    const prev = getKstYmd(new Date(noon.getTime() - 24 * 60 * 60 * 1000));
    startYear = prev.year;
    startMonth = prev.month;
    startDay = prev.day;
  }

  const start = kstWallTimeToUtc(startYear, startMonth, startDay, BUSINESS_SESSION_RESET_HOUR_KST, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export function formatBusinessSessionRange(bounds: BusinessSessionBounds): string {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: BUSINESS_TIMEZONE,
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  return `${fmt.format(bounds.start)} ~ ${fmt.format(bounds.end)}`;
}

export function getOrderPaidAt(order: OrderForSession): Date | null {
  if (order.status !== "PAID") {
    return null;
  }
  const raw = order.paidAt ?? order.createdAt;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : new Date(t);
}

function isWithinBounds(at: Date, bounds: BusinessSessionBounds) {
  const ms = at.getTime();
  return ms >= bounds.start.getTime() && ms <= bounds.end.getTime();
}

/** 전체 주문 리스트·매출 집계에 포함할 결제완료 주문 */
export function isPaidOrderInBusinessSession(order: OrderForSession, bounds: BusinessSessionBounds) {
  const paidAt = getOrderPaidAt(order);
  if (!paidAt) {
    return false;
  }
  return isWithinBounds(paidAt, bounds);
}

export function computeSessionRevenue(orders: OrderForSession[], bounds: BusinessSessionBounds) {
  return orders
    .filter((order) => isPaidOrderInBusinessSession(order, bounds))
    .reduce((sum, order) => sum + order.totalAmount, 0);
}
