export type AdminRole = 'master' | 'distributor' | 'user';

export type AdminSession = {
  role: AdminRole;
  id: string;
  displayName: string;
  /** 유저·총판 소속 (마스터는 없음) */
  distributorId?: string;
  /** nexus-market-api 로그인 시 */
  authSource?: 'demo' | 'market';
  accessToken?: string;
  refreshToken?: string;
  marketRole?: 'master' | 'operator' | 'user';
  /** JWT / users.operator_mu_user_id — API 유저·테넌트 관리자 필터 */
  operatorMuUserId?: number | null;
  htsCustomerId?: number;
  htsModuleSlug?: string;
  /** 마스터·총판 로그인 시 마켓 API referral_code (Pandora admin 레퍼럴과 동일 UI) */
  referralCode?: string;
};

export type ChargeStatus = 'pending' | 'approved' | 'rejected';

export type ChargeRequest = {
  id: string;
  userId: string;
  userName: string;
  distributorId: string;
  distributorName: string;
  amount: number;
  status: ChargeStatus;
  createdAt: string;
  memo?: string;
};

export type PositionRow = {
  id: string;
  userId: string;
  userName: string;
  distributorId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  avgPrice: number;
  unrealizedPnl: number;
  updatedAt: string;
};

/** HTS 테넌트에서 관리하는 이용자 (마스터/총판) */
export type ManagedHtsUser = {
  id: string;
  displayName: string;
  distributorId: string;
  status: 'active' | 'suspended';
  createdAt: string;
  memo?: string;
};

export type BettingTrendSlice = {
  label: string;
  value: number;
};

/** 총판별 HTS 설정 (인센티브·텔레그램·정책·배팅 추이 데모) */
export type DistributorHtsConfig = {
  distributorId: string;
  /** 총판 정산 인센티브 (%) */
  incentiveRatePercent: number;
  /** 유저에게 노출되는 텔레그램 문의 안내 문구 */
  telegramInquiryText: string;
  /** 봇 토큰 (데모·로컬 저장 주의) */
  telegramBotToken: string;
  /** 알림 수신 chat id */
  telegramBotChatId: string;
  /** 이용자 운영 정책 메모 (내부용) */
  userPolicyNote: string;
  /** 배팅/거래량 비중 — 파이 차트 */
  bettingTrend: BettingTrendSlice[];
};
