import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authMe, clearToken, getToken } from '../api/client';

export type WriterUser = { id: string; username: string; role: string };

type WriterAuthValue = {
  user: WriterUser | null;
  ready: boolean;
  loginModalOpen: boolean;
  setLoginModalOpen: (open: boolean) => void;
  openLoginModal: (options?: { nextPath?: string | null }) => void;
  loginNextPath: string | null;
  clearLoginNextPath: () => void;
  refresh: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<WriterAuthValue | null>(null);

export function WriterAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WriterUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginNextPath, setLoginNextPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const me = await authMe();
      if (me.role !== 'writer') {
        clearToken();
        setUser(null);
      } else {
        setUser(me);
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openLoginModal = useCallback((options?: { nextPath?: string | null }) => {
    if (options?.nextPath) {
      setLoginNextPath(options.nextPath);
    }
    setLoginModalOpen(true);
  }, []);

  const clearLoginNextPath = useCallback(() => setLoginNextPath(null), []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setLoginModalOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      loginModalOpen,
      setLoginModalOpen,
      openLoginModal,
      loginNextPath,
      clearLoginNextPath,
      refresh,
      logout
    }),
    [user, ready, loginModalOpen, openLoginModal, loginNextPath, clearLoginNextPath, refresh, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWriterAuth() {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useWriterAuth must be used within WriterAuthProvider');
  }
  return v;
}
