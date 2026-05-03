import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { WriterAuthProvider, useWriterAuth } from './auth/WriterAuthContext';
import { LoginModal } from './components/LoginModal';
import { Landing } from './pages/Landing';
import { Projects } from './pages/Projects';
import { Wallet } from './pages/Wallet';
import { Wizard } from './pages/Wizard';
import './styles.css';

const queryClient = new QueryClient();

function SessionBoot({ children }: { children: React.ReactElement }) {
  const { ready } = useWriterAuth();
  if (!ready) {
    return (
      <div className="session-gate">
        <div className="session-gate__card">
          <div className="spinner" aria-hidden />
          <span className="muted">加载中…</span>
        </div>
      </div>
    );
  }
  return children;
}

function RequireWriter({ children }: { children: React.ReactElement }) {
  const { user, openLoginModal } = useWriterAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!user) {
      openLoginModal({ nextPath: loc.pathname + loc.search });
      nav('/', { replace: true });
    }
  }, [user, openLoginModal, nav, loc.pathname, loc.search]);

  if (!user) {
    return null;
  }
  return children;
}

function Layout() {
  const nav = useNavigate();
  const location = useLocation();
  const { user, logout, openLoginModal } = useWriterAuth();
  const wizardActive = location.pathname.startsWith('/wizard');

  return (
    <div className="page">
      <div className="page-bg" aria-hidden />
      <header className="top-nav">
        <div className="top-nav__brand">
          <span className="top-nav__name">Journals RAG</span>
          <span className="top-nav__tag">Writer Studio</span>
        </div>
        <nav className="top-nav__links">
          {user ? (
            <>
              <NavLink
                to="/"
                end
                className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
              >
                项目
              </NavLink>
              <NavLink
                to="/wizard"
                className={() => `top-nav__link${wizardActive ? ' top-nav__link--active' : ''}`}
              >
                论文向导
              </NavLink>
              <NavLink
                to="/wallet"
                className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
              >
                余额
              </NavLink>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => logout()}>
                退出
              </button>
            </>
          ) : (
            <button type="button" className="top-nav__login" onClick={() => openLoginModal()}>
              登录
            </button>
          )}
        </nav>
      </header>
      <div className="page-body">
        <Routes>
          <Route path="/" element={user ? <Projects /> : <Landing />} />
          <Route
            path="/wizard"
            element={
              <RequireWriter>
                <Wizard />
              </RequireWriter>
            }
          />
          <Route
            path="/wizard/:projectId"
            element={
              <RequireWriter>
                <Wizard />
              </RequireWriter>
            }
          />
          <Route
            path="/wallet"
            element={
              <RequireWriter>
                <Wallet />
              </RequireWriter>
            }
          />
        </Routes>
      </div>
      <LoginModal />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<Layout />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <WriterAuthProvider>
          <SessionBoot>
            <AppRoutes />
          </SessionBoot>
        </WriterAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
