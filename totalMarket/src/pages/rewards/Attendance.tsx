import { useEffect, useState } from 'react';
import { api, marketPath } from '../../api';

export function AttendancePage() {
  const [att, setAtt] = useState<{
    kstDate: string;
    checkedToday: boolean;
    lastStreak: number;
  } | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    setErr('');
    try {
      const a = await api<{
        kstDate: string;
        checkedToday: boolean;
        lastStreak: number;
      }>(marketPath('/user/attendance/status'));
      setAtt(a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doAttendance() {
    setMsg('');
    try {
      const j = await api<{ ok: boolean; pointsEarned: number; streakCount: number; kstDate: string }>(
        marketPath('/user/attendance'),
        { method: 'POST' },
      );
      setMsg(`출석 완료 (+${j.pointsEarned}P, 연속 ${j.streakCount}일, KST ${j.kstDate})`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '출석 실패');
    }
  }

  return (
    <>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}
      <div className="page-card">
        <h2>출석 (1일 1회 · KST 자정 기준)</h2>
        {att ? (
          <>
            <p>
              오늘(KST {att.kstDate}): {att.checkedToday ? '출석 완료' : '미출석'} · 직전 연속 {att.lastStreak}일
            </p>
            <button type="button" className="btn" disabled={att.checkedToday} onClick={doAttendance}>
              {att.checkedToday ? '오늘 출석함' : '출석 체크'}
            </button>
          </>
        ) : (
          <p>…</p>
        )}
      </div>
    </>
  );
}
