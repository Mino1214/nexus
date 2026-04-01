# Nexus 모노레포 — 에이전트·개발자 안내

이 문서는 저장소 구조, 백엔드 **서비스(`services/`)** 배치 규칙, 그리고 **masterAdmin 총판 허브**와의 관계를 정리합니다. 새 모듈·서비스를 추가할 때 동일 패턴을 따르면 됩니다.

## 상위 구조

| 영역 | 역할 |
|------|------|
| **`services/`** | 실행 가능한 백엔드 프로세스(Node 등). **여기로 계속 모읍니다.** |
| **`masterAdmin/`** | 총판·모듈 카탈로그·고객(`master_*` 테이블)·배포 URL을 다루는 SPA. API는 `nexus-market-api`를 사용합니다. |
| **`futureChart/`**, **`totalMarket/`**, **`marketPlace/`** 등 | 제품 프론트. 각자 `.env`로 API·WS URL을 지정합니다. |
| **공용 DB** | MariaDB (`mynolab` 등). 스키마 확장·시드는 **`services/nexus-market-api`** 기동 시 `market/dbMigrate.js`가 담당합니다. |

## `services/` 안의 서비스 (현재)

| 디렉터리 | 설명 | 기본 포트(예) |
|----------|------|----------------|
| **`nexus-market-api`** | 총마켓 REST, 마켓 JWT 로그인, `master_*`·`market_*` API. **마이그레이션 단일 진입점.** | 3001 |
| **`macro-server`** | Pandora 레거시(시드·총판·`admin.html` 등). 예전 루트 `macroServer/`에서 이전됨. | 3000 |
| **`future-chart-broker`** | FutureChart용 WebSocket 브로커. | 8787 |
| **`future-trade-admin`** | HTS 운영 보조 API, `module_code`로 동일 DB 행 구분. | 3020 |

새 백엔드를 추가할 때는 **`services/<kebab-name>/`** 아래에 두고, `package.json` + `README` 생략 가능하나 **`.env.example`** 은 두는 것을 권장합니다.

## masterAdmin과의 관계

- **모듈 카탈로그**: `master_catalog_modules` (slug 예: `pandora`, `hts_future_trade`, `polymart`).
- **고객(회사/테넌트)**: `master_market_customers` — `site_domain`, `deployment_url` 등은 **나중에 어드민에서 수기 입력**하는 흐름을 전제로 합니다.
- **모듈 사용 권한**: `master_customer_entitlements` (`can_admin` / `can_operator`).
- **마켓 로그인 유저**: `users.id` 를 고객에 붙이려면 `master_market_customers.market_user_id` (masterAdmin 고객 상세에서 발급).

FutureChart 마스터 로그인은 `VITE_HTS_MODULE_SLUG` 가 설정된 경우 `POST /api/market/auth/login` + 위 권한 테이블로 검증합니다.

## Pandora(FutureChart) 내비 — 제품 층

상위 구조는 **masterAdmin → 총마켓(totalMarket) / Pandora(FutureChart)** 입니다. FutureChart 안에서는 두 그룹으로 나눕니다.

| 그룹 (사이드바) | 담당 | 구현 위치 |
|-----------------|------|-----------|
| **FutureChart · HTS** | 차트·브로커·HTS 운영(충전·총판 등) | `futureChart` + `nexus-market-api` (`/hts/*` 등) |
| **FutureChart · 운영 콘솔** | 승인·회원·알림봇·정산·출금·가격·텔레그램·공지·다운로드 | **`futureChart/src/hub/`** + **`GET/POST …/api/market/hts/hub/*`** (`market/routes/htsHub.js`). 충전 승인은 기존 `/hts/charge-requests` 와 병행. DB: `users.approval_status`, `hts_operator_withdrawals`, `hts_hub_notify_settings` 등 (`dbMigrate`). |

옵션 env: **`VITE_MASTER_ADMIN_URL`**, **`VITE_TOTAL_MARKET_URL`** — 운영 콘솔 상단 바로가기.

## 로컬 테스트용 시드 (`dbMigrate`)

`demo-tenant@nexus.local` 고객, `demo-tenant.nexus.local` 도메인, 모듈 3종 배포 URL(로컬 예시), 마켓 유저 **`htsdemo` / `HtsDemo12`**, 운영자 **`demo_op` / `OpDemo12`** 가 없을 때 생성됩니다. masterAdmin **고객·배포** 화면에 그대로 보입니다.

## macro-server 이전

- 과거 경로: 저장소 루트 `macroServer/`
- 현재 경로: **`services/macro-server`**
- 구형 경로를 찾는 로직(예: APK 검색)은 호환용으로 일부 유지할 수 있습니다.

## 이후 작업 시 권장 순서

1. DB 스키마/시드 필요 → **`services/nexus-market-api/market/dbMigrate.js`** (또는 별도 마이그레이션 파일을 이 API에서만 로드).
2. 마스터 UI에 노출할 고객·모듈·URL → **masterAdmin** + `master_*` API.
3. 새 실시간/도메인 전용 API → **`services/<이름>/`** + `futureChart` 등에서 `VITE_*` 로 URL 연결.

질문이 스키마·권한이면 `market/routes/masterTotalMarket.js`, `market/htsEntitlement.js`, `market/routes/auth.js` 를 우선 확인하세요.
