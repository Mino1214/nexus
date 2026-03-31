export type BusinessMarketType = "yes-no" | "multi-candidate";
export type BusinessClientStatus = "trial" | "active" | "paused" | "expired";
export type BusinessKeyStatus = "active" | "paused" | "expired";
export type BusinessTemplateStatus = "ready" | "custom-only" | "archived";
export type BusinessResellerStatus = "active" | "paused";
export type BusinessTreeSlot = "root" | "left" | "right";
export type BusinessAccessTier = "starter" | "growth" | "enterprise";
export type BusinessPricingMode = "manual" | "live-market";

export interface ApiBusinessTemplateRecord {
  id: string;
  name: string;
  category: string;
  marketType: BusinessMarketType;
  titlePattern: string;
  description: string;
  outcomes: string[];
  defaultOddsMargin: number;
  settlementSource: string;
  designPack: string;
  customizable: boolean;
  setupFee: number;
  monthlyFee: number;
  status: BusinessTemplateStatus;
  pricingMode?: BusinessPricingMode;
  autoPricingEnabled?: boolean;
  automationQuery?: string | null;
  trackedMarketId?: string | null;
  trackedMarketQuestion?: string | null;
  refreshSeconds?: number;
  updatedAt: string;
}

export interface ApiBusinessClientRecord {
  id: string;
  name: string;
  company: string;
  contact: string;
  status: BusinessClientStatus;
  resellerId: string | null;
  templateId: string | null;
  marketType: BusinessMarketType;
  accessTier: BusinessAccessTier;
  planName: string;
  monthlyFee: number;
  setupFee: number;
  lossRevenue30d: number;
  allowedMarkets: string[];
  customizable: boolean;
  notes: string;
  contractStartedAt: string;
  contractEndsAt: string;
  createdAt: string;
}

export interface ApiBusinessKeyRecord {
  id: string;
  clientId: string;
  label: string;
  keyPreview: string;
  secretHash: string;
  scopes: string[];
  allowedOrigins: string[];
  allowedIps: string[];
  rateLimitPerMinute: number;
  status: BusinessKeyStatus;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

export interface ApiBusinessResellerRecord {
  id: string;
  parentId: string | null;
  slot: BusinessTreeSlot;
  name: string;
  code: string;
  contact: string;
  shareOfParentPercent: number;
  status: BusinessResellerStatus;
  createdAt: string;
}

export interface AdminBusinessState {
  templates: ApiBusinessTemplateRecord[];
  clients: ApiBusinessClientRecord[];
  apiKeys: ApiBusinessKeyRecord[];
  resellers: ApiBusinessResellerRecord[];
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function createDefaultAdminBusinessState(): AdminBusinessState {
  return {
    templates: [
      {
        id: "tpl_kr_politics_yesno",
        name: "KR Politics YES/NO",
        category: "정치 기본형",
        marketType: "yes-no",
        titlePattern: "질문 1개 / YES·NO 2옵션",
        description: "한국 정치 이슈를 YES/NO 구조로 배포하는 기본 API 패키지입니다.",
        outcomes: ["YES", "NO"],
        defaultOddsMargin: 0.07,
        settlementSource: "공식 결과 + 수동 승인",
        designPack: "PolyWatch Default / Cyan",
        customizable: true,
        setupFee: 900000,
        monthlyFee: 350000,
        status: "ready",
        pricingMode: "manual",
        autoPricingEnabled: false,
        automationQuery: null,
        trackedMarketId: null,
        trackedMarketQuestion: null,
        refreshSeconds: 30,
        updatedAt: daysAgo(2),
      },
      {
        id: "tpl_presidential_multi",
        name: "Presidential Multi-Candidate",
        category: "대선 특화형",
        marketType: "multi-candidate",
        titlePattern: "대통령 선거 / 다중 후보",
        description: "홍길동, 이슬이, 이철수처럼 다중 후보 배당과 결과 정산을 제공하는 선거형 템플릿입니다.",
        outcomes: ["홍길동", "이슬이", "이철수"],
        defaultOddsMargin: 0.09,
        settlementSource: "선관위 결과 + 관리자 확정",
        designPack: "Election Board / Glass",
        customizable: true,
        setupFee: 1800000,
        monthlyFee: 650000,
        status: "ready",
        pricingMode: "manual",
        autoPricingEnabled: false,
        automationQuery: null,
        trackedMarketId: null,
        trackedMarketQuestion: null,
        refreshSeconds: 30,
        updatedAt: daysAgo(4),
      },
      {
        id: "tpl_local_issue_custom",
        name: "Local Issue Custom Pack",
        category: "커스텀 주문형",
        marketType: "yes-no",
        titlePattern: "지자체/현안 맞춤형",
        description: "홈페이지 디자인, 문구, 결과 정산 방식을 발주처에 맞게 커스텀하는 주문형 패키지입니다.",
        outcomes: ["YES", "NO"],
        defaultOddsMargin: 0.1,
        settlementSource: "고객사 기준 + PolyWatch 운영 확정",
        designPack: "Custom Order",
        customizable: true,
        setupFee: 3000000,
        monthlyFee: 900000,
        status: "custom-only",
        pricingMode: "manual",
        autoPricingEnabled: false,
        automationQuery: null,
        trackedMarketId: null,
        trackedMarketQuestion: null,
        refreshSeconds: 30,
        updatedAt: daysAgo(1),
      },
    ],
    clients: [
      {
        id: "cli_hanriver",
        name: "한강정치API",
        company: "한강미디어",
        contact: "ops@hangangmedia.kr",
        status: "active",
        resellerId: "res_a1",
        templateId: "tpl_presidential_multi",
        marketType: "multi-candidate",
        accessTier: "enterprise",
        planName: "Election Enterprise",
        monthlyFee: 980000,
        setupFee: 1800000,
        lossRevenue30d: 18400000,
        allowedMarkets: ["presidential", "polling", "debate"],
        customizable: true,
        notes: "대선 후보 다중 배당 + 관리자 페이지 커스텀 요청 있음.",
        contractStartedAt: daysAgo(48),
        contractEndsAt: daysFromNow(112),
        createdAt: daysAgo(48),
      },
      {
        id: "cli_bluehouse",
        name: "블루하우스 YES/NO Feed",
        company: "청정데이터랩",
        contact: "biz@bluehouselab.kr",
        status: "active",
        resellerId: "res_b",
        templateId: "tpl_kr_politics_yesno",
        marketType: "yes-no",
        accessTier: "growth",
        planName: "Politics Growth",
        monthlyFee: 430000,
        setupFee: 900000,
        lossRevenue30d: 7200000,
        allowedMarkets: ["politics", "cabinet", "approval"],
        customizable: false,
        notes: "질문/배당/정산 API만 사용. 웹 프론트는 자체 구축.",
        contractStartedAt: daysAgo(26),
        contractEndsAt: daysFromNow(34),
        createdAt: daysAgo(26),
      },
      {
        id: "cli_localvote",
        name: "로컬선거 스튜디오",
        company: "메트로리서치",
        contact: "sale@metroresearch.kr",
        status: "trial",
        resellerId: "res_a",
        templateId: "tpl_local_issue_custom",
        marketType: "yes-no",
        accessTier: "starter",
        planName: "Custom Trial",
        monthlyFee: 250000,
        setupFee: 1200000,
        lossRevenue30d: 2100000,
        allowedMarkets: ["local", "referendum"],
        customizable: true,
        notes: "홈페이지 디자인 변경 주문 대기.",
        contractStartedAt: daysAgo(6),
        contractEndsAt: daysFromNow(21),
        createdAt: daysAgo(6),
      },
    ],
    apiKeys: [
      {
        id: "key_hanriver_live",
        clientId: "cli_hanriver",
        label: "Production Feed",
        keyPreview: "pw_live_hanr••••d9x2",
        secretHash: "seed-hanriver",
        scopes: ["markets:read", "odds:read", "settlement:read"],
        allowedOrigins: ["https://hanriver.kr"],
        allowedIps: [],
        rateLimitPerMinute: 600,
        status: "active",
        issuedAt: daysAgo(45),
        expiresAt: daysFromNow(112),
        lastUsedAt: daysAgo(0),
      },
      {
        id: "key_bluehouse_prod",
        clientId: "cli_bluehouse",
        label: "Main API Key",
        keyPreview: "pw_live_blue••••m1q9",
        secretHash: "seed-bluehouse",
        scopes: ["markets:read", "odds:read"],
        allowedOrigins: ["https://api.bluehouse.kr"],
        allowedIps: ["211.45.11.22"],
        rateLimitPerMinute: 240,
        status: "active",
        issuedAt: daysAgo(20),
        expiresAt: daysFromNow(34),
        lastUsedAt: daysAgo(1),
      },
      {
        id: "key_localvote_trial",
        clientId: "cli_localvote",
        label: "Trial Sandbox",
        keyPreview: "pw_test_loca••••v6p1",
        secretHash: "seed-localvote",
        scopes: ["markets:read"],
        allowedOrigins: ["https://sandbox.metroresearch.kr"],
        allowedIps: [],
        rateLimitPerMinute: 90,
        status: "active",
        issuedAt: daysAgo(5),
        expiresAt: daysFromNow(21),
        lastUsedAt: daysAgo(0),
      },
    ],
    resellers: [
      {
        id: "res_master",
        parentId: null,
        slot: "root",
        name: "마스터",
        code: "MASTER",
        contact: "owner@polywatch.kr",
        shareOfParentPercent: 100,
        status: "active",
        createdAt: daysAgo(120),
      },
      {
        id: "res_a",
        parentId: "res_master",
        slot: "left",
        name: "총판 A",
        code: "A",
        contact: "a@partner.kr",
        shareOfParentPercent: 20,
        status: "active",
        createdAt: daysAgo(84),
      },
      {
        id: "res_b",
        parentId: "res_master",
        slot: "right",
        name: "총판 B",
        code: "B",
        contact: "b@partner.kr",
        shareOfParentPercent: 30,
        status: "active",
        createdAt: daysAgo(70),
      },
      {
        id: "res_a1",
        parentId: "res_a",
        slot: "left",
        name: "총판 A-1",
        code: "A-1",
        contact: "a1@partner.kr",
        shareOfParentPercent: 50,
        status: "active",
        createdAt: daysAgo(52),
      },
      {
        id: "res_a2",
        parentId: "res_a",
        slot: "right",
        name: "총판 A-2",
        code: "A-2",
        contact: "a2@partner.kr",
        shareOfParentPercent: 30,
        status: "active",
        createdAt: daysAgo(39),
      },
    ],
  };
}

export function normalizeAdminBusinessState(input: unknown): AdminBusinessState {
  const value = (input && typeof input === "object") ? (input as Partial<AdminBusinessState>) : {};
  const defaults = createDefaultAdminBusinessState();

  return {
    templates: Array.isArray(value.templates) ? value.templates as ApiBusinessTemplateRecord[] : defaults.templates,
    clients: Array.isArray(value.clients) ? value.clients as ApiBusinessClientRecord[] : defaults.clients,
    apiKeys: Array.isArray(value.apiKeys) ? value.apiKeys as ApiBusinessKeyRecord[] : defaults.apiKeys,
    resellers: Array.isArray(value.resellers) ? value.resellers as ApiBusinessResellerRecord[] : defaults.resellers,
  };
}
