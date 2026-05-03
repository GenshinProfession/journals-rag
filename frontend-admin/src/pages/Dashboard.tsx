import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

type Me = { id: string; username: string; role: string };
type Overview = {
  writer_count: number;
  active_writer_count: number;
  enabled_model_count: number;
  usage_count: number;
  balance_cents: number;
  frozen_cents: number;
  recharged_cents: number;
  consumed_cents: number;
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

export function Dashboard() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me') as Promise<Me>
  });
  const overviewQ = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiFetch('/api/admin/overview') as Promise<Overview>
  });

  return (
    <section>
      <h2>后台概览</h2>
      {isLoading && <p>加载中…</p>}
      {me && (
        <p>
          当前登录：<strong>{me.username}</strong>（{me.role}）
        </p>
      )}
      <p>左侧菜单可管理代写账号、人工充值与模型目录。</p>
      {overviewQ.data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div className="notice">Writer：{overviewQ.data.active_writer_count}/{overviewQ.data.writer_count}</div>
          <div className="notice">启用模型：{overviewQ.data.enabled_model_count}</div>
          <div className="notice">AI 调用：{overviewQ.data.usage_count}</div>
          <div className="notice">余额：¥{yuan(overviewQ.data.balance_cents)}</div>
          <div className="notice">冻结：¥{yuan(overviewQ.data.frozen_cents)}</div>
          <div className="notice">累计充值：¥{yuan(overviewQ.data.recharged_cents)}</div>
          <div className="notice">累计消费：¥{yuan(overviewQ.data.consumed_cents)}</div>
        </div>
      )}
    </section>
  );
}
