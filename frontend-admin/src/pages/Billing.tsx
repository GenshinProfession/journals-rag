import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, InputNumber, Modal, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { DollarOutlined, ToolOutlined, SearchOutlined, SyncOutlined, SelectOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type WalletRow = {
  user_id: string;
  username: string;
  balance_cents: number;
  frozen_cents: number;
  total_recharged_cents: number;
  total_consumed_cents: number;
};

type LedgerRow = {
  id: string;
  user_id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  note: string | null;
};

type UsageRow = {
  id: string;
  user_id: string;
  agent_name: string;
  scenario: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  status: string;
};

function centsToYuan(c: number) {
  return (c / 100).toFixed(2);
}

export function Billing() {
  const qc = useQueryClient();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [amountYuan, setAmountYuan] = useState<number | null>(null);
  const [adjustYuan, setAdjustYuan] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [gatewayBalanceResult, setGatewayBalanceResult] = useState<string | null>(null);
  const [manualApiKey, setManualApiKey] = useState('');
  const [keyQueryOpen, setKeyQueryOpen] = useState(false);

  const walletsQ = useQuery({
    queryKey: ['admin', 'wallets'],
    queryFn: () => apiFetch('/api/admin/billing/wallets') as Promise<WalletRow[]>
  });

  const ledgerQ = useQuery({
    queryKey: ['admin', 'ledger'],
    queryFn: () => apiFetch('/api/admin/billing/ledger?limit=100') as Promise<LedgerRow[]>
  });

  const usageQ = useQuery({
    queryKey: ['admin', 'usage'],
    queryFn: () => apiFetch('/api/admin/billing/usage?limit=100') as Promise<UsageRow[]>
  });

  const rechargeMut = useMutation({
    mutationFn: (body: { user_id: string; amount_cents: number; note: string | null }) =>
      apiFetch('/api/admin/billing/recharge', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      qc.invalidateQueries({ queryKey: ['admin', 'ledger'] });
      message.success('充值成功');
      setRechargeOpen(false);
      setAmountYuan(null);
      setNote('');
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
      setAdjustYuan(null);
      setAdjustNote('');
    },
    onError: (e: Error) => message.error(e.message)
  });

  const reconcileMut = useMutation({
    mutationFn: (dry_run: boolean) =>
      apiFetch('/api/admin/billing/usage/reconcile', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId.trim() || null, limit: 100, dry_run })
      }) as Promise<{ status: string; checked: number; changed: number }>,
    onSuccess: (res) => {
      setReconcileResult(`${res.status}: checked=${res.checked}, changed=${res.changed}`);
      qc.invalidateQueries({ queryKey: ['admin', 'usage'] });
    },
    onError: (e: Error) => message.error(e.message)
  });

  const gatewayBalanceMut = useMutation({
    mutationFn: (api_key?: string) =>
      apiFetch('/api/admin/billing/gateway-balance', {
        method: 'POST',
        body: JSON.stringify({ api_key: api_key || null })
      }) as Promise<{
        items: Array<{ name: string; masked_key: string; ok: boolean; balance: string | null; error: string | null }>;
      }>,
    onSuccess: (res) => {
      setGatewayBalanceResult(
        res.items.map(x => `${x.name}(${x.masked_key}): ${x.ok ? x.balance || '查询成功' : x.error}`).join('\n')
      );
    },
    onError: (e: Error) => message.error(e.message)
  });

  const pickWriter = (id: string, action: 'recharge' | 'adjust') => {
    setUserId(id);
    if (action === 'recharge') {
      setAmountYuan(null);
      setNote('');
      setRechargeOpen(true);
    } else {
      setAdjustYuan(null);
      setAdjustNote('');
      setAdjustOpen(true);
    }
  };

  const handleRecharge = () => {
    if (!userId.trim()) { message.warning('请先选择 writer'); return; }
    if (!amountYuan || amountYuan <= 0) { message.warning('充值金额必须为正数'); return; }
    rechargeMut.mutate({
      user_id: userId.trim(),
      amount_cents: Math.round(amountYuan * 100),
      note: note.trim() || null
    });
  };

  const handleAdjust = () => {
    if (!userId.trim()) { message.warning('请先选择 writer'); return; }
    if (!adjustYuan || adjustYuan === 0) { message.warning('调整金额不能为 0'); return; }
    if (!adjustNote.trim()) { message.warning('账务调整必须填写备注'); return; }
    adjustMut.mutate({
      user_id: userId.trim(),
      amount_cents: Math.round(adjustYuan * 100),
      note: adjustNote.trim()
    });
  };

  const walletColumns: ColumnsType<WalletRow> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true },
    {
      title: '余额', dataIndex: 'balance_cents', width: 110, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '冻结', dataIndex: 'frozen_cents', width: 110, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '累计充值', dataIndex: 'total_recharged_cents', width: 120, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '累计消费', dataIndex: 'total_consumed_cents', width: 120, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '操作', key: 'actions', width: 140, align: 'center',
      render: (_: unknown, w: WalletRow) => (
        <Space size={4}>
          <Tooltip title="充值">
            <Button size="small" type="text" icon={<DollarOutlined style={{ color: '#52c41a' }} />} onClick={() => pickWriter(w.user_id, 'recharge')} />
          </Tooltip>
          <Tooltip title="调整">
            <Button size="small" type="text" icon={<ToolOutlined />} onClick={() => pickWriter(w.user_id, 'adjust')} />
          </Tooltip>
          <Tooltip title="复制 ID">
            <Typography.Text copyable={{ text: w.user_id }} style={{ fontSize: 12 }} />
          </Tooltip>
        </Space>
      )
    }
  ];

  const ledgerColumns: ColumnsType<LedgerRow> = [
    { title: '类型', dataIndex: 'type', width: 120, ellipsis: true,
      render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    {
      title: '金额（分）', dataIndex: 'amount_cents', width: 120, align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? '#52c41a' : '#f5222d' }}>{v >= 0 ? `+${v}` : v}</span>
    },
    {
      title: '余额后（分）', dataIndex: 'balance_after_cents', width: 130, align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    },
    { title: '备注', dataIndex: 'note', ellipsis: true, render: (n: string | null) => n ?? '—' }
  ];

  const usageColumns: ColumnsType<UsageRow> = [
    {
      title: '用户', dataIndex: 'user_id', width: 130,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12 }} code>
          {id.slice(0, 8)}…
        </Typography.Text>
      )
    },
    {
      title: '场景', key: 'sc', ellipsis: true,
      render: (_: unknown, u: UsageRow) => `${u.agent_name}/${u.scenario}`
    },
    {
      title: 'tokens', key: 'tok', width: 160,
      render: (_: unknown, u: UsageRow) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          in {u.input_tokens} / out {u.output_tokens}
        </span>
      )
    },
    {
      title: '费用', dataIndex: 'cost_cents', width: 100, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    { title: '状态', dataIndex: 'status', width: 100, ellipsis: true,
      render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> }
  ];

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>充值与流水</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            人工入账、账务调整、钱包快照与用量对账集中在这一页。
          </p>
        </div>
        <Space>
          <Button icon={<SearchOutlined />} onClick={() => { setManualApiKey(''); setGatewayBalanceResult(null); setKeyQueryOpen(true); }}>
            Key 额度查询
          </Button>
          <Button icon={<SyncOutlined />} disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate(true)}>
            Usage 对账
          </Button>
        </Space>
      </div>

      {reconcileResult && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13 }}>
          对账结果：{reconcileResult}
          <Button size="small" type="link" onClick={() => reconcileMut.mutate(false)} style={{ marginLeft: 8 }}>
            写回
          </Button>
          <Button size="small" type="link" onClick={() => setReconcileResult(null)}>关闭</Button>
        </div>
      )}

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>钱包快照</h3>
      <Table<WalletRow>
        rowKey="user_id"
        size="middle"
        loading={walletsQ.isLoading}
        columns={walletColumns}
        dataSource={walletsQ.data ?? []}
        pagination={false}
        style={{ borderRadius: 8, marginBottom: 24 }}
      />

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>钱包流水（最近 100 条）</h3>
      <Table<LedgerRow>
        rowKey="id"
        size="middle"
        loading={ledgerQ.isLoading}
        columns={ledgerColumns}
        dataSource={ledgerQ.data ?? []}
        pagination={false}
        style={{ borderRadius: 8, marginBottom: 24 }}
      />

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>AI 调用记录（最近 100 条）</h3>
      <Table<UsageRow>
        rowKey="id"
        size="middle"
        loading={usageQ.isLoading}
        columns={usageColumns}
        dataSource={usageQ.data ?? []}
        pagination={false}
        style={{ borderRadius: 8 }}
      />

      {/* 充值弹窗 */}
      <Modal
        title="人工充值"
        open={rechargeOpen}
        onCancel={() => setRechargeOpen(false)}
        onOk={handleRecharge}
        okText="确认充值"
        cancelText="取消"
        confirmLoading={rechargeMut.isPending}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <F label="Writer 用户 ID">
            <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="UUID" />
          </F>
          <F label="金额（元）">
            <InputNumber style={{ width: '100%' }} value={amountYuan} min={0.01} step={10} onChange={v => setAmountYuan(v)} placeholder="100" />
          </F>
          <F label="备注（可选）">
            <Input value={note} onChange={e => setNote(e.target.value)} />
          </F>
        </div>
      </Modal>

      {/* 调整弹窗 */}
      <Modal
        title="账务调整（可正可负）"
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        onOk={handleAdjust}
        okText="确认调整"
        cancelText="取消"
        confirmLoading={adjustMut.isPending}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <F label="Writer 用户 ID">
            <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="UUID" />
          </F>
          <F label="调整金额（元），正数加余额，负数扣余额">
            <InputNumber style={{ width: '100%' }} value={adjustYuan} step={1} onChange={v => setAdjustYuan(v)} placeholder="例如 10 或 -3.5" />
          </F>
          <F label="调整备注（必填）">
            <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="对账修正原因" />
          </F>
        </div>
      </Modal>

      {/* Key 额度查询 */}
      <Modal
        title="中转站 API Key 额度查询"
        open={keyQueryOpen}
        onCancel={() => setKeyQueryOpen(false)}
        footer={null}
        width={560}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>
            默认查询已配置的 key；也可临时输入一个 key 查询，不会保存。
          </p>
          <F label="临时 API Key（可选）">
            <Input value={manualApiKey} onChange={e => setManualApiKey(e.target.value)} placeholder="可选：临时输入 API Key" />
          </F>
          <Space>
            <Button
              icon={<SearchOutlined />}
              loading={gatewayBalanceMut.isPending}
              onClick={() => gatewayBalanceMut.mutate(undefined)}
            >
              查询已配置 Key
            </Button>
            <Button
              loading={gatewayBalanceMut.isPending}
              disabled={!manualApiKey.trim()}
              onClick={() => gatewayBalanceMut.mutate(manualApiKey.trim())}
            >
              查询输入 Key
            </Button>
          </Space>
          {gatewayBalanceResult && (
            <pre style={{
              margin: 0, padding: 14, borderRadius: 8,
              background: '#f8f9fc', border: '1px solid #e5e7eb',
              fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              {gatewayBalanceResult}
            </pre>
          )}
        </div>
      </Modal>
    </div>
  );
}
