/**
 * Admin Worker - 백그라운드에서 주문을 계속 폴링합니다.
 * Web Worker이므로 메인 스레드가 배경에 있어도 계속 실행됩니다.
 */

const POLL_MS = 4000;
const API_BASE_URL = "/api";
let previousOrderIds = new Set();
let isRunning = false;
let pollingIntervalId = null;

async function pollOrders() {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/orders?_=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    if (!Array.isArray(data.orders)) {
      return;
    }

    // 새로운 PENDING 주문 확인
    const currentOrderIds = new Set();
    const newOrders = [];

    for (const order of data.orders) {
      if (order.status === "PENDING") {
        currentOrderIds.add(order.id);
        if (!previousOrderIds.has(order.id)) {
          newOrders.push(order);
        }
      }
    }

    previousOrderIds = currentOrderIds;

    // 새 주문이 있으면 메인 스레드에 알림
    if (newOrders.length > 0) {
      self.postMessage({
        type: "NEW_ORDERS_BACKGROUND",
        orders: newOrders,
      });
    }
  } catch {
    // 폴링 오류 무시
  }
}

// 주기적 폴링 시작
function startPolling() {
  if (isRunning) return;
  isRunning = true;

  // 즉시 폴링
  pollOrders();

  // 주기적 폴링
  pollingIntervalId = setInterval(() => {
    pollOrders();
  }, POLL_MS);
}

// 폴링 중지
function stopPolling() {
  isRunning = false;
  if (pollingIntervalId !== null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}

// 메인 스레드로부터 메시지 처리
self.addEventListener("message", (event) => {
  if (event.data?.type === "START_POLLING") {
    startPolling();
  } else if (event.data?.type === "STOP_POLLING") {
    stopPolling();
  }
});
