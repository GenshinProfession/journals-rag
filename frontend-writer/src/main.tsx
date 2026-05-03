import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { authMe, clearToken, getToken } from './api/client';
import { Login } from './pages/Login';
import { Projects } from './pages/Projects';
import { Wallet } from './pages/Wallet';
import { Wizard } from './pages/Wizard';
import './styles.css';

const queryClient = new QueryClient();

function RequireWriter({ children }: { children: React.ReactElement }) {
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
        if (!cancelled && me.role !== 'writer') {
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
    <div className="page">
      <header>
        <strong>Journals RAG</strong>
        <nav>
          <Link to="/">项目</Link>
          <Link to="/wizard">论文向导</Link>
          <Link to="/wallet">余额</Link>
          <button type="button" onClick={logout} style={{ marginLeft: 12 }}>
            退出
          </button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/wizard" element={<Wizard />} />
        <Route path="/wizard/:projectId" element={<Wizard />} />
        <Route path="/wallet" element={<Wallet />} />
      </Routes>
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
          <RequireWriter>
            <Layout />
          </RequireWriter>
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
