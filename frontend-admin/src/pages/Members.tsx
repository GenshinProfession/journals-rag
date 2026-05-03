import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Input, Modal, Popconfirm, Space, Table, Tooltip, message
} from 'antd';
import { PlusOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = { id: string; username: string; nickname: string | null; role: string; is_active: boolean };

export function Members() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });

  const admins = (data ?? []).filter(u => u.role === 'admin');

  const createMut = useMutation({
    mutationFn: (body: { username: string; password: string; nickname?: string }) =>
      apiFetch('/api/admin/users/admin', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      message.success('管理员已创建');
      setCreateOpen(false);
      setUsername('');
      setPassword('');
      setNickname('');
    },
    onError: (e: Error) => message.error(e.message)
  });

  const updateMut = useMutation({
    mutationFn: (body: { id: string; is_active?: boolean; password?: string }) => {
      const { id, ...payload } = body;
      return apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); message.success('已更新'); },
    onError: (e: Error) => message.error(e.message)
  });

  const resetPassword = (user: UserRow) => {
    const pwd = window.prompt(`为 ${user.username} 设置新密码（至少 6 位）`);
    if (!pwd) return;
    updateMut.mutate({ id: user.id, password: pwd });
  };

  const handleCreate = () => {
    const u = username.trim();
    if (!u || password.length < 6) { message.warning('用户名不能为空，密码至少 6 位'); return; }
    createMut.mutate({ username: u, password, nickname: nickname.trim() || undefined });
  };

  const columns: ColumnsType<UserRow> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true },
    { title: '昵称', dataIndex: 'nickname', ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '状态', dataIndex: 'is_active', width: 80, align: 'center',
      render: (v: boolean) => v ? <Badge status="success" text="启用" /> : <Badge status="error" text="停用" />
    },
    {
      title: '操作', key: 'actions', width: 120, align: 'center',
      render: (_: unknown, u: UserRow) => (
        <Space size={4}>
          <Tooltip title="重置密码"><Button size="small" type="text" icon={<KeyOutlined />} onClick={() => resetPassword(u)} /></Tooltip>
          <Popconfirm title={`确认${u.is_active ? '停用' : '启用'}？`} onConfirm={() => updateMut.mutate({ id: u.id, is_active: !u.is_active })}>
            <Tooltip title={u.is_active ? '停用' : '启用'}>
              <Button size="small" type="text" icon={u.is_active ? <StopOutlined style={{ color: '#f9ab00' }} /> : <CheckCircleOutlined style={{ color: '#34a853' }} />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const Label = ({ text, required, children }: { text: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: '#202124', fontWeight: 500 }}>
        {text}{required && <span style={{ color: '#d93025', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>成员管理</h2>
          <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
            管理后台管理员账号。代写账号请在「代写账号」页面管理。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setUsername(''); setPassword(''); setNickname(''); setCreateOpen(true); }}>
          新增管理员
        </Button>
      </div>

      <Table<UserRow>
        rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={admins}
        pagination={false} style={{ borderRadius: 8 }}
      />

      <Modal
        title="新增管理员"
        open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)}
        okText="创建" cancelText="取消" confirmLoading={createMut.isPending}
        width={420} destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
          <Label text="用户名" required>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="登录用户名" autoComplete="off" />
          </Label>
          <Label text="密码" required>
            <Input.Password value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
          </Label>
          <Label text="昵称">
            <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="可选" />
          </Label>
        </div>
      </Modal>
    </div>
  );
}
