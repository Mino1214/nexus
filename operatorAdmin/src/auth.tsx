import { createContext, useContext, useState, type ReactNode } from 'react';
import { getToken, setToken } from './api';

type AuthCtx = {
  authed: boolean;
  login: (access: string) => void;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !!getToken());
  const login = (access: string) => {
    setToken(access);
    setAuthed(true);
  };
  const logout = () => {
    setToken(null);
    setAuthed(false);
  };
  return <Ctx.Provider value={{ authed, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const x = useContext(Ctx);
  if (!x) throw new Error('useAuth');
  return x;
}
