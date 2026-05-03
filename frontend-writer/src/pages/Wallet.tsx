import { useQuery } from '@tanstack/react-query';
import { Card, Empty, Statistic, Table } from 'antd';
import { WalletOutlined } from '@ant-design/icons';
import { apiFetch } from '../api/client';

type MyWallet = { balance_cents: number; frozen_cents: number; total_recharged_cents: number; total_consumed_cents: number };
type LedgerRow = { id: string; type: string; amount_cents: number; balance_after_cents: number; note: string | null };

function yuan(cents: number) { return (cents / 100).toFixed(2); }

const TYPE_MAP: Record<string, string> = {
  recharge: '充值', consume: '消费', adjust: '调账', freeze: '冻结', unfreeze: '解冻',
};

export function Wallet() {
  const walletQ = useQuery({ queryKey: ['writer', 'wallet'], queryFn: () => apiFetch('/api/wallet') as Promise<MyWallet> });
  const ledgerQ = useQuery({ queryKey: ['writer', 'ledger'], queryFn: () => apiFetch('/api/wallet/ledger') as Promise<LedgerRow[]> });

  const columns = [
    { title: '类型', dataIndex: 'type', key: 'type', width: 100, render: (v: string) => TYPE_MAP[v] ?? v },
    { title: '变动', dataIndex: 'amount_cents', key: 'amount', width: 120, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? '#188038' : '#d93025' }}>¥{yuan(v)}</span> },
    { title: '余额', dataIndex: 'balance_after_cents', key: 'bal', width: 120, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{yuan(v)}</span> },
    { title: '备注', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '—' },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, color: '#202124', marginBottom: 20 }}>余额与流水</h2>

      {walletQ.data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          <Card style={{ borderColor: '#e8eaed' }}>
            <Statistic title="可用余额" value={yuan(walletQ.data.balance_cents)} prefix="¥" valueStyle={{ color: '#1a73e8', fontVariantNumeric: 'tabular-nums' }} />
          </Card>
          <Card style={{ borderColor: '#e8eaed' }}>
            <Statistic title="冻结" value={yuan(walletQ.data.frozen_cents)} prefix="¥" valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
          </Card>
          <Card style={{ borderColor: '#e8eaed' }}>
            <Statistic title="累计充值" value={yuan(walletQ.data.total_recharged_cents)} prefix="¥" valueStyle={{ color: '#188038', fontVariantNumeric: 'tabular-nums' }} />
          </Card>
          <Card style={{ borderColor: '#e8eaed' }}>
            <Statistic title="累计消费" value={yuan(walletQ.data.total_consumed_cents)} prefix="¥" valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
          </Card>
        </div>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 500, color: '#202124', marginBottom: 12 }}>最近流水</h3>
      {ledgerQ.data && ledgerQ.data.length === 0 && <Empty description="暂无记录" />}
      {ledgerQ.data && ledgerQ.data.length > 0 && (
        <Table columns={columns} dataSource={ledgerQ.data} rowKey="id" size="small" pagination={{ pageSize: 20 }} />
      )}
    </div>
  );
}
