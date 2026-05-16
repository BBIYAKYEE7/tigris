import { TIGRIS_SET_MENU_ID } from "@/lib/menu";

type BillableLine = {
  menuId: string;
  lineTotal: number;
};

export function isTigrisSetMenuId(menuId: string) {
  return menuId === TIGRIS_SET_MENU_ID;
}

/** 스토리 이벤트 적용 시 티그세트 라인 합계 (50% 할인) */
export function adjustedLineTotal(line: BillableLine, tigrisSetEventApplied: boolean) {
  if (!tigrisSetEventApplied || !isTigrisSetMenuId(line.menuId)) {
    return line.lineTotal;
  }
  return Math.round(line.lineTotal / 2);
}

export function sumAdjustedLineTotals(lines: BillableLine[], tigrisSetEventApplied: boolean) {
  return lines.reduce((sum, line) => sum + adjustedLineTotal(line, tigrisSetEventApplied), 0);
}
