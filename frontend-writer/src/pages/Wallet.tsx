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
    <section>
      <h1>余额与流水</h1>
      {walletQ.isLoading && <p>载入钱包…</p>}
      {walletQ.data && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <dt style={{ opacity: 0.7 }}>余额</dt>
            <dd style={{ margin: 0, fontSize: '1.4rem' }}>¥{yuan(walletQ.data.balance_cents)}</dd>
          </div>
          <div>
            <dt style={{ opacity: 0.7 }}>冻结</dt>
            <dd style={{ margin: 0 }}>¥{yuan(walletQ.data.frozen_cents)}</dd>
          </div>
          <div>
            <dt style={{ opacity: 0.7 }}>累计充值</dt>
            <dd style={{ margin: 0 }}>¥{yuan(walletQ.data.total_recharged_cents)}</dd>
          </div>
          <div>
            <dt style={{ opacity: 0.7 }}>累计消费</dt>
            <dd style={{ margin: 0 }}>¥{yuan(walletQ.data.total_consumed_cents)}</dd>
          </div>
        </dl>
      )}

      <h2 style={{ marginTop: '2rem', fontSize: '1.1rem' }}>最近流水</h2>
      {ledgerQ.isLoading && <p>载入流水…</p>}
      {ledgerQ.data && ledgerQ.data.length === 0 && <p style={{ opacity: 0.8 }}>暂无记录</p>}
      {ledgerQ.data && ledgerQ.data.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 720, fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>类型</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>变动（分）</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>余额（分）</th>
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
    </section>
  );
}
