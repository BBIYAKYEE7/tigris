## TIGRIS 주점 주문 시스템

이 레포는 고려대학교 아마추어 아이스하키 동아리 **TIGRIS** 주점 주문 시스템입니다.  
손님용 웹 화면(frontend), 관리자용 화면(admin), 주문을 처리하는 백엔드 서버(backend)로 구성되어 있습니다.

### 1. 폴더 구조

- `frontend` : 손님이 사용하는 주문 화면 (Next.js App Router)
- `admin` : 카운터에서 사용하는 관리자 화면 (Next.js App Router)
- `backend` : 주문/메뉴/테이블 정보를 처리하는 Express 서버

### 2. 기본 요구사항

- Node.js 20 이상
- npm 사용 (yarn/pnpm 사용해도 무방)

### 3. 환경 변수 설정

루트의 `.env` 파일 또는 각 패키지의 `.env`에 아래 값을 설정해서 사용합니다.

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`  
  - 설정하면 Upstash Redis에 주문을 저장해 **배포 환경에서도 주문이 유지**됩니다.
  - 설정하지 않으면 서버리스에서는 메모리만 사용해 인스턴스마다 목록이 달라질 수 있습니다.
- `NEXT_PUBLIC_API_BASE_URL` (선택)  
  - 다른 호스트의 API를 쓸 때만. 비우면 같은 사이트의 `/api` 사용.

### 4. 로컬 개발 실행 방법

1. 의존성 설치

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../admin && npm install
```

2. 백엔드 서버 실행

```bash
cd backend
npm run dev
# 기본: http://localhost:4000
```

3. 손님용 프론트엔드 실행

```bash
cd frontend
npm run dev
# 기본: http://localhost:3000
```

4. 관리자 화면 실행

```bash
cd admin
npm run dev
# 기본: http://localhost:3001 (또는 Next가 안내하는 포트)
```

### 5. 주요 기능 요약

- 손님 화면 (`frontend`)
  - 테이블 번호(1~999)를 적용하면 같은 번호의 손님이 **같은 주문 목록**을 공유
  - 메뉴 선택 후 `주문하기` 버튼 → 백엔드 `/api/orders`로 주문 생성
  - `/api/orders/by-table/:tableNum`을 통해 해당 테이블의 **결제 대기 주문 목록**을 폴링

- 관리자 화면 (`frontend`의 `/admin`)
  - `/api/admin/orders`에서 전체 주문 목록을 불러와 관리
  - 결제완료(PAID) 처리에 별도 토큰은 필요 없음 (**`/admin` 주소가 노출되면 누구나 처리 가능**에 유의)

이 README는 프로젝트 구조와 실행 방법을 간단히 정리한 것으로, 실제 개발 시 각 폴더의 `README.md`도 참고해 주세요.