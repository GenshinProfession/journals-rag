import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Input, Segmented, Space, Table, Tag, Typography, message } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  FileAddOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../api/client';

type ProjectRow = {
  id: string;
  degree_level: string;
  discipline: string;
  title: string | null;
  topic: string | null;
  status: string;
  word_count_total: number;
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  literature_ready: { color: 'blue', label: '文献就绪' },
  outline_ready: { color: 'cyan', label: '大纲就绪' },
  writing: { color: 'processing', label: '写作中' },
  review: { color: 'orange', label: '审校中' },
  completed: { color: 'success', label: '已完成' },
};

const DEGREE_LABEL: Record<string, string> = {
  bachelor: '本科',
  master: '硕士',
  doctor: '博士',
};

export function Workspace() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const listQ = useQuery({
    queryKey: ['writer', 'projects'],
    queryFn: () => apiFetch('/api/projects') as Promise<ProjectRow[]>,
  });

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((p) => {
      const hay = [p.discipline, p.title, p.topic, p.status].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [listQ.data, q]);

  const recent = filtered.slice(0, 8);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Hero */}
      <Card
        bordered={false}
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #f8f9fa 0%, #eef1f6 100%)',
          borderRadius: 12,
          border: '1px solid #e8eaed',
        }}
        styles={{ body: { padding: '28px 32px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <Typography.Title level={3} style={{ margin: '0 0 8px', fontWeight: 600, color: '#202124' }}>
              从选题到成稿，一站完成
            </Typography.Title>
            <Typography.Paragraph style={{ margin: 0, color: '#5f6368', fontSize: 15, maxWidth: 520 }}>
              标准参考论文审核 → RAG 入库 → 大纲与章节生成 → 导出。创建论文项目后，在同一套流程里连续完成，无需在「项目 / 向导」之间来回切。
            </Typography.Paragraph>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => nav('/work/new')}
              style={{ marginTop: 20, height: 44, paddingLeft: 28, paddingRight: 28, fontWeight: 500 }}
            >
              创建论文项目
            </Button>
          </div>
          <div
            style={{
              width: 200,
              height: 120,
              borderRadius: 12,
              background: '#fff',
              border: '1px dashed #dadce0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9aa0a6',
              fontSize: 13,
            }}
          >
            ThesisLoom Writer
          </div>
        </div>
      </Card>

      {/* Quick access */}
      <Typography.Title level={5} style={{ marginBottom: 12, fontWeight: 600, color: '#202124' }}>
        快捷入口
      </Typography.Title>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <Card
          hoverable
          onClick={() => nav('/work/new')}
          styles={{ body: { padding: 20 } }}
          style={{ borderColor: '#e8eaed', cursor: 'pointer', borderRadius: 10 }}
        >
          <FileAddOutlined style={{ fontSize: 28, color: '#1a73e8', display: 'block', marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: '#202124', marginBottom: 4 }}>新建论文项目</div>
          <div style={{ fontSize: 13, color: '#5f6368' }}>填写学科、学校模板与题目，进入完整写作流程。</div>
        </Card>
        <Card
          hoverable
          onClick={() => {
            if (recent[0]) nav(`/work/${recent[0].id}`);
            else message.info('请先创建论文项目');
          }}
          styles={{ body: { padding: 20 } }}
          style={{ borderColor: '#e8eaed', cursor: 'pointer', borderRadius: 10 }}
        >
          <RocketOutlined style={{ fontSize: 28, color: '#1a73e8', display: 'block', marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: '#202124', marginBottom: 4 }}>继续写作</div>
          <div style={{ fontSize: 13, color: '#5f6368' }}>
            {recent[0] ? `打开最近：${recent[0].title || recent[0].discipline}` : '尚无项目，请先创建。'}
          </div>
        </Card>
        <Card
          hoverable
          onClick={() => nav('/guide')}
          styles={{ body: { padding: 20 } }}
          style={{ borderColor: '#e8eaed', cursor: 'pointer', borderRadius: 10 }}
        >
          <BookOutlined style={{ fontSize: 28, color: '#1a73e8', display: 'block', marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: '#202124', marginBottom: 4 }}>使用教程</div>
          <div style={{ fontSize: 13, color: '#5f6368' }}>按步骤说明如何准备文献、审核与导出。</div>
        </Card>
      </div>

      {/* Recent */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <Typography.Title level={5} style={{ margin: 0, fontWeight: 600, color: '#202124' }}>
          我的论文项目
        </Typography.Title>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索项目（学科、题目、状态）"
            onSearch={setQ}
            onChange={(e) => setQ(e.target.value)}
            value={q}
            style={{ width: 280 }}
          />
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'list' | 'grid')}
            options={[
              { value: 'list', icon: <UnorderedListOutlined /> },
              { value: 'grid', icon: <AppstoreOutlined /> },
            ]}
          />
        </Space>
      </div>

      {listQ.isLoading && <Typography.Text type="secondary">加载中…</Typography.Text>}

      {!listQ.isLoading && filtered.length === 0 && (
        <Card style={{ borderRadius: 10 }}>
          <Empty description={q ? '没有匹配的项目' : '暂无项目，从上方开始创建'}>
            {!q && (
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => nav('/work/new')}>
                创建论文项目
              </Button>
            )}
          </Empty>
        </Card>
      )}

      {!listQ.isLoading && filtered.length > 0 && view === 'list' && (
        <Table<ProjectRow>
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 12, showSizeChanger: true }}
          onRow={(record) => ({
            onClick: () => nav(`/work/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: '学科 / 方向',
              dataIndex: 'discipline',
              ellipsis: true,
              render: (t: string, p) => (
                <Space>
                  <BookOutlined style={{ color: '#1a73e8' }} />
                  <span style={{ fontWeight: 500 }}>{t}</span>
                  {p.title && <span style={{ color: '#5f6368', fontWeight: 400 }}>· {p.title}</span>}
                </Space>
              ),
            },
            {
              title: '层次',
              dataIndex: 'degree_level',
              width: 88,
              render: (v: string) => DEGREE_LABEL[v] ?? v,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: (s: string) => {
                const st = STATUS_MAP[s] ?? { color: 'default', label: s };
                return <Tag color={st.color}>{st.label}</Tag>;
              },
            },
            {
              title: '字数',
              dataIndex: 'word_count_total',
              width: 100,
              align: 'right',
              render: (n: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</span>,
            },
            {
              title: '操作',
              key: 'go',
              width: 120,
              render: (_, p) => (
                <Button type="link" onClick={(e) => { e.stopPropagation(); nav(`/work/${p.id}`); }}>
                  进入写作
                </Button>
              ),
            },
          ]}
          dataSource={filtered}
        />
      )}

      {!listQ.isLoading && filtered.length > 0 && view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map((p) => {
            const st = STATUS_MAP[p.status] ?? { color: 'default', label: p.status };
            return (
              <Card key={p.id} hoverable onClick={() => nav(`/work/${p.id}`)} style={{ borderColor: '#e8eaed', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: '#202124' }}>{p.discipline}</span>
                  <Tag color={st.color}>{st.label}</Tag>
                </div>
                {p.title && <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 8 }}>{p.title}</div>}
                <div style={{ fontSize: 12, color: '#9aa0a6', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{DEGREE_LABEL[p.degree_level] ?? p.degree_level}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.word_count_total.toLocaleString()} 字</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
