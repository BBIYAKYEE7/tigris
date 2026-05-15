export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: "basic" | "set" | "extra";
  description?: string;
};

/** 확정 전 예시 금액 — 실제 테이블비가 정해지면 이 값만 수정하세요 */
export const TABLE_FEE_EXAMPLE = 5000;

export const TABLE_FEE_MENU_ID = "table-fee";
export const TABLE_FEE_NAME = "테이블 이용요금";
export const TABLE_FEE_AMOUNT = TABLE_FEE_EXAMPLE;

export function isTableFeeMenuId(menuId: string) {
  return menuId === TABLE_FEE_MENU_ID;
}

export const MENU_ITEMS: MenuItem[] = [
  { id: "eomuk", name: "오뎅탕", price: 9000, category: "basic" },
  { id: "jeyuk", name: "제육", price: 12000, category: "basic" },
  { id: "ssy", name: "쏘야", price: 9000, category: "basic" },
  { id: "hwangdo", name: "황도", price: 8000, category: "basic" },
  {
    id: "tigris-set",
    name: "티그세트",
    price: 8000,
    category: "set",
    description: "초코파이 + 빼빼로 + 젤리 등",
  },
  { id: "soft-drink", name: "콜라/사이다", price: 3000, category: "extra" },
  { id: "water", name: "물", price: 1500, category: "extra" },
];

export const formatKrw = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
