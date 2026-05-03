import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Col, Input, Row, Select, Table, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts';
import { apiFetch } from '../api/client';

type UsageRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  model_id: string | null;
  agent_name: string;
  scenario: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  status: string;
  created_at: string | null;
};

type DailyStat = {
  day: string;
  count: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
};

type UserRow = { id: string; username: string; role: string; nickname: string | null };

const SCENARIO_OPTIONS = [
  { label: '全部场景', value: '' },
  { label: '文献综述', value: 'reference_review' },
  { label: 'RAG 检索', value: 'rag' },
  { label: '大纲生成', value: 'outline' },
  { label: '章节写作', value: 'chapter_write' },
  { label: '章节审阅', value: 'chapter_review' },
  { label: '章节改写', value: 'chapter_rewrite' },
];

const SCENARIO_LABEL: Record<string, string> = {};
SCENARIO_OPTIONS.forEach(o => { if (o.value) SCENARIO_LABEL[o.value] = o.label; });

function centsToYuan(c: number) { return (c / 100).toFixed(2); }

export function Usage() {
  const [userId, setUserId] = useState('');
  const [scenario, setScenario] = useState('');
  const [search, setSearch] = useState('');

  const usersQ = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });

  const writers = (usersQ.data ?? []).filter(u => u.role === 'writer');
  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    (usersQ.data ?? []).forEach(u => { m[u.id] = u.nickname || u.username; });
    return m;
  }, [usersQ.data]);

  const statsQ = useQuery({
    queryKey: ['admin', 'usage-daily', userId, scenario],
    queryFn: () => {
      const p = new URLSearchParams({ days: '30' });
      if (userId) p.set('user_id', userId);
      if (scenario) p.set('scenario', scenario);
      return apiFetch(`/api/admin/billing/usage/daily-stats?${p}`) as Promise<DailyStat[]>;
    }
  });

  const listQ = useQuery({
    queryKey: ['admin', 'usage', userId],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '500' });
      if (userId) p.set('user_id', userId);
      return apiFetch(`/api/admin/billing/usage?${p}`) as Promise<UsageRow[]>;
    }
  });

  const filteredList = useMemo(() => {
    let items = listQ.data ?? [];
    if (scenario) items = items.filter(r => r.scenario === scenario);
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(r =>
        r.agent_name.toLowerCase().includes(q) ||
        r.scenario.toLowerCase().includes(q) ||
        (userMap[r.user_id] ?? '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return items;
  }, [listQ.data, scenario, search, userMap]);

  const chartData = statsQ.data ?? [];

  const columns: ColumnsType<UsageRow> = [
    {
      title: '用户', dataIndex: 'user_id', width: 120, ellipsis: true,
      render: (id: string) => userMap[id] || id.slice(0, 8)
    },
    {
      title: '场景', dataIndex: 'scenario', width: 100,
      render: (v: string) => <Tag>{SCENARIO_LABEL[v] || v}</Tag>
    },
    { title: 'Agent', dataIndex: 'agent_name', width: 130, ellipsis: true },
    {
      title: 'Input', dataIndex: 'input_tokens', width: 90, align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString()}</span>
    },
    {
      title: 'Output', dataIndex: 'output_tokens', width: 90, align: 'right',
      render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString()}</span>
    },
    {
      title: '费用', dataIndex: 'cost_cents', width: 80, align: 'right',
      render: (c: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{centsToYuan(c)}</span>
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag>{v}</Tag>
    },
    {
      title: '时间', dataIndex: 'created_at', width: 150, ellipsis: true,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '—'
    },
    {
      title: 'ID', dataIndex: 'id', width: 100, ellipsis: true,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {id.slice(0, 8)}
        </Typography.Text>
      )
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>AI 调用记录</h2>
        <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
          按用户、场景筛选调用趋势与明细。
        </p>
      </div>

      {/* Filters */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8} lg={6}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择用户"
            allowClear
            showSearch
            optionFilterProp="label"
            value={userId || undefined}
            onChange={v => setUserId(v ?? '')}
            options={writers.map(u => ({ label: u.nickname || u.username, value: u.id }))}
          />
        </Col>
        <Col xs={24} sm={6} lg={4}>
          <Select
            style={{ width: '100%' }}
            value={scenario}
            onChange={v => setScenario(v)}
            options={SCENARIO_OPTIONS}
          />
        </Col>
        <Col xs={24} sm={10} lg={6}>
          <Input
            prefix={<SearchOutlined style={{ color: '#9aa0a6' }} />}
            placeholder="搜索 agent / 场景 / 用户"
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
          />
        </Col>
      </Row>

      {/* Chart */}
      {chartData.length > 0 && (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, padding: '20px 20px 8px', marginBottom: 24, background: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16, color: '#202124' }}>
            调用趋势（最近 30 天）
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <RTooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="调用次数" stroke="#1a73e8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cost_cents" name="费用(分)" stroke="#ea4335" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <Table<UsageRow>
        rowKey="id"
        size="small"
        loading={listQ.isLoading}
        columns={columns}
        dataSource={filteredList}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
        scroll={{ x: 900 }}
        style={{ borderRadius: 8 }}
      />
    </div>
  );
}
