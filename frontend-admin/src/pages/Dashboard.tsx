import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';
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
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>后台概览</h2>
        <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
          {isLoading ? '加载中…' : me ? (
            <>当前登录：<strong>{me.username}</strong> <Tag color="blue" style={{ marginLeft: 4 }}>{me.role}</Tag></>
          ) : '左侧导航管理代写账号、人工充值、模型目录与学校模板。'}
        </p>
      </div>

      {overviewQ.data && (
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="Writer 活跃/总数" value={`${overviewQ.data.active_writer_count}/${overviewQ.data.writer_count}`} prefix={<UserOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="启用模型" value={overviewQ.data.enabled_model_count} prefix={<CloudServerOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="AI 调用累计" value={overviewQ.data.usage_count} prefix={<ThunderboltOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="余额" value={yuan(overviewQ.data.balance_cents)} prefix={<WalletOutlined />} suffix="元" valueStyle={{ color: '#0f766e' }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="冻结" value={yuan(overviewQ.data.frozen_cents)} prefix={<PauseCircleOutlined />} suffix="元" valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="累计充值" value={yuan(overviewQ.data.recharged_cents)} prefix={<DollarOutlined />} suffix="元" />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={6}>
            <Card size="small">
              <Statistic title="累计消费" value={yuan(overviewQ.data.consumed_cents)} prefix={<FundOutlined />} suffix="元" valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
