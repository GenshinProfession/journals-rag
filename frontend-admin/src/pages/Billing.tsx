import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Input, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
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
  created_at: string | null;
};

type DailyStat = { day: string; count: number; total_cents: number };
type UserRow = { id: string; username: string; role: string; nickname: string | null };

function centsToYuan(c: number) { return (c / 100).toFixed(2); }

export function Billing() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [gatewayResult, setGatewayResult] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);

  const usersQ = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });
  const writers = (usersQ.data ?? []).filter(u => u.role === 'writer');
  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    (usersQ.data ?? []).forEach(u => { m[u.id] = u.nickname || u.username; });
    return m;
  }, [usersQ.data]);

  const walletsQ = useQuery({
    queryKey: ['admin', 'wallets'],
    queryFn: () => apiFetch('/api/admin/billing/wallets') as Promise<WalletRow[]>
  });

  const ledgerQ = useQuery({
    queryKey: ['admin', 'ledger', userId],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '300' });
      if (userId) p.set('user_id', userId);
      return apiFetch(`/api/admin/billing/ledger?${p}`) as Promise<LedgerRow[]>;
    }
  });

  const dailyQ = useQuery({
    queryKey: ['admin', 'ledger-daily', userId],
    queryFn: () => {
      const p = new URLSearchParams({ days: '30' });
      if (userId) p.set('user_id', userId);
      return apiFetch(`/api/admin/billing/ledger/daily-stats?${p}`) as Promise<DailyStat[]>;
    }
  });

  const reconcileMut = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/billing/usage/reconcile', {
        method: 'POST', body: JSON.stringify({ limit: 100, dry_run: true })
      }) as Promise<{ status: string; checked: number; changed: number }>,
    onSuccess: (res) => message.info(`对账：checked=${res.checked}, changed=${res.changed}`),
    onError: (e: Error) => message.error(e.message)
  });

  const gatewayMut = useMutation({
    mutationFn: (key?: string) =>
      apiFetch('/api/admin/billing/gateway-balance', {
        method: 'POST', body: JSON.stringify({ api_key: key || null })
      }) as Promise<{ items: Array<{ name: string; masked_key: string; ok: boolean; balance: string | null; error: string | null }> }>,
    onSuccess: (res) => {
      setGatewayResult(res.items.map(x => `${x.name}(${x.masked_key}): ${x.ok ? x.balance || '成功' : x.error}`).join('\n'));
    },
    onError: (e: Error) => message.error(e.message)
  });

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgerQ.data ?? [];
    return (ledgerQ.data ?? []).filter(r =>
      r.type.toLowerCase().includes(q) ||
      (r.note ?? '').toLowerCase().includes(q) ||
      (userMap[r.user_id] ?? '').toLowerCase().includes(q)
    );
  }, [ledgerQ.data, search, userMap]);

  const walletColumns: ColumnsType<WalletRow> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true },
    {
      title: '余额', dataIndex: 'balance_cents', width: 110, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: '#1a73e8' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '冻结', dataIndex: 'frozen_cents', width: 100, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '累计充值', dataIndex: 'total_recharged_cents', width: 110, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: '#34a853' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '累计消费', dataIndex: 'total_consumed_cents', width: 110, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: '#ea4335' }}>¥{centsToYuan(c)}</span>
    },
  ];

  const ledgerColumns: ColumnsType<LedgerRow> = [
    {
      title: '用户', dataIndex: 'user_id', width: 110, ellipsis: true,
      render: (id: string) => userMap[id] || id.slice(0, 8)
    },
    { title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '金额', dataIndex: 'amount_cents', width: 110, align: 'right',
      render: (v: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? '#34a853' : '#ea4335', fontWeight: 500 }}>
          {v >= 0 ? '+' : ''}¥{centsToYuan(v)}
        </span>
      )
    },
    {
      title: '余额', dataIndex: 'balance_after_cents', width: 100, align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(v)}</span>
    },
    { title: '备注', dataIndex: 'note', ellipsis: true, render: (n: string | null) => n ?? '—' },
    {
      title: '时间', dataIndex: 'created_at', width: 150, ellipsis: true,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '—'
    },
  ];

  const Label = ({ text, children }: { text: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: '#202124', fontWeight: 500 }}>{text}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>计费与流水</h2>
          <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
            钱包余额、流水趋势与明细。充值 / 调整请在「代写账号」操作。
          </p>
        </div>
        <Space>
          <Button icon={<SearchOutlined />} onClick={() => { setManualKey(''); setGatewayResult(null); setKeyOpen(true); }}>Key 额度</Button>
          <Button icon={<SyncOutlined />} loading={reconcileMut.isPending} onClick={() => reconcileMut.mutate()}>对账</Button>
        </Space>
      </div>

      {/* Wallet snapshot */}
      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>钱包快照</h3>
      <Table<WalletRow> rowKey="user_id" size="small" loading={walletsQ.isLoading} columns={walletColumns} dataSource={walletsQ.data ?? []} pagination={false} style={{ borderRadius: 8, marginBottom: 28 }} />

      {/* Filters */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} lg={6}>
          <Select
            style={{ width: '100%' }}
            placeholder="按用户筛选"
            allowClear showSearch optionFilterProp="label"
            value={userId || undefined}
            onChange={v => setUserId(v ?? '')}
            options={writers.map(u => ({ label: u.nickname || u.username, value: u.id }))}
          />
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <Input prefix={<SearchOutlined style={{ color: '#9aa0a6' }} />} placeholder="搜索类型、备注" value={search} onChange={e => setSearch(e.target.value)} allowClear />
        </Col>
      </Row>

      {/* Trend */}
      {(dailyQ.data ?? []).length > 0 && (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, padding: '20px 20px 8px', marginBottom: 20, background: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16, color: '#202124' }}>流水趋势（最近 30 天）</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyQ.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <RTooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="笔数" stroke="#1a73e8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total_cents" name="金额(分)" stroke="#34a853" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>钱包流水</h3>
      <Table<LedgerRow>
        rowKey="id" size="small" loading={ledgerQ.isLoading} columns={ledgerColumns} dataSource={filteredLedger}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
        style={{ borderRadius: 8 }}
      />

      {/* Key modal */}
      <Modal title="API Key 额度查询" open={keyOpen} onCancel={() => setKeyOpen(false)} footer={null} width={520} destroyOnClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <Label text="临时 API Key（可选）">
            <Input value={manualKey} onChange={e => setManualKey(e.target.value)} placeholder="可选" />
          </Label>
          <Space>
            <Button icon={<SearchOutlined />} loading={gatewayMut.isPending} onClick={() => gatewayMut.mutate(undefined)}>查询已配置</Button>
            <Button loading={gatewayMut.isPending} disabled={!manualKey.trim()} onClick={() => gatewayMut.mutate(manualKey.trim())}>查询输入 Key</Button>
          </Space>
          {gatewayResult && (
            <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e8eaed', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {gatewayResult}
            </pre>
          )}
        </div>
      </Modal>
    </div>
  );
}
