import { useCallback, useState, type FormEvent } from 'react';
import { resolveLogin } from './admin/demoAuthRegistry';
import type { AdminSession } from './admin/types';
import { MODULE_CODE, MODULE_NAME } from './config/moduleContext';
import { getEffectiveHtsModuleSlug, getHtsModuleSlug, isMarketHtsGateEnabled } from './config/htsModuleEnv';
import { loginViaMarketApi } from './marketAuthLogin';

type Props = {
  onSuccess: (session: AdminSession) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
};

/** macroServer public/admin.html #loginBox 와 동일 구조 (지갑/시드·시드지급 없음) */
export function AppLogin({ onSuccess, theme, onToggleTheme }: Props) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setErr(null);

      if (isMarketHtsGateEnabled()) {
        setLoading(true);
        try {
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
    [id, pw, onSuccess],
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
            <button type="submit" className="btn-ac" disabled={loading}>
              {loading ? '확인 중…' : '로그인'}
            </button>
            {err ? <p className="login-error">{err}</p> : null}
          </form>
          <p className="login-hint">
            {isMarketHtsGateEnabled() ? (
              <>
                마켓 API 로그인 — HTS 모듈 <code>{getEffectiveHtsModuleSlug()}</code>
                {getHtsModuleSlug() ? '' : ' (기본값, VITE_HTS_MODULE_SLUG 로 변경 가능)'} · 마켓 실패 시 데모 계정은
                폴백됩니다. (표시 모듈 코드 {MODULE_CODE})
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
