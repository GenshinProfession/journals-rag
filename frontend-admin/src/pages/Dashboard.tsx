import { useQuery } from '@tanstack/react-query';
import { Col, Row, Spin, Tag } from 'antd';
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

function StatCard({ title, value, sub, color }: {
  title: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      padding: '20px 24px',
      borderRadius: 8,
      border: '1px solid #e8eaed',
      background: '#fff',
      height: '100%',
    }}>
      <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 8 }}>{title}</div>
      <div style={{
        fontSize: 28, fontWeight: 400, fontVariantNumeric: 'tabular-nums',
        color: color ?? '#202124', lineHeight: 1.2,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#9aa0a6', marginTop: 6 }}>{sub}</div>}
    </div>
  );
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

  const o = overviewQ.data;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>概览</h2>
        <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
          {isLoading ? '加载中…' : me ? (
            <>当前登录：{me.username} <Tag style={{ marginLeft: 4, verticalAlign: 'text-bottom' }}>{me.role}</Tag></>
          ) : '系统关键指标。'}
        </p>
      </div>

      {!o && overviewQ.isLoading && (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      )}

      {o && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} lg={6}>
              <StatCard
                title="Writer 总数"
                value={o.writer_count}
                sub={`${o.active_writer_count} 活跃`}
              />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard title="启用模型" value={o.enabled_model_count} />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard title="AI 调用次数" value={o.usage_count.toLocaleString()} />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard title="余额" value={`¥${yuan(o.balance_cents)}`} color="#1a73e8" />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={12} lg={8}>
              <StatCard title="冻结金额" value={`¥${yuan(o.frozen_cents)}`} color="#f9ab00" />
            </Col>
            <Col xs={12} lg={8}>
              <StatCard title="累计充值" value={`¥${yuan(o.recharged_cents)}`} color="#34a853" />
            </Col>
            <Col xs={12} lg={8}>
              <StatCard title="累计消费" value={`¥${yuan(o.consumed_cents)}`} color="#ea4335" />
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
