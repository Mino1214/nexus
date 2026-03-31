# POLYWATCH

Polymarket 데이터를 백엔드 프록시로 받아 보여주는 관전형 모노레포 베이스라인입니다.

현재 구현 범위:

- `apps/api`: Polymarket 프록시, Redis 대응 캐시, PostgreSQL 대응 저장소, 정산 큐/BullMQ 폴백 구조
- `apps/web`: React 18 + TypeScript + Zustand + React Query + Router + i18n + Recharts + Tailwind
- `packages/shared`: 카테고리, 정렬, 마켓 타입, 배당 계산 유틸
- `compose.yaml`: 로컬 PostgreSQL + Redis 기동용 예시

아직 스켈레톤만 있는 영역:

- 포인트 베팅 정산
- DeepL 기반 번역 캐시

## 실행

```bash
npm install
npm run dev
```

- Web: `http://127.0.0.1:43120`
- API: `http://127.0.0.1:43121`
- Health: `http://127.0.0.1:43121/health`
- Ready: `http://127.0.0.1:43121/ready`

## 로컬 인프라 부팅

```bash
npm run infra:up
npm run db:migrate
npm run seed:demo
npm run verify:runtime
```

## Production 컨테이너 배포

컨테이너 기준 기본 포트는 아래입니다.

- Web: `http://127.0.0.1:43220`
- API: `http://127.0.0.1:43221`

배포용 예시 환경 파일:

- [deploy.prod.env.example](/Users/myno/Desktop/poly/deploy.prod.env.example)
- [apps/api/.env.production.example](/Users/myno/Desktop/poly/apps/api/.env.production.example)

Compose 기반 실행:

```bash
cp deploy.prod.env.example .env
npm run deploy:config
npm run deploy:up
```

실제 배포 전에는 아래 값들을 반드시 교체해야 합니다.

- `JWT_SECRET`
- `WEB_ORIGIN`
- `ADMIN_EMAILS` / `ADMIN_USERNAMES`

상태 확인:

```bash
curl http://127.0.0.1:43221/health
curl http://127.0.0.1:43221/ready
curl http://127.0.0.1:43220/healthz
```

정리:

```bash
npm run deploy:down
```

## CI/CD 템플릿

GitHub에 올리면 아래 워크플로를 바로 사용할 수 있습니다.

- `.github/workflows/ci.yml`
  - `npm ci`
  - `typecheck`
  - `build`
  - 로컬 infra 기동
  - `db:migrate`, `seed:demo`, `verify:runtime`
  - production compose config/build 검증
- `.github/workflows/publish-images.yml`
  - GHCR에 `polywatch-api`, `polywatch-web` 이미지 발행
- `.github/workflows/deploy-remote.yml`
  - 원격 서버에 `compose.ghcr.yaml` 배포
  - GHCR 이미지 pull 후 compose up
- `.github/workflows/deploy-remote-edge.yml`
  - Caddy 기반 TLS edge 스택 배포
  - `SITE_DOMAIN` 기준 자동 HTTPS
  - `/api`, `/health`, `/ready`는 API로 프록시
- `.github/workflows/deploy-remote-observability.yml`
  - Prometheus + Grafana 관측성 스택 배포
  - API `/metrics` 스크랩
  - 기본 Grafana datasource + dashboard provision
- `.github/workflows/ops-maintenance.yml`
  - 원격 서버에 운영 스크립트 업로드
  - 정기 백업 생성
  - 보관 주기 기준 prune
  - smoke + 백업 신선도 모니터링

원격 배포용 스택 파일:

- [compose.ghcr.yaml](/Users/myno/Desktop/poly/compose.ghcr.yaml)
- [compose.edge.ghcr.yaml](/Users/myno/Desktop/poly/compose.edge.ghcr.yaml)
- [compose.observability.yaml](/Users/myno/Desktop/poly/compose.observability.yaml)
- [deploy.ghcr.env.example](/Users/myno/Desktop/poly/deploy.ghcr.env.example)
- [deploy.edge.ghcr.env.example](/Users/myno/Desktop/poly/deploy.edge.ghcr.env.example)

로컬에서 GHCR용 compose만 검증하려면:

```bash
npm run deploy:ghcr:config
npm run deploy:edge:ghcr:config
npm run observability:config
```

`deploy-remote.yml`에 필요한 대표 secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `GHCR_TOKEN`
- `WEB_ORIGIN`
- `JWT_SECRET`
- `ADMIN_EMAILS`
- `ADMIN_USERNAMES`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL`
- `REDIS_URL`
- `API_PUBLIC_PORT`
- `WEB_PUBLIC_PORT`

`deploy-remote-edge.yml`에 추가로 필요한 secrets:

- `SITE_DOMAIN`
- `ACME_EMAIL`
- `EDGE_HTTP_PORT`
- `EDGE_HTTPS_PORT`

알림 webhook을 쓰려면 추가 secrets/vars:

- `ALERT_WEBHOOK_URL`
- `ALERT_FORMAT` (`generic` | `slack` | `discord`, GitHub Variable 권장)

`deploy-remote-observability.yml`에서 선택적으로 쓰는 env:

- `PROMETHEUS_PORT` 기본값 `43300`
- `GRAFANA_PORT` 기본값 `43301`
- `GRAFANA_ADMIN_USER` 기본값 `admin`
- `GRAFANA_ADMIN_PASSWORD` 기본값 `polywatch-admin`

현재 작업 디렉터리는 git 저장소가 아니므로, 이 워크플로들은 GitHub repo로 올린 뒤 활성화됩니다.

`ops-maintenance.yml`에서 선택적으로 쓰는 GitHub Variables:

- `BACKUP_KEEP_COUNT` 기본값 `7`
- `BACKUP_MAX_AGE_DAYS` 기본값 `14`
- `BACKUP_MAX_AGE_HOURS` 기본값 `36`

## PostgreSQL 모드

Docker daemon이 켜져 있다면:

```bash
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run dev:api
```

`DATABASE_URL`이 설정되어 있으면 API는 PostgreSQL을 사용하고, 없으면 기존 로컬 파일 저장소로 fallback 합니다.

`REDIS_URL`이 설정되어 있으면:

- Polymarket 응답 캐시가 Redis를 우선 사용합니다.
- 정산 스윕 요청이 BullMQ 큐를 통해 처리됩니다.

`REDIS_URL`이 없으면:

- 캐시는 메모리 fallback
- 정산은 현재 프로세스에서 inline 실행

## Admin 접근 제어

번역 관리 페이지와 `/api/admin/translations`는 이제 관리자 세션에서만 접근됩니다.

- 운영에서는 `apps/api/.env`에 `ADMIN_EMAILS` 또는 `ADMIN_USERNAMES`를 설정하면 됩니다.
- 값은 쉼표 구분 allowlist 형식입니다.
- 로컬 개발에서 allowlist를 비워두면 `myno_demo@example.com` / `myno_demo` 계정이 dev fallback 관리자입니다.
- 현재 기본 `.env`는 `myno_demo@example.com` / `myno_demo`를 allowlist에 포함합니다.

### Pandora 마스터 관리자 연동

Pandora를 마스터 관리자 셸로 쓰고, 거기서 PolyWatch 관리 화면으로 넘어갈 수 있습니다.

- Pandora 서버는 `/api/admin/integrations/polywatch/token`에서 짧은 수명의 SSO 토큰을 발급합니다.
- PolyWatch는 `POST /api/auth/external/exchange`에서 그 토큰을 검증하고 내부 관리자 세션으로 교환합니다.
- Pandora 마스터 계정으로 로그인하면 상단과 서비스 허브 카드에서 `PolyWatch`를 열 수 있습니다.
- PolyWatch `/admin`은 `?ssoToken=...` 쿼리를 자동 처리하고, 세션 교환이 끝나면 URL에서 토큰을 제거합니다.

PolyWatch 환경 변수:

- `EXTERNAL_ADMIN_SSO_SECRET`
- `EXTERNAL_ADMIN_SSO_ISSUER` 기본값: `pandora-admin`
- `EXTERNAL_ADMIN_SSO_AUDIENCE` 기본값: `polywatch-admin`

Pandora 환경 변수:

- `POLYWATCH_ADMIN_URL` 예: `http://127.0.0.1:43120/admin`
- `POLYWATCH_SSO_SECRET`
- `POLYWATCH_SSO_ISSUER` 기본값: `pandora-admin`
- `POLYWATCH_SSO_AUDIENCE` 기본값: `polywatch-admin`

로컬 개발에서는 두 프로젝트가 모두 값을 비워두면 동일한 dev fallback secret을 사용합니다.

## 배포 메모

- API는 `HOST`를 지정하지 않으면 개발에서 `127.0.0.1`, production 에서는 `0.0.0.0`에 바인딩됩니다.
- `/health`는 모드 요약, `/ready`는 DB/Redis/queue readiness를 반환합니다.
- `/metrics`는 Prometheus 형식 메트릭을 반환합니다.
- `apps/api/dist` 직접 실행 시에도 `.env`와 SQL migrations를 찾도록 런타임 경로를 고정했습니다.
- 실도메인 운영은 `compose.edge.ghcr.yaml`을 기준으로 두는 편이 맞습니다.
- Caddy edge는 `SITE_DOMAIN`에 대해 자동 HTTPS를 붙이고, `WEB_ORIGIN`은 반드시 `https://<도메인>`과 일치해야 합니다.
- edge 스택에서는 API와 Web 컨테이너를 직접 외부 publish 하지 않고 Caddy만 `80/443`을 엽니다.

## 관측성

Prometheus + Grafana는 production compose에 덧붙여 profile 형태로 실행합니다.

```bash
npm run observability:config
npm run observability:up
```

- Prometheus: `http://127.0.0.1:43300`
- Grafana: `http://127.0.0.1:43301`
- 기본 Grafana 계정: `admin / polywatch-admin`

Grafana에는 `Prometheus` datasource와 `Polywatch Overview` 대시보드가 자동 provision 됩니다.

정리:

```bash
npm run observability:down
```

## 운영 스크립트

현재 production compose 스택을 기준으로 아래 스크립트를 추가했습니다.

```bash
npm run ops:smoke
npm run ops:backup
npm run ops:backup:prune
npm run ops:monitor
npm run ops:notify:test
npm run ops:restore -- backups/<timestamp>/postgres.sql
```

- `ops:smoke`
  - API `/health`, `/ready`
  - Web `/healthz`
  - SPA fallback
  - `/api/leaderboard` reverse proxy
  - 비인증 관리자 API `401`
- `ops:backup`
  - production postgres를 `backups/<timestamp>/postgres.sql`로 덤프
  - 같은 디렉터리에 `health.json`, `ready.json`, `metadata.json` 저장
- `ops:backup:prune`
  - 최신 백업 `KEEP_COUNT`개를 남기고 오래된 백업 디렉터리 삭제
  - `MAX_AGE_DAYS`보다 오래된 백업도 정리
- `ops:monitor`
  - `ops:smoke`를 먼저 실행
  - 최신 백업의 필수 산출물 존재 여부 확인
  - 최신 백업이 `MAX_BACKUP_AGE_HOURS`보다 오래됐으면 실패
- `ops:notify:test`
  - `ALERT_WEBHOOK_URL`로 테스트 알림 전송
  - `ALERT_FORMAT=generic|slack|discord` 지원
- `ops:restore`
  - 현재 postgres `public` 스키마를 비우고 SQL dump를 복구
  - Redis는 현재 캐시/큐 용도라 복구 대상에서 제외

원격 GHCR 배포 스택에서 스크립트를 직접 실행할 때는 env-file도 같이 넘기면 됩니다.

```bash
COMPOSE_FILE_PATH=compose.ghcr.yaml COMPOSE_ENV_FILE=deploy.env bash scripts/ops-backup.sh
COMPOSE_FILE_PATH=compose.ghcr.yaml COMPOSE_ENV_FILE=deploy.env bash scripts/ops-restore.sh backups/<timestamp>/postgres.sql
```
