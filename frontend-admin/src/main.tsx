import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { authMe, clearToken, getToken } from './api/client';
import { Billing } from './pages/Billing';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
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
    return <div style={{ padding: '2rem' }}>校验会话…</div>;
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
      <aside>
        <h1>Admin</h1>
        <Link to="/">概览</Link>
        <Link to="/users">代写账号</Link>
        <Link to="/billing">充值计费</Link>
        <Link to="/models">模型目录</Link>
        <Link to="/schools">学校模板</Link>
        <div style={{ marginTop: '1rem' }}>
          <button type="button" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <main>
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
