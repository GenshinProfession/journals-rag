import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { PlusOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = { id: string; username: string; role: string; is_active: boolean };

export function Users() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });

  const createMut = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      message.success('已创建 writer');
      setCreateOpen(false);
      setUsername('');
      setPassword('');
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
    if (!u || !password) { message.warning('用户名和密码不能为空'); return; }
    createMut.mutate({ username: u, password });
  };

  const columns: ColumnsType<UserRow> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true },
    {
      title: '角色', dataIndex: 'role', width: 100, align: 'center',
      render: (role: string) => <Tag color={role === 'admin' ? 'blue' : 'default'} style={{ margin: 0 }}>{role}</Tag>
    },
    {
      title: '用户 ID', dataIndex: 'id', width: 320, ellipsis: true,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12 }} code>
          {id}
        </Typography.Text>
      )
    },
    {
      title: '状态', dataIndex: 'is_active', width: 80, align: 'center',
      render: (v: boolean) => v
        ? <Tag color="green" style={{ margin: 0 }}>启用</Tag>
        : <Tag color="red" style={{ margin: 0 }}>停用</Tag>
    },
    {
      title: '操作', key: 'actions', width: 140, align: 'center',
      render: (_: unknown, u: UserRow) =>
        u.role === 'writer' ? (
          <Space size={4}>
            <Popconfirm
              title={`确认${u.is_active ? '停用' : '启用'} ${u.username}？`}
              onConfirm={() => updateMut.mutate({ id: u.id, is_active: !u.is_active })}
            >
              <Tooltip title={u.is_active ? '停用' : '启用'}>
                <Button
                  size="small"
                  type="text"
                  icon={u.is_active ? <StopOutlined style={{ color: '#faad14' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  disabled={updateMut.isPending}
                />
              </Tooltip>
            </Popconfirm>
            <Tooltip title="重置密码">
              <Button size="small" type="text" icon={<KeyOutlined />} disabled={updateMut.isPending} onClick={() => resetPassword(u)} />
            </Tooltip>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>代写账号</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            创建 writer 账号时会自动建立空钱包，可在「充值计费」里人工加款。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setUsername(''); setPassword(''); setCreateOpen(true); }}>
          新建 writer
        </Button>
      </div>

      {error && <div className="alert alert--error" style={{ marginBottom: 12 }}>{(error as Error).message}</div>}

      <Table<UserRow>
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        pagination={false}
        style={{ borderRadius: 8 }}
      />

      <Modal
        title="新建 writer"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={createMut.isPending}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>用户名</div>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="登录用户名" autoComplete="off" />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>初始密码</div>
            <Input.Password value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
