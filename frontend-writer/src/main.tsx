import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, Button, Space } from 'antd';
import zhCN from 'antd/locale/zh_CN';
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
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#5f6368' }}>加载中…</span>
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

  if (!user) return null;
  return children;
}

function Layout() {
  const nav = useNavigate();
  const location = useLocation();
  const { user, logout, openLoginModal } = useWriterAuth();
  const wizardActive = location.pathname.startsWith('/wizard');

  return (
    <div style={{ minHeight: '100dvh', background: '#fff' }}>
      {/* Top nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 56,
        borderBottom: '1px solid #e8eaed', background: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#202124' }}>ThesisLoom</span>
          <span style={{ fontSize: 11, color: '#9aa0a6', fontWeight: 500 }}>WRITER</span>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {user ? (
            <Space size={4}>
              <NavLink to="/" end style={({ isActive }) => ({
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, textDecoration: 'none',
                color: isActive ? '#1a73e8' : '#5f6368',
                background: isActive ? 'rgba(26,115,232,0.08)' : 'transparent',
              })}>项目</NavLink>
              <NavLink to="/wizard" style={() => ({
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, textDecoration: 'none',
                color: wizardActive ? '#1a73e8' : '#5f6368',
                background: wizardActive ? 'rgba(26,115,232,0.08)' : 'transparent',
              })}>论文向导</NavLink>
              <NavLink to="/wallet" style={({ isActive }) => ({
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, textDecoration: 'none',
                color: isActive ? '#1a73e8' : '#5f6368',
                background: isActive ? 'rgba(26,115,232,0.08)' : 'transparent',
              })}>余额</NavLink>
              <Button size="small" type="text" style={{ color: '#5f6368', marginLeft: 8 }} onClick={() => { logout(); nav('/'); }}>
                退出
              </Button>
            </Space>
          ) : (
            <Button type="primary" size="small" onClick={() => openLoginModal()}>登录</Button>
          )}
        </nav>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
        <Routes>
          <Route path="/" element={user ? <Projects /> : <Landing />} />
          <Route path="/wizard" element={<RequireWriter><Wizard /></RequireWriter>} />
          <Route path="/wizard/:projectId" element={<RequireWriter><Wizard /></RequireWriter>} />
          <Route path="/wallet" element={<RequireWriter><Wallet /></RequireWriter>} />
        </Routes>
      </main>
      <LoginModal />
    </div>
  );
}

function AppRoutes() {
  return <Routes><Route path="*" element={<Layout />} /></Routes>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1a73e8',
          borderRadius: 4,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
          fontSize: 14,
          colorBorder: '#dadce0',
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <WriterAuthProvider>
            <SessionBoot>
              <AppRoutes />
            </SessionBoot>
          </WriterAuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>
);
