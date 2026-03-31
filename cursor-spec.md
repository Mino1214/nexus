# 마켓 플랫폼 — Cursor 개발 스펙 문서

## 1. 프로젝트 개요

기존 `macroServer` 프로젝트를 베이스로, 다단계 운영자 구조를 가진 상품 판매 마켓 플랫폼을 구축한다.

### 핵심 개념

- **Master(우리)**: 최상위 관리자. 마켓 홈페이지 전체를 운영하며, 운영자에게 독립 사이트를 발급한다.
- **운영자(Operator)**: Master로부터 사이트를 발급받아 독립적으로 운영하는 사업자. 자신의 사이트에서 유저를 직접 관리한다.
- **유저(User)**: 운영자의 발급 사이트에서 활동하는 일반 회원. 포인트를 적립하고 캐쉬로 상품을 구매한다.

### 계층 구조

```
Master (최상위 관리자)
  └── 운영자 A (독립 사이트 a.domain.com)
        └── 유저 1, 2, 3 ...
  └── 운영자 B (독립 사이트 b.domain.com)
        └── 유저 4, 5, 6 ...
```

---

## 2. macroServer 연동 지시

> **Cursor에게**: 기존 `macroServer` 프로젝트와 아래 신규 기능을 통합(merge)하라.
> macroServer에 이미 구현된 기능(계정/인증, 결제/충전, 상품 관리)은 **수정하지 말고 확장**하는 방향으로 개발할 것.

### 확인 후 확장할 기존 모듈

| 기존 모듈 | 확장 내용 |
|---|---|
| 계정/인증 | `role` 필드에 `master` / `operator` / `user` 3단계 추가 |
| 결제/충전 | 운영자별 캐쉬 잔액 분리, 포인트→캐쉬 월 전환 한도 정책 추가 |
| 상품 관리 | 운영자별 상품 노출 범위(scoping) 추가, Master가 전체 상품 관리 |

---

## 3. 기술 스택

macroServer의 기존 스택을 그대로 유지한다.

```
Frontend  : Next.js (App Router, TypeScript)
Backend   : NestJS (TypeScript)
Database  : PostgreSQL
ORM       : Prisma (또는 기존 macroServer ORM 유지)
Cache     : Redis (세션, 포인트 캐싱)
Storage   : S3 호환 (동영상 파일 업로드)
Auth      : JWT (Access + Refresh Token)
```

---

## 4. DB 스키마

기존 macroServer 스키마에 아래 테이블/컬럼을 추가한다.

### 4-1. User 테이블 확장

```sql
-- 기존 users 테이블에 추가
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'; -- master | operator | user
ALTER TABLE users ADD COLUMN operator_id INT REFERENCES users(id); -- 소속 운영자 (유저만 해당)
ALTER TABLE users ADD COLUMN site_domain VARCHAR(255); -- 운영자 전용 도메인
ALTER TABLE users ADD COLUMN is_site_active BOOLEAN DEFAULT false; -- 사이트 활성 여부
```

### 4-2. Points (포인트 내역)

```sql
CREATE TABLE points (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  amount INT NOT NULL,
  type VARCHAR(30) NOT NULL, -- 'attendance' | 'mini_game' | 'video_upload' | 'admin_grant'
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4-3. Cash (캐쉬 잔액 및 전환 내역)

```sql
CREATE TABLE cash_balance (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id),
  balance INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cash_transactions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  amount INT NOT NULL,
  type VARCHAR(30) NOT NULL, -- 'charge' | 'point_convert' | 'purchase' | 'refund'
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4-4. Point Convert Policy (월 전환 한도 정책)

```sql
CREATE TABLE point_convert_policy (
  id SERIAL PRIMARY KEY,
  operator_id INT REFERENCES users(id), -- NULL이면 전체 기본 정책
  monthly_limit INT NOT NULL DEFAULT 50000, -- 월 전환 가능 포인트 상한
  convert_rate DECIMAL(5,2) DEFAULT 1.00, -- 포인트 → 캐쉬 비율 (1.00 = 1:1)
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 4-5. Attendance (출석체크)

```sql
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  checked_date DATE NOT NULL,
  points_earned INT NOT NULL DEFAULT 100,
  streak_count INT DEFAULT 1, -- 연속 출석일수
  UNIQUE(user_id, checked_date)
);
```

### 4-6. Videos (동영상 업로드 및 검수)

```sql
CREATE TABLE videos (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  file_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  title VARCHAR(200),
  status VARCHAR(20) DEFAULT 'pending', -- pending | approved | rejected
  points_earned INT DEFAULT 0,
  reviewed_by INT REFERENCES users(id), -- 검수한 어드민
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4-7. Mini Games (미니게임 로그)

```sql
CREATE TABLE mini_game_logs (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  game_type VARCHAR(50) NOT NULL,
  score INT DEFAULT 0,
  points_earned INT NOT NULL,
  played_at TIMESTAMP DEFAULT NOW()
);
```

### 4-8. Products (상품 — 기존 상품 관리 확장)

```sql
-- 기존 products 테이블에 추가
ALTER TABLE products ADD COLUMN category VARCHAR(50); -- 'polymarket' | 'mining' | 'etc'
ALTER TABLE products ADD COLUMN operator_id INT REFERENCES users(id); -- NULL이면 Master 공용
ALTER TABLE products ADD COLUMN price_cash INT NOT NULL DEFAULT 0; -- 캐쉬 가격
ALTER TABLE products ADD COLUMN stock INT DEFAULT -1; -- -1은 무제한
ALTER TABLE products ADD COLUMN is_visible BOOLEAN DEFAULT true;
```

### 4-9. Orders (주문)

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  product_id INT NOT NULL REFERENCES products(id),
  operator_id INT REFERENCES users(id),
  quantity INT NOT NULL DEFAULT 1,
  total_cash INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending | confirmed | cancelled
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. API 엔드포인트

### 5-1. 인증 (기존 macroServer 확장)

```
POST   /auth/register              유저 회원가입 (operator_id 포함)
POST   /auth/login                 로그인 (role 반환)
POST   /auth/refresh               토큰 갱신
```

### 5-2. Master 전용 API (role: master)

```
GET    /master/operators           전체 운영자 목록
POST   /master/operators           운영자 생성 + 사이트 발급
PATCH  /master/operators/:id       운영자 정보 수정 / 사이트 활성·비활성
DELETE /master/operators/:id       운영자 삭제

GET    /master/users               전체 유저 목록 (운영자 필터 가능)
GET    /master/stats               전체 매출, 포인트, 회원수 통계

GET    /master/products            전체 상품 목록
POST   /master/products            상품 생성
PATCH  /master/products/:id        상품 수정
DELETE /master/products/:id        상품 삭제

GET    /master/policy              포인트 전환 정책 조회
PATCH  /master/policy              전체 기본 정책 수정
PATCH  /master/policy/:operatorId  특정 운영자 정책 수정

GET    /master/videos              검수 대기 동영상 목록
PATCH  /master/videos/:id/review   동영상 승인 / 거절
```

### 5-3. 운영자 API (role: operator)

```
GET    /operator/dashboard         내 사이트 유저수, 매출, 포인트 현황
GET    /operator/users             내 유저 목록
PATCH  /operator/users/:id         유저 상태 변경 (정지 등)

GET    /operator/products          내 사이트 노출 상품 목록
POST   /operator/products          상품 등록 (Master 승인 필요 or 즉시)
PATCH  /operator/products/:id      상품 수정

GET    /operator/orders            내 사이트 주문 내역
GET    /operator/videos            내 사이트 유저의 동영상 목록
PATCH  /operator/videos/:id/review 1차 검수 (Master로 전달)
```

### 5-4. 유저 API (role: user)

```
GET    /user/me                    내 정보 (포인트, 캐쉬 잔액)
GET    /user/points                포인트 내역
GET    /user/cash                  캐쉬 내역

POST   /user/attendance            출석체크
GET    /user/attendance/streak     연속 출석 현황

POST   /user/mini-game/play        미니게임 결과 제출 (points 적립)

POST   /user/videos                동영상 업로드
GET    /user/videos                내 업로드 동영상 목록

POST   /user/cash/charge           캐쉬 충전 (PG 연동)
POST   /user/points/convert        포인트 → 캐쉬 전환 (월 한도 검사)

GET    /user/products              상품 목록 (내 운영자 사이트 기준)
POST   /user/orders                상품 구매 (캐쉬 차감)
GET    /user/orders                내 주문 내역
```

---

## 6. 핵심 비즈니스 로직

### 6-1. 포인트 적립 규칙

| 유형 | 포인트 | 조건 |
|---|---|---|
| 출석체크 | 100p | 하루 1회 |
| 연속 출석 보너스 | +50p/일 | 최대 7일 연속 기준 |
| 미니게임 | 50~200p | 게임 종류별 상이 |
| 동영상 업로드 | 500p | 어드민 승인 후 지급 |

### 6-2. 포인트 → 캐쉬 전환

- 전환 비율: 기본 1:1 (어드민 설정 가능)
- **월 전환 한도**: 운영자별 또는 전체 기본값 설정 (`point_convert_policy`)
- 당월 전환 합계가 한도 초과 시 → 400 에러 반환
- 매월 1일 자정에 전환 카운터 리셋 (Redis Cron 또는 DB 집계)

### 6-3. 캐쉬 차감 구매 플로우

```
유저 구매 요청
  → 캐쉬 잔액 확인 (balance >= total_cash)
  → 재고 확인 (stock > 0 or stock === -1)
  → cash_transactions 차감 INSERT
  → cash_balance 업데이트
  → orders INSERT (status: confirmed)
  → 재고 감소
```

### 6-4. 운영자 사이트 발급

- Master가 운영자 생성 시 `site_domain` 지정
- 해당 도메인으로 접속 시 → 해당 운영자의 상품, 유저, 정책이 적용된 프론트 렌더링
- 멀티테넌시: Next.js `middleware.ts`에서 도메인별 `operatorId` resolve → API 요청에 `X-Operator-Id` 헤더 포함

---

## 7. 프론트엔드 페이지 구성

### Master 어드민 (`/master/*`)

```
/master/dashboard        — 전체 현황 (운영자수, 유저수, 매출)
/master/operators        — 운영자 목록 / 생성 / 사이트 발급
/master/users            — 전체 유저 관리
/master/products         — 전체 상품 관리
/master/videos           — 동영상 검수 목록
/master/policy           — 포인트 전환 정책 설정
/master/orders           — 전체 주문 내역
```

### 운영자 어드민 (`/operator/*`)

```
/operator/dashboard      — 내 사이트 현황
/operator/users          — 내 유저 관리
/operator/products       — 내 상품 관리
/operator/videos         — 내 유저 동영상 1차 검수
/operator/orders         — 내 주문 내역
```

### 유저 페이지 (운영자별 독립 도메인)

```
/                        — 메인 상품 목록 (판매 페이지)
/product/:id             — 상품 상세
/my                      — 내 정보 (포인트, 캐쉬, 주문)
/attendance              — 출석체크
/game                    — 미니게임
/upload                  — 동영상 업로드
/charge                  — 캐쉬 충전
```

---

## 8. 보안 & 가드

```typescript
// NestJS Guard 구성
@Roles('master')       // Master 전용 엔드포인트
@Roles('operator')     // 운영자 전용
@Roles('user')         // 유저 전용
@Roles('master', 'operator')  // 복합 권한

// 운영자는 본인 소속 유저/데이터만 접근 가능
// OperatorScopeGuard: req.user.id === resource.operator_id 검사
```

---

## 9. 개발 우선순위 (Phase)

### Phase 1 — macroServer 확장 (1~2주)
- [ ] DB 스키마 마이그레이션 (위 4번 항목 적용)
- [ ] Role 기반 Guard 구성 (master / operator / user)
- [ ] Master 운영자 생성 + 사이트 발급 API
- [ ] 멀티테넌시 미들웨어 (도메인 → operatorId resolve)

### Phase 2 — 포인트 적립 시스템 (1~2주)
- [ ] 출석체크 API + 연속 출석 보너스
- [ ] 미니게임 결과 제출 API
- [ ] 동영상 업로드 (S3) + 검수 워크플로우
- [ ] 포인트 → 캐쉬 전환 (월 한도 정책 적용)

### Phase 3 — 구매 플로우 (1주)
- [ ] 캐쉬 차감 구매 로직
- [ ] 주문 생성 / 상태 관리
- [ ] 유저 판매 페이지 UI (ezloan.io 레퍼런스)

### Phase 4 — 어드민 & 런칭 (1주)
- [ ] Master 어드민 대시보드
- [ ] 운영자 어드민 대시보드
- [ ] 포인트 전환 정책 설정 UI
- [ ] 동영상 검수 UI
- [ ] QA 및 배포

---

## 10. Cursor 작업 지시 (복붙용)

```
macroServer 프로젝트를 기반으로 아래 스펙 문서의 기능을 추가 개발해줘.

기존 코드(계정/인증, 결제/충전, 상품관리)는 수정하지 말고 확장 방향으로 작업해.

작업 순서:
1. /prisma/schema.prisma (또는 기존 ORM 스키마)에 위 DB 스키마 추가
2. NestJS에 RolesGuard + OperatorScopeGuard 구성
3. master / operator / user 각 모듈 생성 (위 API 엔드포인트 기준)
4. 포인트 적립 서비스 (출석, 미니게임, 동영상)
5. 포인트→캐쉬 전환 서비스 (월 한도 검사 포함)
6. Next.js 미들웨어에서 도메인 → operatorId resolve 로직 추가

각 단계 완료 후 다음 단계 진행해줘.
```
