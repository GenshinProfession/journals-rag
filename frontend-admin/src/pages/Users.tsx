import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = { id: string; username: string; role: string; is_active: boolean };

export function Users() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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
      setUsername('');
      setPassword('');
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message)
  });

  const updateMut = useMutation({
    mutationFn: (body: { id: string; is_active?: boolean; password?: string }) => {
      const { id, ...payload } = body;
      return apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e: Error) => setFormError(e.message)
  });

  const resetPassword = (user: UserRow) => {
    const pwd = window.prompt(`为 ${user.username} 设置新密码（至少 6 位）`);
    if (!pwd) return;
    updateMut.mutate({ id: user.id, password: pwd });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMut.mutate({ username, password });
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
      <div>
        <h2>代写账号</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          创建 writer 账号时会自动建立空钱包，可在「充值计费」里人工加款。
        </p>
      </div>

      <form className="form-stack" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>新建 writer</h3>
        <div className="field">
          <label htmlFor="new-writer-user">用户名</label>
          <input id="new-writer-user" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-writer-pass">初始密码</label>
          <input
            id="new-writer-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {formError && <div className="alert alert--error">{formError}</div>}
        <button className="btn btn--primary" type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? '创建中…' : '创建'}
        </button>
      </form>

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
    </div>
  );
}
