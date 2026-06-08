import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Avatar, Button, ConfigProvider, Input, Layout } from 'antd';
import { FileTextOutlined, HomeOutlined, PlusOutlined, ReadOutlined, WalletOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { WriterAuthProvider, useWriterAuth } from './auth/WriterAuthContext';
import { LoginModal } from './components/LoginModal';
import { Landing } from './pages/Landing';
import { Workspace } from './pages/Workspace';
import { NewProject } from './pages/NewProject';
import { Wallet } from './pages/Wallet';
import { Wizard } from './pages/Wizard';
import { Guide } from './pages/Guide';
import { TemplateSubmissions } from './pages/TemplateSubmissions';
import './styles.css';

const queryClient = new QueryClient();

const SIDEBAR_W = 232;

function LegacyWizardRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/work/${projectId}`} replace />;
}

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

function PublicShell() {
  const { openLoginModal } = useWriterAuth();
  return (
    <div style={{ minHeight: '100dvh', background: '#fff' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 56,
          borderBottom: '1px solid #e8eaed',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600, color: '#202124' }}>ThesisLoom</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <NavLink to="/guide" style={{ color: '#5f6368', textDecoration: 'none', fontSize: 14 }}>
            使用教程
          </NavLink>
          <Button type="primary" onClick={() => openLoginModal()}>
            登录
          </Button>
        </div>
      </header>
      <main style={{ padding: '24px' }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <LoginModal />
    </div>
  );
}

function WriterAppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const { user, logout } = useWriterAuth();

  const contentBg = location.pathname === '/work/new' ? '#fff' : '#f8f9fa';

  const navItem = (to: string, icon: React.ReactNode, label: string, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: 'none',
        color: isActive ? '#1a73e8' : '#3c4043',
        background: isActive ? 'rgba(26, 115, 232, 0.1)' : 'transparent',
      })}
    >
      {icon}
      {label}
    </NavLink>
  );

  return (
    <>
      <Layout style={{ minHeight: '100dvh', background: '#fff' }}>
      <Layout.Sider
        width={SIDEBAR_W}
        theme="light"
        style={{
          borderRight: '1px solid #e8eaed',
          background: '#fff',
          padding: '16px 12px 88px',
          position: 'relative',
        }}
      >
        <div style={{ padding: '8px 12px 20px', borderBottom: '1px solid #f1f3f4', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#202124', letterSpacing: '-0.02em' }}>ThesisLoom</div>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 2, fontWeight: 500 }}>WRITER 工作台</div>
        </div>

        <Button
          type="primary"
          block
          size="large"
          icon={<PlusOutlined />}
          onClick={() => nav('/work/new')}
          style={{ height: 44, fontWeight: 600, marginBottom: 20, borderRadius: 8 }}
        >
          创建论文项目
        </Button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItem('/', <HomeOutlined />, '工作台', true)}
          {navItem('/wallet', <WalletOutlined />, '余额')}
          {navItem('/template-submissions', <FileTextOutlined />, '模板贡献')}
          {navItem('/guide', <ReadOutlined />, '使用教程')}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 12,
            right: 12,
            paddingBottom: 16,
            background: '#fff',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 8px 0',
              borderTop: '1px solid #f1f3f4',
            }}
          >
            <Avatar style={{ background: '#1a73e8', flexShrink: 0 }} size="small">
              {(user?.username ?? '?').slice(0, 1).toUpperCase()}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.username}
              </div>
            </div>
            <Button type="link" size="small" style={{ padding: 0, flexShrink: 0 }} onClick={() => { logout(); nav('/'); }}>
              退出
            </Button>
          </div>
        </div>
      </Layout.Sider>

      <Layout>
        <Layout.Header
          style={{
            height: 56,
            padding: '0 28px',
            background: '#fff',
            borderBottom: '1px solid #e8eaed',
            display: 'flex',
            alignItems: 'center',
            lineHeight: '56px',
          }}
        >
          {location.pathname === '/' ? (
            <span style={{ color: '#9aa0a6', fontSize: 13 }}>在下方列表中搜索并打开论文项目</span>
          ) : (
            <span style={{ color: '#5f6368', fontSize: 14 }}>
              {location.pathname.startsWith('/work/') && location.pathname !== '/work/new' ? (
                <>论文写作流程</>
              ) : location.pathname === '/work/new' ? (
                <>新建论文项目</>
              ) : (
                <>ThesisLoom</>
              )}
            </span>
          )}
        </Layout.Header>

        <Layout.Content
          style={{
            flex: 1,
            overflow: 'auto',
            padding: location.pathname === '/work/new' ? 0 : '20px 28px 40px',
            background: contentBg,
          }}
        >
          <Routes>
            <Route path="/" element={<Workspace />} />
            <Route path="/work/new" element={<NewProject />} />
            <Route path="/work/:projectId" element={<Wizard />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/template-submissions" element={<TemplateSubmissions />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/wizard" element={<Navigate to="/" replace />} />
            <Route path="/wizard/:projectId" element={<LegacyWizardRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
    <LoginModal />
    </>
  );
}

function RootLayout() {
  const { user } = useWriterAuth();
  if (!user) {
    return <PublicShell />;
  }
  return <WriterAppShell />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1a73e8',
          borderRadius: 8,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
          fontSize: 14,
          colorBorder: '#dadce0',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <WriterAuthProvider>
            <SessionBoot>
              <RootLayout />
            </SessionBoot>
          </WriterAuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>
);
