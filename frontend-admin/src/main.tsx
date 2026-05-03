import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { authMe, clearToken, getToken } from './api/client';
import { Billing } from './pages/Billing';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { PRODUCT_NAME, ADMIN_CONSOLE_TAGLINE } from './brand';
import { Models } from './pages/Models';
import { Schools } from './pages/Schools';
import { Users } from './pages/Users';
import './styles.css';

const queryClient = new QueryClient();

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (!getToken()) {
        nav('/login', { replace: true });
        return;
      }
      try {
        const me = await authMe();
        if (!cancelled && me.role !== 'admin') {
          clearToken();
          nav('/login', { replace: true });
          return;
        }
        if (!cancelled) {
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          clearToken();
          nav('/login', { replace: true });
        }
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [nav]);

  if (!ready) {
    return (
      <div className="session-gate">
        <div className="session-gate__card">
          <div className="spinner" aria-hidden />
          <span className="muted">校验会话…</span>
        </div>
      </div>
    );
  }
  return children;
}

function Layout() {
  const nav = useNavigate();
  function logout() {
    clearToken();
    nav('/login', { replace: true });
  }

  return (
    <div className="shell">
      <div className="shell__bg" aria-hidden />
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1 className="sidebar__title">{PRODUCT_NAME}</h1>
          <span className="sidebar__badge">{ADMIN_CONSOLE_TAGLINE}</span>
        </div>
        <nav className="sidebar__nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            <span className="sidebar__link-dot" aria-hidden />
            概览
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            <span className="sidebar__link-dot" aria-hidden />
            代写账号
          </NavLink>
          <NavLink to="/billing" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            <span className="sidebar__link-dot" aria-hidden />
            充值计费
          </NavLink>
          <NavLink to="/models" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            <span className="sidebar__link-dot" aria-hidden />
            模型目录
          </NavLink>
          <NavLink to="/schools" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}>
            <span className="sidebar__link-dot" aria-hidden />
            学校模板
          </NavLink>
        </nav>
        <div className="sidebar__footer">
          <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="main-area">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/models" element={<Models />} />
          <Route path="/schools" element={<Schools />} />
        </Routes>
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="*"
        element={
          <RequireAdmin>
            <Layout />
          </RequireAdmin>
        }
      />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1a73e8',
          colorLink: '#1a73e8',
          borderRadius: 4,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 14,
          colorBgContainer: '#fff',
          colorBorder: '#dadce0',
          colorBorderSecondary: '#e8eaed',
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>
);
