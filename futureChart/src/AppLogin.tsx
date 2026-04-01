import { useCallback, useState, type FormEvent } from 'react';
import { resolveLogin } from './admin/demoAuthRegistry';
import type { AdminSession } from './admin/types';
import { MODULE_CODE, MODULE_NAME } from './config/moduleContext';
import { getEffectiveHtsModuleSlug, getHtsModuleSlug, isMarketHtsGateEnabled } from './config/htsModuleEnv';
import { loginViaMarketApi } from './marketAuthLogin';
import { marketPublicRegister } from './marketPublicRegister';

type Props = {
  onSuccess: (session: AdminSession) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
};

/** macroServer public/admin.html #loginBox 와 동일 구조 (지갑/시드·시드지급 없음) */
export function AppLogin({ onSuccess, theme, onToggleTheme }: Props) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setErr(null);

      if (isMarketHtsGateEnabled()) {
        setLoading(true);
        try {
          if (mode === 'signup') {
            const reg = await marketPublicRegister(id, pw, referralCode);
            if (!reg.ok) {
              setErr(reg.error);
              return;
            }
            if (reg.pendingApproval) {
              setErr(null);
              window.alert(reg.message);
              setMode('login');
              setPw('');
              return;
            }
            setErr('가입이 즉시 승인되었습니다. 로그인해 주세요.');
            setMode('login');
            setPw('');
            return;
          }
          const r = await loginViaMarketApi(id, pw);
          if ('session' in r) {
            onSuccess(r.session);
            return;
          }
          const demo = resolveLogin(id, pw);
          if (demo) {
            onSuccess({ ...demo, authSource: 'demo' });
            return;
          }
          setErr(r.error);
        } finally {
          setLoading(false);
        }
        return;
      }

      const session = resolveLogin(id, pw);
      if (!session) {
        setErr('아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      onSuccess({ ...session, authSource: 'demo' });
    },
    [id, pw, referralCode, mode, onSuccess],
  );

  return (
    <div id="loginBox">
      <div className="login-wrap">
        <div className="login-card pandora-login">
          <img src="/logo.svg" alt="Pandora" className="brand-logo" width={300} height={72} />
          <div className="login-title">Pandora</div>
          <div className="login-sub">
            {MODULE_NAME} — 관리자 로그인 <span style={{ opacity: 0.75 }}>({MODULE_CODE})</span>
          </div>
          <form id="adminLoginForm" onSubmit={submit} autoComplete="off">
            {isMarketHtsGateEnabled() ? (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ marginRight: 8 }}
                  onClick={() => {
                    setMode('login');
                    setErr(null);
                  }}
                >
                  로그인
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setMode('signup');
                    setErr(null);
                  }}
                >
                  회원가입
                </button>
              </div>
            ) : null}
            <div className="form-group">
              <label htmlFor="fc-app-login-id">아이디</label>
              <input
                id="fc-app-login-id"
                type="text"
                name="pandora_admin_uid_field"
                placeholder="아이디"
                required
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="fc-app-login-pw">비밀번호</label>
              <input
                id="fc-app-login-pw"
                type="password"
                name="pandora_admin_pw_field"
                placeholder="비밀번호"
                required
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            {isMarketHtsGateEnabled() && mode === 'signup' ? (
              <div className="form-group">
                <label htmlFor="fc-app-referral">레퍼럴 코드 (필수)</label>
                <input
                  id="fc-app-referral"
                  type="text"
                  placeholder="총판에서 받은 코드 또는 총판 로그인 ID"
                  required
                  autoComplete="off"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                />
              </div>
            ) : null}
            <button type="submit" className="btn-ac" disabled={loading}>
              {loading ? '확인 중…' : mode === 'signup' ? '가입 신청' : '로그인'}
            </button>
            {err ? <p className="login-error">{err}</p> : null}
          </form>
          <p className="login-hint">
            {isMarketHtsGateEnabled() ? (
              <>
                마켓 API — HTS 모듈 <code>{getEffectiveHtsModuleSlug()}</code>
                {getHtsModuleSlug() ? '' : ' (기본값)'} · 공개 가입은 <strong>레퍼럴 코드 필수</strong>, 총판 승인 후
                로그인됩니다. 마켓 실패 시 데모 계정 폴백. ({MODULE_CODE})
              </>
            ) : (
              <>
                데모: <strong>master</strong> / <strong>d001</strong> / <strong>u001</strong> — 비밀번호{' '}
                <strong>demo</strong>
              </>
            )}
          </p>
          <div className="login-actions">
            <button type="button" className="btn-ghost" onClick={onToggleTheme}>
              테마: {theme === 'dark' ? '라이트로' : '다크로'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
