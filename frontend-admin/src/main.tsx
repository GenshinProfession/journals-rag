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
import { Members } from './pages/Members';
import { PRODUCT_NAME, ADMIN_CONSOLE_TAGLINE } from './brand';
import { Models } from './pages/Models';
import { Schools } from './pages/Schools';
import { TemplateEditor } from './pages/TemplateEditor';
import { Usage } from './pages/Usage';
import { Universities } from './pages/Universities';
import { Users } from './pages/Users';
import './styles.css';

const queryClient = new QueryClient();

const ADMIN_ROLES = ['super_admin', 'org_admin', 'admin'];

// Shared state for allowed menus (set during auth, read by Layout)
let _allowedMenus: string[] = [];
let _currentRole: string = '';

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
        if (!cancelled && !ADMIN_ROLES.includes(me.role)) {
          clearToken();
          nav('/login', { replace: true });
          return;
        }
        if (!cancelled) {
          _allowedMenus = me.allowed_menus ?? [];
          _currentRole = me.role;
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

const ALL_MENU_ITEMS: { key: string; path: string; label: string; end?: boolean }[] = [
  { key: 'dashboard',    path: '/',              label: '概览',     end: true },
  { key: 'orgs',         path: '/orgs',          label: '机构授权' },
  { key: 'writers',      path: '/writers',       label: '代写管理' },
  { key: 'billing',      path: '/billing',       label: '计费流水' },
  { key: 'usage',        path: '/usage',         label: 'AI 调用' },
  { key: 'models',       path: '/models',        label: '模型目录' },
  { key: 'schools',      path: '/schools',       label: '学校模板' },
  { key: 'universities', path: '/universities',  label: '高校目录' },
];

function Layout() {
  const nav = useNavigate();
  function logout() {
    clearToken();
    _allowedMenus = [];
    _currentRole = '';
    nav('/login', { replace: true });
  }

  const visibleMenus = ALL_MENU_ITEMS.filter(m => _allowedMenus.includes(m.key));

  return (
    <div className="shell">
      <div className="shell__bg" aria-hidden />
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1 className="sidebar__title">{PRODUCT_NAME}</h1>
          <span className="sidebar__badge">{ADMIN_CONSOLE_TAGLINE}</span>
        </div>
        <nav className="sidebar__nav">
          {visibleMenus.map(m => (
            <NavLink
              key={m.key}
              to={m.path}
              end={m.end}
              className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
            >
              <span className="sidebar__link-dot" aria-hidden />
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <span className="sidebar__role-badge">{_currentRole === 'super_admin' || _currentRole === 'admin' ? '超级管理员' : '机构管理员'}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="main-area">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orgs" element={<Members />} />
          <Route path="/writers" element={<Users />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/models" element={<Models />} />
          <Route path="/schools" element={<Schools />} />
          <Route path="/schools/edit/:groupId" element={<TemplateEditor />} />
          <Route path="/universities" element={<Universities />} />
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
