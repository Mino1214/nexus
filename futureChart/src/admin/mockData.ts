import type { AdminSession, ChargeRequest, DistributorHtsConfig, ManagedHtsUser, PositionRow } from './types';

export const MOCK_DISTRIBUTORS = [
  { id: 'd001', name: '총판 A' },
  { id: 'd002', name: '총판 B' },
] as const;

export const MOCK_USERS = [
  { id: 'u001', name: '유저 김', distributorId: 'd001' },
  { id: 'u002', name: '유저 이', distributorId: 'd001' },
  { id: 'u003', name: '유저 박', distributorId: 'd002' },
] as const;

export function initialManagedUsers(): ManagedHtsUser[] {
  return MOCK_USERS.map((u) => ({
    id: u.id,
    displayName: u.name,
    distributorId: u.distributorId,
    status: 'active' as const,
    createdAt: '2026-03-15',
  }));
}

export function initialDistributorConfigs(): DistributorHtsConfig[] {
  return [
    {
      distributorId: 'd001',
      incentiveRatePercent: 8.5,
      telegramInquiryText: '문의: @example_d001_bot 또는 텔레그램 검색 "총판A 지원"',
      telegramBotToken: '',
      telegramBotChatId: '-1001234567890',
      userPolicyNote: '일 최대 배팅 한도·충전 수수료는 마스터 정책을 따릅니다.',
      bettingTrend: [
        { label: '선물', value: 42 },
        { label: '현물', value: 28 },
        { label: '옵션', value: 18 },
        { label: '기타', value: 12 },
      ],
    },
    {
      distributorId: 'd002',
      incentiveRatePercent: 10,
      telegramInquiryText: '고객센터 운영 09:00–24:00 (총판 B)',
      telegramBotToken: '',
      telegramBotChatId: '',
      userPolicyNote: '신규 유저 7일간 수수료 할인.',
      bettingTrend: [
        { label: '선물', value: 55 },
        { label: '현물', value: 35 },
        { label: '기타', value: 10 },
      ],
    },
  ];
}

export const initialChargeRequests = (): ChargeRequest[] => {
  const d = (id: string) => MOCK_DISTRIBUTORS.find((x) => x.id === id)?.name ?? id;
  const u = (id: string) => MOCK_USERS.find((x) => x.id === id)?.name ?? id;
  return [
    {
      id: 'cr-1',
      userId: 'u001',
      userName: u('u001'),
      distributorId: 'd001',
      distributorName: d('d001'),
      amount: 500_000,
      status: 'pending',
      createdAt: '2026-04-01 10:12',
    },
    {
      id: 'cr-2',
      userId: 'u002',
      userName: u('u002'),
      distributorId: 'd001',
      distributorName: d('d001'),
      amount: 1_200_000,
      status: 'approved',
      createdAt: '2026-03-31 16:40',
    },
    {
      id: 'cr-3',
      userId: 'u003',
      userName: u('u003'),
      distributorId: 'd002',
      distributorName: d('d002'),
      amount: 300_000,
      status: 'pending',
      createdAt: '2026-04-01 09:05',
    },
  ];
};

export const initialPositions = (): PositionRow[] => {
  const u = (id: string) => MOCK_USERS.find((x) => x.id === id)!;
  return [
    {
      id: 'p-1',
      userId: 'u001',
      userName: u('u001').name,
      distributorId: 'd001',
      symbol: '101W09',
      side: 'LONG',
      qty: 2,
      avgPrice: 412.5,
      unrealizedPnl: 18_500,
      updatedAt: '2026-04-01 14:02',
    },
    {
      id: 'p-2',
      userId: 'u002',
      userName: u('u002').name,
      distributorId: 'd001',
      symbol: '005380',
      side: 'LONG',
      qty: 10,
      avgPrice: 198_500,
      unrealizedPnl: -42_000,
      updatedAt: '2026-04-01 14:01',
    },
    {
      id: 'p-3',
      userId: 'u003',
      userName: u('u003').name,
      distributorId: 'd002',
      symbol: 'CL=F',
      side: 'SHORT',
      qty: 1,
      avgPrice: 97.4,
      unrealizedPnl: 1_240,
      updatedAt: '2026-04-01 13:58',
    },
  ];
};

/** 데모 로그인 (실서버 연동 시 API로 교체) */
export const DEMO_ACCOUNTS: Record<string, { password: string; session: AdminSession }> = {
  master: {
    password: 'demo',
    session: { role: 'master', id: 'master', displayName: '마스터' },
  },
  d001: {
    password: 'demo',
    session: { role: 'distributor', id: 'd001', displayName: '총판 A', distributorId: 'd001' },
  },
  d002: {
    password: 'demo',
    session: { role: 'distributor', id: 'd002', displayName: '총판 B', distributorId: 'd002' },
  },
  u001: {
    password: 'demo',
    session: { role: 'user', id: 'u001', displayName: '유저 김', distributorId: 'd001' },
  },
  u002: {
    password: 'demo',
    session: { role: 'user', id: 'u002', displayName: '유저 이', distributorId: 'd001' },
  },
  u003: {
    password: 'demo',
    session: { role: 'user', id: 'u003', displayName: '유저 박', distributorId: 'd002' },
  },
};
