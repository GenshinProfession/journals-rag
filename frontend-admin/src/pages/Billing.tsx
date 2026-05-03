import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
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

  const reconcileMut = useMutation({
    mutationFn: (dry_run: boolean) =>
      apiFetch('/api/admin/billing/usage/reconcile', {
        method: 'POST',
        body: JSON.stringify({ limit: 100, dry_run })
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
      title: '用户 ID', dataIndex: 'user_id', width: 300,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{id}</Typography.Text>
      )
    }
  ];

  const ledgerColumns: ColumnsType<LedgerRow> = [
    { title: '类型', dataIndex: 'type', width: 120, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    {
      title: '金额', dataIndex: 'amount_cents', width: 120, align: 'right',
      render: (v: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? '#52c41a' : '#f5222d', fontWeight: 500 }}>
          {v >= 0 ? '+' : ''}¥{centsToYuan(v)}
        </span>
      )
    },
    {
      title: '余额', dataIndex: 'balance_after_cents', width: 120, align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(v)}</span>
    },
    { title: '备注', dataIndex: 'note', ellipsis: true, render: (n: string | null) => n ?? '—' }
  ];

  const usageColumns: ColumnsType<UsageRow> = [
    {
      title: '用户', dataIndex: 'user_id', width: 130,
      render: (id: string) => <Typography.Text copyable={{ text: id }} code style={{ fontSize: 12 }}>{id.slice(0, 8)}…</Typography.Text>
    },
    { title: '场景', key: 'sc', ellipsis: true, render: (_: unknown, u: UsageRow) => `${u.agent_name} / ${u.scenario}` },
    {
      title: 'Tokens', key: 'tok', width: 180,
      render: (_: unknown, u: UsageRow) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          in {u.input_tokens.toLocaleString()} / out {u.output_tokens.toLocaleString()}
        </span>
      )
    },
    {
      title: '费用', dataIndex: 'cost_cents', width: 100, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> }
  ];

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: '#1f1f1f', fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>计费与流水</h2>
          <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
            钱包余额、流水记录与 AI 调用明细。充值 / 调整请在「代写账号」页面操作。
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
          <Button size="small" type="link" onClick={() => reconcileMut.mutate(false)} style={{ marginLeft: 8 }}>写回</Button>
          <Button size="small" type="link" onClick={() => setReconcileResult(null)}>关闭</Button>
        </div>
      )}

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>钱包快照</h3>
      <Table<WalletRow> rowKey="user_id" size="middle" loading={walletsQ.isLoading} columns={walletColumns} dataSource={walletsQ.data ?? []} pagination={false} style={{ borderRadius: 8, marginBottom: 24 }} />

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>钱包流水（最近 100 条）</h3>
      <Table<LedgerRow> rowKey="id" size="middle" loading={ledgerQ.isLoading} columns={ledgerColumns} dataSource={ledgerQ.data ?? []} pagination={false} style={{ borderRadius: 8, marginBottom: 24 }} />

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>AI 调用记录（最近 100 条）</h3>
      <Table<UsageRow> rowKey="id" size="middle" loading={usageQ.isLoading} columns={usageColumns} dataSource={usageQ.data ?? []} pagination={false} style={{ borderRadius: 8 }} />

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
            <Button icon={<SearchOutlined />} loading={gatewayBalanceMut.isPending} onClick={() => gatewayBalanceMut.mutate(undefined)}>
              查询已配置 Key
            </Button>
            <Button loading={gatewayBalanceMut.isPending} disabled={!manualApiKey.trim()} onClick={() => gatewayBalanceMut.mutate(manualApiKey.trim())}>
              查询输入 Key
            </Button>
          </Space>
          {gatewayBalanceResult && (
            <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: '#f8f9fc', border: '1px solid #e5e7eb', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {gatewayBalanceResult}
            </pre>
          )}
        </div>
      </Modal>
    </div>
  );
}
