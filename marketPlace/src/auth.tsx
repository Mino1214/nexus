import { createContext, useContext, useState, type ReactNode } from 'react';
import { getToken, setToken, getStoredRole, setStoredRole } from './api';

type AuthCtx = {
  authed: boolean;
  role: string | null;
  login: (access: string, role: string) => void;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

function isUserSession(): boolean {
  return !!getToken() && getStoredRole() === 'user';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(isUserSession);
  const [role, setRole] = useState<string | null>(() => getStoredRole());

  const login = (access: string, r: string) => {
    setToken(access);
    setStoredRole(r);
    setRole(r);
    setAuthed(r === 'user' && !!access);
  };

  const logout = () => {
    setToken(null);
    setStoredRole(null);
    setRole(null);
    setAuthed(false);
  };

  return <Ctx.Provider value={{ authed, role, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const x = useContext(Ctx);
  if (!x) throw new Error('useAuth');
  return x;
}
