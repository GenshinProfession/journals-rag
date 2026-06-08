import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  InputNumber,
  List,
  message,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { apiFetch } from '../api/client';

const { Text, Title, Paragraph } = Typography;

interface TemplateSubmission {
  id: string;
  user_id: string;
  school_name: string;
  degree_level: string;
  discipline: string | null;
  citation_style: string | null;
  notes: string | null;
  file_name: string;
  status: string;
  token_reward: number | null;
  review_notes: string | null;
  reviewer_id: string | null;
  created_at: string;
  parsed_structure: any;
  parsed_format_rules: any;
  parsed_citation_rules: any;
  parsed_citation_text: string | null;
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'processing', label: '待审核' },
  approved: { color: 'success', label: '已通过' },
  rejected: { color: 'error', label: '已驳回' },
};

const DEGREE_LABELS: Record<string, string> = {
  bachelor: '学士',
  master: '硕士',
  doctor: '博士',
};

export function TemplateReview() {
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(5000);
  const [rejectReason, setRejectReason] = useState('');
  const qc = useQueryClient();

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['admin', 'template-submissions', activeTab],
    queryFn: () => {
      const statusParam = activeTab === 'all' ? '' : `?status=${activeTab}`;
      return apiFetch(`/api/admin/template-submissions${statusParam}`) as Promise<TemplateSubmission[]>;
    },
  });

  const { data: detail } = useQuery({
    queryKey: ['admin', 'template-submission', selectedId],
    queryFn: () => apiFetch(`/api/admin/template-submissions/${selectedId}`) as Promise<TemplateSubmission>,
    enabled: Boolean(selectedId),
  });

  const approveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/template-submissions/${selectedId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ token_reward_cents: rewardAmount }),
      }),
    onSuccess: () => {
      message.success('已批准入库');
      qc.invalidateQueries({ queryKey: ['admin', 'template-submissions'] });
      setSelectedId(null);
      setDrawerOpen(false);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const rejectMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/template-submissions/${selectedId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ review_notes: rejectReason }),
      }),
    onSuccess: () => {
      message.success('已驳回');
      qc.invalidateQueries({ queryKey: ['admin', 'template-submissions'] });
      setSelectedId(null);
      setDrawerOpen(false);
      setRejectReason('');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleViewDetail = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setRejectReason('');
    setRewardAmount(5000);
  };

  const columns = [
    {
      title: '学校',
      dataIndex: 'school_name',
      key: 'school_name',
      width: 160,
    },
    {
      title: '学位',
      dataIndex: 'degree_level',
      key: 'degree_level',
      width: 80,
      render: (v: string) => DEGREE_LABELS[v] || v,
    },
    {
      title: '学科',
      dataIndex: 'discipline',
      key: 'discipline',
      width: 100,
      render: (v: string | null) => v || '-',
    },
    {
      title: '提交者',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 100,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => {
        const st = STATUS_MAP[v] || { color: 'default', label: v };
        return <Tag color={st.color}>{st.label}</Tag>;
      },
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: unknown, row: TemplateSubmission) => (
        <Button type="link" onClick={() => handleViewDetail(row.id)}>
          查看详情
        </Button>
      ),
    },
  ];

  const renderJsonBlock = (label: string, data: any) => {
    if (!data) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <Text strong>{label}</Text>
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
            marginTop: 4,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>模板审核</Title>}
        extra={<Text type="secondary">审核用户提交的学校论文模板</Text>}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'pending', label: '待审核' },
            { key: 'approved', label: '已通过' },
            { key: 'rejected', label: '已驳回' },
            { key: 'all', label: '全部' },
          ]}
        />

        <Table
          dataSource={submissions ?? []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      <Drawer
        title="模板审核详情"
        width={640}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
        }}
      >
        {detail ? (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">学校：</Text>
                  <Text strong>{detail.school_name}</Text>
                </div>
                <div>
                  <Text type="secondary">学位：</Text>
                  <Text>{DEGREE_LABELS[detail.degree_level] || detail.degree_level}</Text>
                </div>
                {detail.discipline && (
                  <div>
                    <Text type="secondary">学科：</Text>
                    <Text>{detail.discipline}</Text>
                  </div>
                )}
                {detail.citation_style && (
                  <div>
                    <Text type="secondary">引用格式：</Text>
                    <Text>{detail.citation_style}</Text>
                  </div>
                )}
                {detail.notes && (
                  <div>
                    <Text type="secondary">备注：</Text>
                    <Text>{detail.notes}</Text>
                  </div>
                )}
                <div>
                  <Text type="secondary">文件：</Text>
                  <Text>{detail.file_name}</Text>
                </div>
              </Space>
            </Card>

            <Title level={5}>AI 预解析结果</Title>
            {renderJsonBlock('结构规则', detail.parsed_structure)}
            {renderJsonBlock('格式规则', detail.parsed_format_rules)}
            {renderJsonBlock('引用规则', detail.parsed_citation_rules)}
            {detail.parsed_citation_text && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>引用原文</Text>
                <Paragraph
                  style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {detail.parsed_citation_text}
                </Paragraph>
              </div>
            )}

            {detail.status === 'pending' && (
              <Card size="small" title="审核操作">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <Text>Token 奖励金额（分）：</Text>
                    <InputNumber
                      value={rewardAmount}
                      onChange={(v) => setRewardAmount(v ?? 5000)}
                      min={0}
                      style={{ width: 160, marginLeft: 8 }}
                    />
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      = {(rewardAmount / 100).toFixed(2)} 元
                    </Text>
                  </div>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={approveMut.isPending}
                    onClick={() => approveMut.mutate()}
                  >
                    批准入库
                  </Button>

                  <div style={{ marginTop: 16 }}>
                    <Text>驳回原因：</Text>
                    <Input.TextArea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="请输入驳回原因"
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    loading={rejectMut.isPending}
                    disabled={!rejectReason.trim()}
                    onClick={() => rejectMut.mutate()}
                  >
                    驳回
                  </Button>
                </Space>
              </Card>
            )}

            {detail.status === 'rejected' && detail.review_notes && (
              <Card size="small" title="驳回原因" style={{ marginTop: 16 }}>
                <Text type="danger">{detail.review_notes}</Text>
              </Card>
            )}

            {detail.status === 'approved' && detail.token_reward && (
              <Card size="small" title="奖励信息" style={{ marginTop: 16 }}>
                <Text type="success">
                  已发放 {(detail.token_reward / 100).toFixed(2)} 元 token 奖励
                </Text>
              </Card>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        )}
      </Drawer>
    </div>
  );
}
