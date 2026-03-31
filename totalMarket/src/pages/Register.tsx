import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, API_BASE, marketPath } from '../api';
import { brandLogoUrl } from '../branding';

const ID_RE = /^[a-z0-9][a-z0-9_-]{3,19}$/;
const PW_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_\-+=[\]{};:,.?]{8,24}$/;

export function Register() {
  const { authed, login } = useAuth();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [opId, setOpId] = useState('');
  const [err, setErr] = useState('');
  const logo = brandLogoUrl();

  if (authed) return <Navigate to="/rewards" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const nid = id.trim().toLowerCase();
    if (!ID_RE.test(nid)) {
      setErr('아이디는 소문자·숫자·_- 만, 4~20자, 첫 글자는 문자/숫자여야 합니다.');
      return;
    }
    if (!PW_RE.test(password)) {
      setErr('비밀번호는 8~24자, 영문과 숫자를 포함해야 합니다.');
      return;
    }
    try {
      const body: { id: string; password: string; operator_mu_user_id?: string } = {
        id: nid,
        password,
      };
      if (opId.trim()) body.operator_mu_user_id = opId.trim();
      const j = await api<{ accessToken: string; role: string }>(marketPath('/auth/register'), {
        method: 'POST',
        json: body,
      });
      if (j.role !== 'user') {
        setErr('예상치 못한 역할입니다.');
        return;
      }
      login(j.accessToken, j.role);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '가입 실패');
    }
  }

  return (
    <div className="login-box">
      <div className="login-wrap">
        <div className="login-card">
          {logo ? (
            <img src={logo} alt="" className="brand-logo" width={220} height={64} style={{ marginBottom: 8 }} />
          ) : null}
          <h1 className="login-title">회원가입</h1>
          <p className="login-sub">
            마켓 일반 회원
            <br />
            <span style={{ fontSize: 12 }}>API: {API_BASE}</span>
          </p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="mp-reg-id">아이디</label>
              <input
                id="mp-reg-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="mp-reg-pw">비밀번호</label>
              <input
                id="mp-reg-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="mp-reg-op">운영자 mu_users id (선택)</label>
              <input
                id="mp-reg-op"
                value={opId}
                onChange={(e) => setOpId(e.target.value)}
                placeholder="테넌트 연결 시"
              />
            </div>
            {err ? <p className="err">{err}</p> : null}
            <button type="submit" className="btn" style={{ width: '100%', marginTop: 8 }}>
              가입하기
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-tertiary)' }}>
            <Link to="/login" style={{ fontWeight: 700 }}>
              로그인
            </Link>
            으로 돌아가기
          </p>
        </div>
      </div>
    </div>
  );
}
