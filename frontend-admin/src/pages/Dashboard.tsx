import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Spin, Tag } from 'antd';
import {
  UserOutlined, ThunderboltOutlined, DollarOutlined, WalletOutlined,
  CloudServerOutlined, FundOutlined, PauseCircleOutlined
} from '@ant-design/icons';
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

const cardStyle: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid #f0f0f0',
  boxShadow: '0 1px 3px rgba(0,0,0,.04)',
  height: '100%',
};

function StatCard({ title, value, prefix, suffix, color, sub }: {
  title: string; value: string | number; prefix: React.ReactNode;
  suffix?: string; color?: string; sub?: string;
}) {
  return (
    <Card style={cardStyle} styles={{ body: { padding: '20px 24px' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 13, color: '#71717a', marginBottom: 8 }}>{title}</div>
        <span style={{ fontSize: 18, color: color ?? '#71717a', opacity: 0.6 }}>{prefix}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: color ?? '#18181b', lineHeight: 1.2 }}>
        {value}{suffix && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4, color: '#a1a1aa' }}>{suffix}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 6 }}>{sub}</div>}
    </Card>
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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Dashboard</h2>
        <p style={{ margin: '6px 0 0', color: '#71717a', fontSize: 13 }}>
          {isLoading ? '加载中…' : me ? (
            <>当前登录：<strong>{me.username}</strong> <Tag color="blue" style={{ marginLeft: 4, verticalAlign: 'text-bottom' }}>{me.role}</Tag></>
          ) : '系统概览与关键指标。'}
        </p>
      </div>

      {!o && overviewQ.isLoading && (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      )}

      {o && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={12} lg={6}>
              <StatCard
                title="Writer 总数"
                value={o.writer_count}
                prefix={<UserOutlined />}
                sub={`${o.active_writer_count} 活跃`}
                color="#0f766e"
              />
            </Col>
            <Col xs={12} sm={12} lg={6}>
              <StatCard title="启用模型" value={o.enabled_model_count} prefix={<CloudServerOutlined />} color="#3b82f6" />
            </Col>
            <Col xs={12} sm={12} lg={6}>
              <StatCard title="AI 调用次数" value={o.usage_count.toLocaleString()} prefix={<ThunderboltOutlined />} color="#f59e0b" />
            </Col>
            <Col xs={12} sm={12} lg={6}>
              <StatCard title="余额" value={yuan(o.balance_cents)} prefix={<WalletOutlined />} suffix="元" color="#0f766e" />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={12} sm={8} lg={8}>
              <StatCard title="冻结金额" value={yuan(o.frozen_cents)} prefix={<PauseCircleOutlined />} suffix="元" color="#f59e0b" />
            </Col>
            <Col xs={12} sm={8} lg={8}>
              <StatCard title="累计充值" value={yuan(o.recharged_cents)} prefix={<DollarOutlined />} suffix="元" color="#22c55e" />
            </Col>
            <Col xs={12} sm={8} lg={8}>
              <StatCard title="累计消费" value={yuan(o.consumed_cents)} prefix={<FundOutlined />} suffix="元" color="#ef4444" />
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
