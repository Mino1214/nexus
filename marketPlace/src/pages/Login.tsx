import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
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
      if (j.role !== 'user') {
        setErr('일반 회원 계정만 로그인할 수 있습니다. (Master/운영자는 masterAdmin 등을 이용하세요)');
        return;
      }
      login(j.accessToken, j.role);
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
          <h1 className="login-title">마켓플레이스</h1>
          <p className="login-sub">
            마켓 회원 로그인
            <br />
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              API: <code>{API_BASE}</code>
            </span>
          </p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="mp-login-id">아이디</label>
              <input
                id="mp-login-id"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="mp-login-pw">비밀번호</label>
              <input
                id="mp-login-pw"
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
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-tertiary)' }}>
            계정이 없으면{' '}
            <Link to="/register" style={{ fontWeight: 700 }}>
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
