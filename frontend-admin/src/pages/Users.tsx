import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    const password = window.prompt(`为 ${user.username} 设置新密码（至少 6 位）`);
    if (!password) return;
    updateMut.mutate({ id: user.id, password });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMut.mutate({ username, password });
  };

  return (
    <section>
      <h2>代写账号</h2>
      <p>创建 writer 账号时会自动建立空钱包，可在「充值计费」里人工加款。</p>

      <form onSubmit={onSubmit} style={{ marginBottom: '1.5rem', maxWidth: 360 }}>
        <h3>新建 writer</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          用户名
          <input style={{ width: '100%', marginTop: 4 }} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          初始密码
          <input
            type="password"
            style={{ width: '100%', marginTop: 4 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {formError && <p style={{ color: 'crimson' }}>{formError}</p>}
        <button type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? '创建中…' : '创建'}
        </button>
      </form>

      {isLoading && <p>加载用户列表…</p>}
      {error && <p style={{ color: 'crimson' }}>{(error as Error).message}</p>}
      {data && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>用户名</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>角色</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>用户 ID</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>启用</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: '6px 0' }}>{u.username}</td>
                <td>{u.role}</td>
                <td>
                  <code style={{ fontSize: 12 }}>{u.id}</code>
                </td>
                <td>{u.is_active ? '是' : '否'}</td>
                <td>
                  {u.role === 'writer' && (
                    <>
                      <button
                        type="button"
                        disabled={updateMut.isPending}
                        onClick={() => updateMut.mutate({ id: u.id, is_active: !u.is_active })}
                      >
                        {u.is_active ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        disabled={updateMut.isPending}
                        onClick={() => resetPassword(u)}
                        style={{ marginLeft: 6 }}
                      >
                        重置密码
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
