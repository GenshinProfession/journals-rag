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
    <div className="panel stack">
      <div>
        <h2>后台概览</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          左侧导航管理代写账号、人工充值、模型目录与学校模板。
        </p>
      </div>

      {isLoading && (
        <div className="alert" style={{ marginBottom: 0 }}>
          正在加载账号信息…
        </div>
      )}

      {me && (
        <div className="alert" style={{ marginBottom: 0 }}>
          当前登录：<strong>{me.username}</strong>
          <span className="badge" style={{ marginLeft: 10 }}>
            {me.role}
          </span>
        </div>
      )}

      {overviewQ.data && (
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile__label">Writer 活跃 / 总数</div>
            <div className="stat-tile__value">
              {overviewQ.data.active_writer_count}/{overviewQ.data.writer_count}
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">启用模型</div>
            <div className="stat-tile__value">{overviewQ.data.enabled_model_count}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">AI 调用累计</div>
            <div className="stat-tile__value">{overviewQ.data.usage_count}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">余额（元）</div>
            <div className="stat-tile__value">¥{yuan(overviewQ.data.balance_cents)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">冻结（元）</div>
            <div className="stat-tile__value">¥{yuan(overviewQ.data.frozen_cents)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">累计充值</div>
            <div className="stat-tile__value">¥{yuan(overviewQ.data.recharged_cents)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">累计消费</div>
            <div className="stat-tile__value">¥{yuan(overviewQ.data.consumed_cents)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
