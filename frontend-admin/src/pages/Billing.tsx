import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
      }) as Promise<{ items: Array<{ name: string; masked_key: string; ok: boolean; balance: string | null; error: string | null }> }>,
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

  return (
    <section>
      <h2>充值与流水</h2>

      <form onSubmit={onRecharge} style={{ marginBottom: '2rem', maxWidth: 480 }}>
        <h3>人工充值（仅 writer）</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Writer 用户 ID
          <input style={{ width: '100%', marginTop: 4 }} value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          金额（元）
          <input style={{ width: '100%', marginTop: 4 }} value={amountYuan} onChange={(e) => setAmountYuan(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          备注（可选）
          <input style={{ width: '100%', marginTop: 4 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {rechargeError && <p style={{ color: 'crimson' }}>{rechargeError}</p>}
        <button type="submit" disabled={rechargeMut.isPending}>
          {rechargeMut.isPending ? '提交中…' : '确认充值'}
        </button>
      </form>

      <form onSubmit={onAdjust} style={{ marginBottom: '2rem', maxWidth: 480 }}>
        <h3>账务调整（可正可负）</h3>
        <p style={{ opacity: 0.8 }}>用于对账修正；正数加余额，负数扣余额，必须写备注。</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          调整金额（元）
          <input style={{ width: '100%', marginTop: 4 }} value={adjustYuan} onChange={(e) => setAdjustYuan(e.target.value)} placeholder="例如 10 或 -3.5" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          调整备注
          <input style={{ width: '100%', marginTop: 4 }} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
        </label>
        <button type="submit" disabled={adjustMut.isPending}>
          {adjustMut.isPending ? '提交中…' : '确认调整'}
        </button>
      </form>

      <h3>钱包快照</h3>
      {walletsQ.isLoading && <p>加载钱包…</p>}
      {walletsQ.error && <p style={{ color: 'crimson' }}>{(walletsQ.error as Error).message}</p>}
      {walletsQ.data && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 900, marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>用户名</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>余额</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>冻结</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>累计充值</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>累计消费</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {walletsQ.data.map((w) => (
              <tr key={w.user_id}>
                <td style={{ padding: '6px 0' }}>{w.username}</td>
                <td>¥{centsToYuan(w.balance_cents)}</td>
                <td>¥{centsToYuan(w.frozen_cents)}</td>
                <td>¥{centsToYuan(w.total_recharged_cents)}</td>
                <td>¥{centsToYuan(w.total_consumed_cents)}</td>
                <td>
                  <button type="button" onClick={() => pickWriter(w.user_id)}>
                    选择
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>钱包流水（最近 100 条）</h3>
      {ledgerQ.isLoading && <p>加载流水…</p>}
      {ledgerQ.data && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 900, marginBottom: '2rem', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>类型</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>金额（分）</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>余额后（分）</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>备注</th>
            </tr>
          </thead>
          <tbody>
            {ledgerQ.data.map((r) => (
              <tr key={r.id}>
                <td>{r.type}</td>
                <td>{r.amount_cents}</td>
                <td>{r.balance_after_cents}</td>
                <td>{r.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>AI 调用记录（最近 100 条）</h3>
      <div style={{ marginBottom: 16 }}>
        <h4>中转站 API Key 额度查询</h4>
        <p style={{ opacity: 0.8 }}>默认查询已配置的 key；也可临时输入一个 key 查询，不会保存。</p>
        <input
          style={{ width: '100%', maxWidth: 520 }}
          value={manualApiKey}
          onChange={(e) => setManualApiKey(e.target.value)}
          placeholder="可选：临时输入 API Key"
        />
        <p>
          <button type="button" disabled={gatewayBalanceMut.isPending} onClick={() => gatewayBalanceMut.mutate(undefined)}>
            查询已配置 Key
          </button>
          <button
            type="button"
            style={{ marginLeft: 8 }}
            disabled={gatewayBalanceMut.isPending || !manualApiKey.trim()}
            onClick={() => gatewayBalanceMut.mutate(manualApiKey.trim())}
          >
            查询输入 Key
          </button>
        </p>
        {gatewayBalanceResult && <pre style={{ whiteSpace: 'pre-wrap' }}>{gatewayBalanceResult}</pre>}
      </div>
      <p>
        <button type="button" disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate(true)}>
          Usage 对账预览
        </button>
        <button type="button" style={{ marginLeft: 8 }} disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate(false)}>
          写回 Usage
        </button>
        {reconcileResult && <span style={{ marginLeft: 8 }}>{reconcileResult}</span>}
      </p>
      {usageQ.isLoading && <p>加载用量…</p>}
      {usageQ.data && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 900, fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>用户</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>场景</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>tokens</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>费用</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {usageQ.data.map((u) => (
              <tr key={u.id}>
                <td>
                  <code style={{ fontSize: 11 }}>{u.user_id.slice(0, 8)}…</code>
                </td>
                <td>{u.agent_name}/{u.scenario}</td>
                <td>
                  in {u.input_tokens} / out {u.output_tokens}
                </td>
                <td>¥{centsToYuan(u.cost_cents)}</td>
                <td>{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
