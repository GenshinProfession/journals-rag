import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Typography } from 'antd';
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
  const [userId, setUserId] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [adjustYuan, setAdjustYuan] = useState('');
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [gatewayBalanceResult, setGatewayBalanceResult] = useState<string | null>(null);
  const [manualApiKey, setManualApiKey] = useState('');
  const [note, setNote] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [rechargeError, setRechargeError] = useState<string | null>(null);

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
      setRechargeError(null);
      setAmountYuan('');
      setNote('');
    },
    onError: (e: Error) => setRechargeError(e.message)
  });

  const adjustMut = useMutation({
    mutationFn: (body: { user_id: string; amount_cents: number; note: string }) =>
      apiFetch('/api/admin/billing/adjust', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      qc.invalidateQueries({ queryKey: ['admin', 'ledger'] });
      setRechargeError(null);
      setAdjustYuan('');
      setAdjustNote('');
    },
    onError: (e: Error) => setRechargeError(e.message)
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
    onError: (e: Error) => setRechargeError(e.message)
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
        res.items.map((x) => `${x.name}(${x.masked_key}): ${x.ok ? x.balance || '查询成功' : x.error}`).join('\n')
      );
    },
    onError: (e: Error) => setRechargeError(e.message)
  });

  const pickWriter = (id: string) => setUserId(id);

  const onRecharge = (e: FormEvent) => {
    e.preventDefault();
    const yuan = Number(amountYuan);
    if (!userId.trim()) {
      setRechargeError('请填写 writer 的 UUID');
      return;
    }
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setRechargeError('充值金额必须为正数（元）');
      return;
    }
    const amount_cents = Math.round(yuan * 100);
    rechargeMut.mutate({
      user_id: userId.trim(),
      amount_cents,
      note: note.trim() || null
    });
  };

  const onAdjust = (e: FormEvent) => {
    e.preventDefault();
    const yuan = Number(adjustYuan);
    if (!userId.trim()) {
      setRechargeError('请填写 writer 的 UUID');
      return;
    }
    if (!Number.isFinite(yuan) || yuan === 0) {
      setRechargeError('调整金额不能为 0（元），可正可负');
      return;
    }
    if (!adjustNote.trim()) {
      setRechargeError('账务调整必须填写备注');
      return;
    }
    adjustMut.mutate({
      user_id: userId.trim(),
      amount_cents: Math.round(yuan * 100),
      note: adjustNote.trim()
    });
  };

  const walletColumns: ColumnsType<WalletRow> = [
    { title: '用户名', dataIndex: 'username', width: 120, ellipsis: true },
    {
      title: '余额',
      dataIndex: 'balance_cents',
      width: 100,
      align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '冻结',
      dataIndex: 'frozen_cents',
      width: 100,
      align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '累计充值',
      dataIndex: 'total_recharged_cents',
      width: 110,
      align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '累计消费',
      dataIndex: 'total_consumed_cents',
      width: 110,
      align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '操作',
      key: 'pick',
      width: 88,
      align: 'center',
      render: (_: unknown, w: WalletRow) => (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => pickWriter(w.user_id)}>
          选择
        </Button>
      )
    }
  ];

  const ledgerColumns: ColumnsType<LedgerRow> = [
    { title: '类型', dataIndex: 'type', width: 120, ellipsis: true },
    {
      title: '金额（分）',
      dataIndex: 'amount_cents',
      width: 110,
      align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    },
    {
      title: '余额后（分）',
      dataIndex: 'balance_after_cents',
      width: 120,
      align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    },
    {
      title: '备注',
      dataIndex: 'note',
      ellipsis: true,
      render: (n: string | null) => n ?? '—'
    }
  ];

  const usageColumns: ColumnsType<UsageRow> = [
    {
      title: '用户',
      dataIndex: 'user_id',
      width: 120,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 12 }} code>
          {id.slice(0, 8)}…
        </Typography.Text>
      )
    },
    {
      title: '场景',
      key: 'sc',
      width: 160,
      ellipsis: true,
      render: (_: unknown, u: UsageRow) => `${u.agent_name}/${u.scenario}`
    },
    {
      title: 'tokens',
      key: 'tok',
      width: 150,
      render: (_: unknown, u: UsageRow) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          in {u.input_tokens} / out {u.output_tokens}
        </span>
      )
    },
    {
      title: '费用',
      dataIndex: 'cost_cents',
      width: 88,
      align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    { title: '状态', dataIndex: 'status', width: 96, ellipsis: true }
  ];

  return (
    <div className="panel stack">
      <div>
        <h2>充值与流水</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          人工入账、账务调整、钱包快照与用量对账集中在这一页。
        </p>
      </div>

      <form className="form-stack form-stack--wide" onSubmit={onRecharge}>
        <h3 style={{ marginTop: 0 }}>人工充值（仅 writer）</h3>
        <div className="field">
          <label htmlFor="bill-user-id">Writer 用户 ID</label>
          <input id="bill-user-id" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="bill-amount">金额（元）</label>
          <input id="bill-amount" value={amountYuan} onChange={(e) => setAmountYuan(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="bill-note">备注（可选）</label>
          <input id="bill-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {rechargeError && <div className="alert alert--error">{rechargeError}</div>}
        <button className="btn btn--primary" type="submit" disabled={rechargeMut.isPending}>
          {rechargeMut.isPending ? '提交中…' : '确认充值'}
        </button>
      </form>

      <form className="form-stack form-stack--wide" onSubmit={onAdjust}>
        <h3>账务调整（可正可负）</h3>
        <p className="muted">用于对账修正；正数加余额，负数扣余额，必须写备注。</p>
        <div className="field">
          <label htmlFor="bill-adjust">调整金额（元）</label>
          <input
            id="bill-adjust"
            value={adjustYuan}
            onChange={(e) => setAdjustYuan(e.target.value)}
            placeholder="例如 10 或 -3.5"
          />
        </div>
        <div className="field">
          <label htmlFor="bill-adjust-note">调整备注</label>
          <input id="bill-adjust-note" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
        </div>
        <button className="btn btn--ghost" type="submit" disabled={adjustMut.isPending}>
          {adjustMut.isPending ? '提交中…' : '确认调整'}
        </button>
      </form>

      <h3>钱包快照</h3>
      {walletsQ.error && <div className="alert alert--error">{(walletsQ.error as Error).message}</div>}
      <Card size="small" styles={{ body: { padding: 0 } }} className="antd-table-card">
        <Table<WalletRow>
          rowKey="user_id"
          size="middle"
          loading={walletsQ.isLoading}
          columns={walletColumns}
          dataSource={walletsQ.data ?? []}
          pagination={false}
          scroll={{ x: 720 }}
        />
      </Card>

      <h3>钱包流水（最近 100 条）</h3>
      <Card size="small" styles={{ body: { padding: 0 } }} className="antd-table-card">
        <Table<LedgerRow>
          rowKey="id"
          size="middle"
          loading={ledgerQ.isLoading}
          columns={ledgerColumns}
          dataSource={ledgerQ.data ?? []}
          pagination={false}
          scroll={{ x: 640 }}
        />
      </Card>

      <h3>AI 调用记录（最近 100 条）</h3>
      <div className="stack" style={{ gap: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>中转站 API Key 额度查询</h4>
        <p className="muted" style={{ marginBottom: 0 }}>
          默认查询已配置的 key；也可临时输入一个 key 查询，不会保存。
        </p>
        <div className="field">
          <label htmlFor="manual-key">临时 API Key（可选）</label>
          <input
            id="manual-key"
            value={manualApiKey}
            onChange={(e) => setManualApiKey(e.target.value)}
            placeholder="可选：临时输入 API Key"
          />
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={gatewayBalanceMut.isPending}
            onClick={() => gatewayBalanceMut.mutate(undefined)}
          >
            查询已配置 Key
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={gatewayBalanceMut.isPending || !manualApiKey.trim()}
            onClick={() => gatewayBalanceMut.mutate(manualApiKey.trim())}
          >
            查询输入 Key
          </button>
        </div>
        {gatewayBalanceResult && <pre className="pre-block">{gatewayBalanceResult}</pre>}
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn--ghost btn--sm" disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate(true)}>
          Usage 对账预览
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate(false)}>
          写回 Usage
        </button>
        {reconcileResult && <span className="badge">{reconcileResult}</span>}
      </div>

      {usageQ.error && <div className="alert alert--error">{(usageQ.error as Error).message}</div>}
      <Card size="small" styles={{ body: { padding: 0 } }} className="antd-table-card">
        <Table<UsageRow>
          rowKey="id"
          size="middle"
          loading={usageQ.isLoading}
          columns={usageColumns}
          dataSource={usageQ.data ?? []}
          pagination={false}
          scroll={{ x: 700 }}
        />
      </Card>
    </div>
  );
}
