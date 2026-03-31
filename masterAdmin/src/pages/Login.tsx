import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, API_BASE, marketPath } from '../api';
import { brandLogoUrl } from '../branding';

export function Login() {
  const { authed, login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const logo = brandLogoUrl();

  if (authed) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const j = await api<{ accessToken: string; role: string }>(marketPath('/auth/login'), {
        method: 'POST',
        json: { login_id: loginId, password },
      });
      if (j.role !== 'master') {
        setErr('Master 계정만 이 콘솔에 로그인할 수 있습니다.');
        return;
      }
      login(j.accessToken);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로그인 실패');
    }
  }

  return (
    <div className="login-box">
      <div className="login-wrap">
        <div className="login-card">
          {logo ? (
            <img src={logo} alt="" className="brand-logo" width={220} height={64} style={{ marginBottom: 8 }} />
          ) : null}
          <h1 className="login-title">총마켓 Master</h1>
          <p className="login-sub">
            nexus-market-api · <code style={{ color: 'var(--ac)' }}>MASTER_ID</code> /{' '}
            <code style={{ color: 'var(--ac)' }}>MASTER_PW</code>
            <br />
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              POST{' '}
              <code>
                {API_BASE}
                {marketPath('/auth/login')}
              </code>
            </span>
          </p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="ma-login-id">login_id</label>
              <input
                id="ma-login-id"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="ma-login-pw">password</label>
              <input
                id="ma-login-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {err ? <p className="err">{err}</p> : null}
            <button type="submit" className="btn" style={{ width: '100%', marginTop: 8 }}>
              로그인
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
