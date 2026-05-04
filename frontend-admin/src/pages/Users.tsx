import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Input, InputNumber, Modal, Popconfirm, Space, Table, Tooltip,
  Typography, message
} from 'antd';
import {
  PlusOutlined, StopOutlined, CheckCircleOutlined,
  DollarOutlined, ToolOutlined, CopyOutlined, ReloadOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = { id: string; username: string; nickname: string | null; role: string; is_active: boolean };

export function Users() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserRow | null>(null);
  const [amountYuan, setAmountYuan] = useState<number | null>(null);
  const [adjustYuan, setAdjustYuan] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [regenKeyOpen, setRegenKeyOpen] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [regenUser, setRegenUser] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });

  const writers = (data ?? []).filter(u => u.role === 'writer');

  const createMut = useMutation({
    mutationFn: (body: { username: string; nickname?: string }) =>
      apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }) as Promise<{ secret_key: string; username: string }>,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      setGeneratedKey(res.secret_key);
    },
    onError: (e: Error) => message.error(e.message)
  });

  const updateMut = useMutation({
    mutationFn: (body: { id: string; is_active?: boolean; password?: string; nickname?: string }) => {
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

  const regenMut = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/users/${userId}/regenerate-key`, { method: 'POST' }) as Promise<{ secret_key: string }>,
    onSuccess: (res) => { setRegenKey(res.secret_key); },
    onError: (e: Error) => message.error(e.message)
  });

  const openRegen = (u: UserRow) => { setRegenUser(u); setRegenKey(null); setRegenKeyOpen(true); };
  const closeRegen = () => { setRegenKeyOpen(false); setRegenKey(null); setRegenUser(null); };

  const handleCreate = () => {
    const u = username.trim();
    if (!u) { message.warning('用户名不能为空'); return; }
    createMut.mutate({ username: u, nickname: nickname.trim() || undefined });
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setGeneratedKey(null);
    setUsername('');
    setNickname('');
  };

  const openRecharge = (u: UserRow) => { setTargetUser(u); setAmountYuan(null); setNote(''); setRechargeOpen(true); };
  const openAdjust = (u: UserRow) => { setTargetUser(u); setAdjustYuan(null); setAdjustNote(''); setAdjustOpen(true); };

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
    { title: '昵称', dataIndex: 'nickname', width: 120, ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '状态', dataIndex: 'is_active', width: 80, align: 'center',
      render: (v: boolean) => v ? <Badge status="success" text="启用" /> : <Badge status="error" text="停用" />
    },
    {
      title: '用户 ID', dataIndex: 'id', width: 300, ellipsis: true,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{id}</Typography.Text>
      )
    },
    {
      title: '操作', key: 'actions', width: 200, align: 'center',
      render: (_: unknown, u: UserRow) => (
        <Space size={4}>
          <Tooltip title="充值"><Button size="small" type="text" icon={<DollarOutlined style={{ color: '#34a853' }} />} onClick={() => openRecharge(u)} /></Tooltip>
          <Tooltip title="调整"><Button size="small" type="text" icon={<ToolOutlined />} onClick={() => openAdjust(u)} /></Tooltip>
          <Tooltip title="重新生成密钥"><Button size="small" type="text" icon={<ReloadOutlined style={{ color: '#1a73e8' }} />} onClick={() => openRegen(u)} /></Tooltip>
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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>代写账号</h2>
          <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
            管理 writer 账号，操作列直接充值、调整余额。密码为一次性密钥。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setUsername(''); setNickname(''); setGeneratedKey(null); setCreateOpen(true); }}>
          新建 writer
        </Button>
      </div>

      <Table<UserRow> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={writers} pagination={false} style={{ borderRadius: 8 }} />

      {/* Create writer */}
      <Modal
        title="新建 writer"
        open={createOpen}
        onCancel={closeCreate}
        footer={generatedKey ? (
          <Button type="primary" onClick={closeCreate}>关闭</Button>
        ) : undefined}
        onOk={generatedKey ? undefined : handleCreate}
        okText="创建"
        cancelText="取消"
        confirmLoading={createMut.isPending}
        width={440}
        destroyOnClose
      >
        {generatedKey ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 12, color: '#34a853', fontWeight: 500 }}>创建成功</div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#5f6368' }}>
              以下密钥仅显示一次，请立即复制给 writer 使用：
            </div>
            <div style={{
              padding: '12px 16px', borderRadius: 8, background: '#f8f9fa', border: '1px solid #e8eaed',
              fontFamily: 'var(--font-mono)', fontSize: 15, letterSpacing: '0.05em',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span>{generatedKey}</span>
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => { navigator.clipboard.writeText(generatedKey); message.success('已复制'); }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
            <Label text="用户名（登录用）" required>
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="登录用户名" autoComplete="off" />
            </Label>
            <Label text="昵称">
              <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="可选，显示名" />
            </Label>
            <div style={{ fontSize: 12, color: '#9aa0a6', background: '#f8f9fa', padding: '8px 12px', borderRadius: 4 }}>
              密码将自动生成一次性密钥，创建后仅显示一次。
            </div>
          </div>
        )}
      </Modal>

      {/* Recharge */}
      <Modal title={`充值 — ${targetUser?.nickname || targetUser?.username || ''}`} open={rechargeOpen} onOk={handleRecharge} onCancel={() => setRechargeOpen(false)} okText="确认充值" cancelText="取消" confirmLoading={rechargeMut.isPending} width={420} destroyOnClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
          <Label text="充值金额（元）" required>
            <InputNumber size="large" style={{ width: '100%' }} value={amountYuan} min={0.01} step={10} onChange={v => setAmountYuan(v)} placeholder="100" />
          </Label>
          <Label text="备注">
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="可选" />
          </Label>
        </div>
      </Modal>

      {/* Adjust */}
      <Modal title={`账务调整 — ${targetUser?.nickname || targetUser?.username || ''}`} open={adjustOpen} onOk={handleAdjust} onCancel={() => setAdjustOpen(false)} okText="确认调整" cancelText="取消" confirmLoading={adjustMut.isPending} width={420} destroyOnClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
          <Label text="调整金额（元）" required>
            <InputNumber size="large" style={{ width: '100%' }} value={adjustYuan} step={1} onChange={v => setAdjustYuan(v)} placeholder="正数加余额，负数扣余额" />
          </Label>
          <Label text="调整备注" required>
            <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="对账修正原因" />
          </Label>
        </div>
      </Modal>
      {/* Regenerate key */}
      <Modal
        title={`重新生成密钥 — ${regenUser?.nickname || regenUser?.username || ''}`}
        open={regenKeyOpen}
        onCancel={closeRegen}
        footer={regenKey ? (
          <Button type="primary" onClick={closeRegen}>关闭</Button>
        ) : undefined}
        onOk={regenKey ? undefined : () => { if (regenUser) regenMut.mutate(regenUser.id); }}
        okText="确认重新生成"
        cancelText="取消"
        confirmLoading={regenMut.isPending}
        width={460}
        destroyOnClose
      >
        {regenKey ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 12, color: '#34a853', fontWeight: 500 }}>密钥已重新生成</div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#5f6368' }}>
              以下新密钥仅显示一次，旧密钥已失效。请立即复制：
            </div>
            <div style={{
              padding: '12px 16px', borderRadius: 8, background: '#f8f9fa', border: '1px solid #e8eaed',
              fontFamily: 'var(--font-mono)', fontSize: 15, letterSpacing: '0.05em',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span>{regenKey}</span>
              <Button type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(regenKey); message.success('已复制'); }} />
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 0', color: '#5f6368', fontSize: 14 }}>
            确认后将为 <strong>{regenUser?.username}</strong> 重新生成登录密钥。<br />
            旧密钥将立即失效，该用户需要使用新密钥登录。
          </div>
        )}
      </Modal>
    </div>
  );
}
