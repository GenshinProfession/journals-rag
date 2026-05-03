import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

type MyWallet = {
  balance_cents: number;
  frozen_cents: number;
  total_recharged_cents: number;
  total_consumed_cents: number;
};

type LedgerRow = {
  id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  note: string | null;
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

export function Wallet() {
  const walletQ = useQuery({
    queryKey: ['writer', 'wallet'],
    queryFn: () => apiFetch('/api/wallet') as Promise<MyWallet>
  });

  const ledgerQ = useQuery({
    queryKey: ['writer', 'ledger'],
    queryFn: () => apiFetch('/api/wallet/ledger') as Promise<LedgerRow[]>
  });

  return (
    <div className="panel stack">
      <div>
        <h1>余额与流水</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          数值使用等宽数字显示，避免刷新时跳动。
        </p>
      </div>

      {walletQ.isLoading && <p className="muted">载入钱包…</p>}
      {walletQ.data && (
        <dl className="metric-grid">
          <div className="metric">
            <dt>余额</dt>
            <dd>¥{yuan(walletQ.data.balance_cents)}</dd>
          </div>
          <div className="metric">
            <dt>冻结</dt>
            <dd>¥{yuan(walletQ.data.frozen_cents)}</dd>
          </div>
          <div className="metric">
            <dt>累计充值</dt>
            <dd>¥{yuan(walletQ.data.total_recharged_cents)}</dd>
          </div>
          <div className="metric">
            <dt>累计消费</dt>
            <dd>¥{yuan(walletQ.data.total_consumed_cents)}</dd>
          </div>
        </dl>
      )}

      <h2>最近流水</h2>
      {ledgerQ.isLoading && <p className="muted">载入流水…</p>}
      {ledgerQ.data && ledgerQ.data.length === 0 && <div className="empty-hint">暂无记录</div>}
      {ledgerQ.data && ledgerQ.data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>变动（分）</th>
                <th>余额（分）</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {ledgerQ.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.amount_cents}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.balance_after_cents}</td>
                  <td>{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
