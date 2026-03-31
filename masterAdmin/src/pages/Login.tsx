import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, API_BASE, marketPath } from '../api';

export function Login() {
  const { authed, login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

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
    <div className="card" style={{ maxWidth: 400, margin: '48px auto' }}>
      <h1>Master 로그인</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        macroServer와 동일한 Master 계정(환경변수 MASTER_ID / MASTER_PW)을 사용합니다.
        <br />
        API: <code>{API_BASE}</code>
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>login_id</label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {err ? <p className="err">{err}</p> : null}
        <button type="submit" className="btn">
          로그인
        </button>
      </form>
    </div>
  );
}
