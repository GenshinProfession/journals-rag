import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Modal } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { login } from '../api/client';
import { useWriterAuth } from '../auth/WriterAuthContext';

export function LoginModal() {
  const nav = useNavigate();
  const { loginModalOpen, setLoginModalOpen, loginNextPath, clearLoginNextPath, refresh } = useWriterAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dismiss = useCallback(() => {
    setLoginModalOpen(false);
    setError(null);
    clearLoginNextPath();
  }, [setLoginModalOpen, clearLoginNextPath]);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      await refresh();
      const next = loginNextPath;
      clearLoginNextPath();
      setLoginModalOpen(false);
      setUsername('');
      setPassword('');
      if (next && next !== '/') nav(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="登录"
      open={loginModalOpen}
      onCancel={dismiss}
      footer={null}
      width={400}
      destroyOnClose
    >
      <p style={{ fontSize: 13, color: '#5f6368', marginBottom: 20 }}>
        使用管理员为您开通的写作者账号进入工作台。
      </p>
      <Form layout="vertical" onFinish={onSubmit}>
        <Form.Item label="用户名" rules={[{ required: true }]}>
          <Input
            prefix={<UserOutlined style={{ color: '#9aa0a6' }} />}
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </Form.Item>
        <Form.Item label="密码" rules={[{ required: true }]}>
          <Input.Password
            prefix={<LockOutlined style={{ color: '#9aa0a6' }} />}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Form.Item>
        {error && <div style={{ color: '#d93025', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={dismiss} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>登录</Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
