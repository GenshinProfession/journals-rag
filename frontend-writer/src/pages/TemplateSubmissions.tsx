import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { apiFetch } from '../api/client';
import { SubmitTemplateModal } from '../components/SubmitTemplateModal';

const { Title, Text } = Typography;

interface TemplateSubmission {
  id: string;
  school_name: string;
  degree_level: string;
  discipline: string | null;
  citation_style: string | null;
  status: string;
  token_reward: number | null;
  review_notes: string | null;
  created_at: string;
  file_name: string;
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

export function TemplateSubmissions() {
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['writer', 'template-submissions'],
    queryFn: () => apiFetch('/api/template-submissions/mine') as Promise<TemplateSubmission[]>,
  });

  const columns = [
    {
      title: '学校',
      dataIndex: 'school_name',
      key: 'school_name',
      width: 180,
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
      width: 120,
      render: (v: string | null) => v || '-',
    },
    {
      title: '引用格式',
      dataIndex: 'citation_style',
      key: 'citation_style',
      width: 100,
      render: (v: string | null) => v || '-',
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
      title: '奖励',
      dataIndex: 'token_reward',
      key: 'token_reward',
      width: 100,
      render: (v: number | null, row: TemplateSubmission) => {
        if (row.status !== 'approved' || !v) return '-';
        return <Text type="success">+{(v / 100).toFixed(2)} 元</Text>;
      },
    },
    {
      title: '审核意见',
      dataIndex: 'review_notes',
      key: 'review_notes',
      ellipsis: true,
      render: (v: string | null, row: TemplateSubmission) => {
        if (row.status !== 'rejected' || !v) return '-';
        return <Text type="danger">{v}</Text>;
      },
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div style={{ padding: '24px 0' }}>
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>我的模板贡献</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              上传学校论文格式模板，审核通过后可获得 token 奖励
            </Text>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowSubmitModal(true)}
          >
            上传模板
          </Button>
        }
      >
        <Table
          dataSource={submissions ?? []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          locale={{
            emptyText: (
              <Empty description="还没有提交过模板">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setShowSubmitModal(true)}
                >
                  上传第一个模板
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <SubmitTemplateModal
        open={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
      />
    </div>
  );
}
