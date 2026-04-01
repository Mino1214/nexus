import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { isMasterAdminSyncEnabled } from '../config/featureFlags';
import { pushDistributorSettings } from './htsMasterClient';
import { ManagedPieChart } from './ManagedPieChart';
import type { BettingTrendSlice, DistributorHtsConfig } from './types';

type Sub = 'incentive' | 'telegramInquiry' | 'telegramBot' | 'userPolicy' | 'betting';

type Props = {
  distributors: readonly { id: string; name: string }[];
  configs: DistributorHtsConfig[];
  setConfigs: Dispatch<SetStateAction<DistributorHtsConfig[]>>;
  onSyncNotice: (msg: string | null) => void;
};

const SUB_TABS: { id: Sub; label: string }[] = [
  { id: 'incentive', label: '인센티브' },
  { id: 'telegramInquiry', label: '텔레그램 문의' },
  { id: 'telegramBot', label: '텔레그램 봇' },
  { id: 'userPolicy', label: '이용자 설정' },
  { id: 'betting', label: '배팅 추이' },
];

export function DistributorManagementPanel({ distributors, configs, setConfigs, onSyncNotice }: Props) {
  const [distId, setDistId] = useState(distributors[0]?.id ?? '');
  const [sub, setSub] = useState<Sub>('incentive');
  const [saving, setSaving] = useState(false);

  const cfg = useMemo(() => configs.find((c) => c.distributorId === distId), [configs, distId]);

  const patch = useCallback(
    (partial: Partial<DistributorHtsConfig>) => {
      setConfigs((prev) => prev.map((c) => (c.distributorId === distId ? { ...c, ...partial } : c)));
    },
    [distId, setConfigs],
  );

  const updateTrend = useCallback(
    (next: BettingTrendSlice[]) => {
      patch({ bettingTrend: next });
    },
    [patch],
  );

  const save = useCallback(async () => {
    const c = configs.find((x) => x.distributorId === distId);
    if (!c) return;
    onSyncNotice(null);
    setSaving(true);
    try {
      const r = await pushDistributorSettings(c);
      if (r.ok) {
        onSyncNotice(
          isMasterAdminSyncEnabled()
            ? '저장되었습니다. (연동 API 호출 완료 — 서버가 없으면 404일 수 있음)'
            : '로컬에 저장되었습니다.',
        );
      } else {
        onSyncNotice(`연동 실패 — 로컬만 반영: ${r.message}`);
      }
    } finally {
      setSaving(false);
    }
  }, [configs, distId, onSyncNotice]);

  if (!cfg) {
    return <p className="fc-admin__hint">총판 데이터가 없습니다.</p>;
  }

  return (
    <div className="fc-admin__masterGrid">
      <section className="fc-admin__card">
        <h2 className="fc-admin__cardTitle">총판 관리</h2>
        <p className="fc-admin__cardDesc">
          masterAdmin에서 HTS 모듈을 구매한 테넌트(마스터)가 총판 단위로 인센티브·텔레그램·정책을 설정하는 화면입니다.{' '}
          <strong>VITE_FC_MASTERADMIN_SYNC=true</strong>일 때 저장 시 API 스텁이 호출됩니다.
        </p>
        <div className="fc-admin__field fc-admin__field--inline">
          <label htmlFor="fc-master-dist-pick">총판 선택</label>
          <select id="fc-master-dist-pick" value={distId} onChange={(e) => setDistId(e.target.value)}>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.id})
              </option>
            ))}
          </select>
        </div>
        <div className="fc-admin__subNav" role="tablist" aria-label="총판 설정 구분">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={sub === t.id}
              className={`fc-admin__subNavBtn${sub === t.id ? ' fc-admin__subNavBtn--active' : ''}`}
              onClick={() => setSub(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {sub === 'incentive' ? (
        <section className="fc-admin__card">
          <h2 className="fc-admin__cardTitle">총판 인센티브</h2>
          <p className="fc-admin__cardDesc">정산 비율(%) — 실제는 masterAdmin 정산 모듈과 동일 규칙으로 맞추면 됩니다.</p>
          <div className="fc-admin__field">
            <label htmlFor="fc-inc-rate">인센티브 (%)</label>
            <input
              id="fc-inc-rate"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.incentiveRatePercent}
              onChange={(e) => patch({ incentiveRatePercent: Number(e.target.value) })}
            />
          </div>
          <button type="button" className="fc-admin__btnPrimary" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '설정 저장'}
          </button>
        </section>
      ) : null}

      {sub === 'telegramInquiry' ? (
        <section className="fc-admin__card">
          <h2 className="fc-admin__cardTitle">텔레그램 문의글</h2>
          <p className="fc-admin__cardDesc">HTS·랜딩 등에 노출되는 안내 문구입니다.</p>
          <div className="fc-admin__field">
            <label htmlFor="fc-tg-inquiry">문의 안내</label>
            <textarea
              id="fc-tg-inquiry"
              rows={5}
              value={cfg.telegramInquiryText}
              onChange={(e) => patch({ telegramInquiryText: e.target.value })}
            />
          </div>
          <button type="button" className="fc-admin__btnPrimary" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '설정 저장'}
          </button>
        </section>
      ) : null}

      {sub === 'telegramBot' ? (
        <section className="fc-admin__card">
          <h2 className="fc-admin__cardTitle">텔레그램 봇</h2>
          <p className="fc-admin__cardDesc">봇 토큰은 로컬·브라우저 저장소에 남을 수 있으니 운영 시 서버 저장만 사용하세요.</p>
          <div className="fc-admin__field">
            <label htmlFor="fc-tg-token">Bot token</label>
            <input
              id="fc-tg-token"
              autoComplete="off"
              value={cfg.telegramBotToken}
              onChange={(e) => patch({ telegramBotToken: e.target.value })}
              placeholder="123456:ABC..."
            />
          </div>
          <div className="fc-admin__field">
            <label htmlFor="fc-tg-chat">Chat ID</label>
            <input
              id="fc-tg-chat"
              value={cfg.telegramBotChatId}
              onChange={(e) => patch({ telegramBotChatId: e.target.value })}
              placeholder="-100..."
            />
          </div>
          <button type="button" className="fc-admin__btnPrimary" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '설정 저장'}
          </button>
        </section>
      ) : null}

      {sub === 'userPolicy' ? (
        <section className="fc-admin__card">
          <h2 className="fc-admin__cardTitle">이용자 설정</h2>
          <p className="fc-admin__cardDesc">총판 소속 유저 운영 정책 메모(내부 공유용).</p>
          <div className="fc-admin__field">
            <label htmlFor="fc-user-policy">정책 메모</label>
            <textarea
              id="fc-user-policy"
              rows={6}
              value={cfg.userPolicyNote}
              onChange={(e) => patch({ userPolicyNote: e.target.value })}
            />
          </div>
          <button type="button" className="fc-admin__btnPrimary" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '설정 저장'}
          </button>
        </section>
      ) : null}

      {sub === 'betting' ? (
        <section className="fc-admin__card">
          <h2 className="fc-admin__cardTitle">배팅 추이</h2>
          <p className="fc-admin__cardDesc">상품/채널별 거래 비중 데모입니다. 연동 시 masterAdmin 집계 API로 대체합니다.</p>
          <ManagedPieChart slices={cfg.bettingTrend} />
          <div className="fc-admin__tableWrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>비중</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cfg.bettingTrend.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={row.label}
                        onChange={(e) => {
                          const next = cfg.bettingTrend.map((r, j) =>
                            j === i ? { ...r, label: e.target.value } : r,
                          );
                          updateTrend(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={row.value}
                        onChange={(e) => {
                          const next = cfg.bettingTrend.map((r, j) =>
                            j === i ? { ...r, value: Number(e.target.value) } : r,
                          );
                          updateTrend(next);
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="fc-admin__btnSm fc-admin__btnSm--err"
                        onClick={() => updateTrend(cfg.bettingTrend.filter((_, j) => j !== i))}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="fc-admin__btnGhost"
            style={{ marginTop: '0.75rem' }}
            onClick={() => updateTrend([...cfg.bettingTrend, { label: '신규', value: 10 }])}
          >
            행 추가
          </button>
          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" className="fc-admin__btnPrimary" disabled={saving} onClick={save}>
              {saving ? '저장 중…' : '설정 저장'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
