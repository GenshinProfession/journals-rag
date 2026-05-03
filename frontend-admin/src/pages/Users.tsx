import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Tooltip,
  Typography, Badge, message
} from 'antd';
import {
  PlusOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined,
  DollarOutlined, ToolOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = { id: string; username: string; role: string; is_active: boolean };

export function Users() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserRow | null>(null);
  const [amountYuan, setAmountYuan] = useState<number | null>(null);
  const [adjustYuan, setAdjustYuan] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });

  const writers = (data ?? []).filter(u => u.role === 'writer');

  const createMut = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      message.success('已创建');
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

  const rechargeMut = useMutation({
    mutationFn: (body: { user_id: string; amount_cents: number; note: string | null }) =>
      apiFetch('/api/admin/billing/recharge', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      qc.invalidateQueries({ queryKey: ['admin', 'ledger'] });
      message.success('充值成功');
      setRechargeOpen(false);
    },
    onError: (e: Error) => message.error(e.message)
  });

  const adjustMut = useMutation({
    mutationFn: (body: { user_id: string; amount_cents: number; note: string }) =>
      apiFetch('/api/admin/billing/adjust', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      qc.invalidateQueries({ queryKey: ['admin', 'ledger'] });
      message.success('调整成功');
      setAdjustOpen(false);
    },
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

  const openRecharge = (u: UserRow) => {
    setTargetUser(u);
    setAmountYuan(null);
    setNote('');
    setRechargeOpen(true);
  };

  const openAdjust = (u: UserRow) => {
    setTargetUser(u);
    setAdjustYuan(null);
    setAdjustNote('');
    setAdjustOpen(true);
  };

  const handleRecharge = () => {
    if (!targetUser || !amountYuan || amountYuan <= 0) { message.warning('金额必须为正数'); return; }
    rechargeMut.mutate({ user_id: targetUser.id, amount_cents: Math.round(amountYuan * 100), note: note.trim() || null });
  };

  const handleAdjust = () => {
    if (!targetUser || !adjustYuan || adjustYuan === 0) { message.warning('金额不能为 0'); return; }
    if (!adjustNote.trim()) { message.warning('必须填写备注'); return; }
    adjustMut.mutate({ user_id: targetUser.id, amount_cents: Math.round(adjustYuan * 100), note: adjustNote.trim() });
  };

  const columns: ColumnsType<UserRow> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true },
    {
      title: '状态', dataIndex: 'is_active', width: 90, align: 'center',
      render: (v: boolean) => v
        ? <Badge status="success" text="启用" />
        : <Badge status="error" text="停用" />
    },
    {
      title: '用户 ID', dataIndex: 'id', width: 340, ellipsis: true,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          {id}
        </Typography.Text>
      )
    },
    {
      title: '操作', key: 'actions', width: 200, align: 'center',
      render: (_: unknown, u: UserRow) => (
        <Space size={4}>
          <Tooltip title="充值"><Button size="small" type="text" icon={<DollarOutlined style={{ color: '#52c41a' }} />} onClick={() => openRecharge(u)} /></Tooltip>
          <Tooltip title="调整"><Button size="small" type="text" icon={<ToolOutlined />} onClick={() => openAdjust(u)} /></Tooltip>
          <Tooltip title="重置密码"><Button size="small" type="text" icon={<KeyOutlined />} onClick={() => resetPassword(u)} /></Tooltip>
          <Popconfirm title={`确认${u.is_active ? '停用' : '启用'} ${u.username}？`} onConfirm={() => updateMut.mutate({ id: u.id, is_active: !u.is_active })}>
            <Tooltip title={u.is_active ? '停用' : '启用'}>
              <Button size="small" type="text" icon={u.is_active ? <StopOutlined style={{ color: '#faad14' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const F = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: '#1f1f1f', fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>代写账号</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            管理 writer 账号，直接在操作列中充值或调整余额。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setUsername(''); setPassword(''); setCreateOpen(true); }}>
          新建 writer
        </Button>
      </div>

      <Table<UserRow>
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={writers}
        pagination={false}
        style={{ borderRadius: 8 }}
      />

      {/* 新建 */}
      <Modal
        title="新建 writer"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={createMut.isPending}
        width={440}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0 4px' }}>
          <F label="用户名" required>
            <Input size="large" value={username} onChange={e => setUsername(e.target.value)} placeholder="登录用户名" autoComplete="off" />
          </F>
          <F label="初始密码" required>
            <Input.Password size="large" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
          </F>
        </div>
      </Modal>

      {/* 充值 */}
      <Modal
        title={`充值 — ${targetUser?.username ?? ''}`}
        open={rechargeOpen}
        onOk={handleRecharge}
        onCancel={() => setRechargeOpen(false)}
        okText="确认充值"
        cancelText="取消"
        confirmLoading={rechargeMut.isPending}
        width={440}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0 4px' }}>
          <F label="充值金额（元）" required>
            <InputNumber size="large" style={{ width: '100%' }} value={amountYuan} min={0.01} step={10} onChange={v => setAmountYuan(v)} placeholder="100" />
          </F>
          <F label="备注">
            <Input size="large" value={note} onChange={e => setNote(e.target.value)} placeholder="可选" />
          </F>
        </div>
      </Modal>

      {/* 调整 */}
      <Modal
        title={`账务调整 — ${targetUser?.username ?? ''}`}
        open={adjustOpen}
        onOk={handleAdjust}
        onCancel={() => setAdjustOpen(false)}
        okText="确认调整"
        cancelText="取消"
        confirmLoading={adjustMut.isPending}
        width={440}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0 4px' }}>
          <F label="调整金额（元），正数加余额，负数扣余额" required>
            <InputNumber size="large" style={{ width: '100%' }} value={adjustYuan} step={1} onChange={v => setAdjustYuan(v)} placeholder="例如 10 或 -3.5" />
          </F>
          <F label="调整备注" required>
            <Input size="large" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="对账修正原因" />
          </F>
        </div>
      </Modal>
    </div>
  );
}
