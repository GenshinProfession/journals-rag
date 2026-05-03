import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = { id: string; username: string; role: string; is_active: boolean };

export function Users() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

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
    }
  });

  const updateMut = useMutation({
    mutationFn: (body: { id: string; is_active?: boolean; password?: string }) => {
      const { id, ...payload } = body;
      return apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e: Error) => message.error(e.message)
  });

  const resetPassword = (user: UserRow) => {
    const pwd = window.prompt(`为 ${user.username} 设置新密码（至少 6 位）`);
    if (!pwd) return;
    updateMut.mutate({ id: user.id, password: pwd });
  };

  const openCreateModal = () => {
    setCreateError(null);
    setUsername('');
    setPassword('');
    setCreateOpen(true);
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setUsername('');
    setPassword('');
    setCreateError(null);
  };

  const handleCreate = async () => {
    const u = username.trim();
    if (!u || !password) {
      setCreateError('用户名和密码不能为空');
      return Promise.reject(new Error('validation'));
    }
    setCreateError(null);
    try {
      await createMut.mutateAsync({ username: u, password });
      message.success('已创建 writer');
      closeCreateModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建失败';
      setCreateError(msg);
      return Promise.reject(e);
    }
  };

  const columns: ColumnsType<UserRow> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true, width: 160 },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
      align: 'center',
      render: (role: string) => <Tag style={{ margin: 0 }}>{role}</Tag>
    },
    {
      title: '用户 ID',
      dataIndex: 'id',
      ellipsis: true,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12 }} code>
          {id}
        </Typography.Text>
      )
    },
    {
      title: '启用',
      dataIndex: 'is_active',
      width: 72,
      align: 'center',
      render: (v: boolean) => (v ? '是' : '否')
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      align: 'center',
      render: (_: unknown, u: UserRow) =>
        u.role === 'writer' ? (
          <Space size={4} wrap>
            <Button
              size="small"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({ id: u.id, is_active: !u.is_active })}
            >
              {u.is_active ? '停用' : '启用'}
            </Button>
            <Button size="small" disabled={updateMut.isPending} onClick={() => resetPassword(u)}>
              重置密码
            </Button>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
    }
  ];

  return (
    <div className="panel stack">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>代写账号</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            创建 writer 账号时会自动建立空钱包，可在「充值计费」里人工加款。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建 writer
        </Button>
      </div>

      {error && <div className="alert alert--error">{(error as Error).message}</div>}
      <Card size="small" styles={{ body: { padding: 0 } }} className="antd-table-card">
        <Table<UserRow>
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 720 }}
        />
      </Card>

      <Modal
        title="新建 writer"
        open={createOpen}
        onOk={handleCreate}
        onCancel={closeCreateModal}
        okText="创建"
        cancelText="取消"
        confirmLoading={createMut.isPending}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4 }}>用户名</div>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="登录用户名"
              autoComplete="off"
            />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>初始密码</div>
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete="new-password"
            />
          </div>
          {createError && <div className="alert alert--error" style={{ marginBottom: 0 }}>{createError}</div>}
        </div>
      </Modal>
    </div>
  );
}
