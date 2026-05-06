export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: "basic" | "set" | "extra";
  description?: string;
};

export const MENU_ITEMS: MenuItem[] = [
  { id: "macaroni", name: "기본안주 마카로니", price: 3000, category: "basic" },
  { id: "ssy", name: "쏘야", price: 12000, category: "basic" },
  { id: "jeyuk", name: "제육볶음", price: 15000, category: "basic" },
  { id: "eomuk", name: "어묵탕", price: 14000, category: "basic" },
  { id: "hwangdo", name: "황도", price: 9000, category: "basic" },
  {
    id: "tigris-set",
    name: "티그리스 세트",
    price: 10000,
    category: "set",
    description: "초코파이 + 빼빼로 + 젤리 등",
  },
  { id: "soft-drink", name: "음료수", price: 2000, category: "extra" },
  { id: "hangover", name: "숙취해소제", price: 5000, category: "extra" },
  { id: "water", name: "생수", price: 1000, category: "extra" },
];

export const formatKrw = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
