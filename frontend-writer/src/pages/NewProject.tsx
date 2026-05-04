import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Cascader, Divider, Empty, Form, Input, message,
  Select, Space, Tag, Typography
} from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled, RocketOutlined } from '@ant-design/icons';
import { apiFetch } from '../api/client';

type School = { id: string; name: string; enabled: boolean };

type TemplateOption = {
  group_id: string; school_id: string; school_name: string;
  degree_level: string; discipline: string | null;
  year: number | null; citation_style: string | null;
  complete: boolean;
};

type ProjectResponse = { id: string };

const DEGREE_OPTIONS = [
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'doctor', label: '博士' },
];

const degreeLabel = (v: string) => DEGREE_OPTIONS.find(o => o.value === v)?.label ?? v;

export function NewProject() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [schoolSearch, setSchoolSearch] = useState('');

  const schoolsQ = useQuery({
    queryKey: ['writer', 'schools'],
    queryFn: () => apiFetch('/api/school-templates/schools') as Promise<School[]>,
  });

  const templatesQ = useQuery({
    queryKey: ['writer', 'templates', selectedSchoolId],
    queryFn: () =>
      apiFetch(`/api/school-templates/schools/${selectedSchoolId}/templates`) as Promise<TemplateOption[]>,
    enabled: !!selectedSchoolId,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) }) as Promise<ProjectResponse>,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['writer', 'projects'] });
      message.success('项目已创建，已进入写作流程');
      nav(`/work/${res.id}`, { replace: true });
    },
  });

  const filteredSchools = (schoolsQ.data ?? []).filter(s => {
    if (!schoolSearch) return true;
    return s.name.toLowerCase().includes(schoolSearch.toLowerCase());
  });

  const onFinish = (values: Record<string, string>) => {
    createMut.mutate({
      degree_level: values.degree_level,
      discipline: values.discipline?.trim(),
      title: values.title?.trim() || null,
      topic: values.topic?.trim() || null,
      school_id: selectedGroupId || null,
    });
  };

  const handleSchoolSelect = (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    setSelectedGroupId(null);
  };

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 48px)',
        maxWidth: 780,
        margin: '0 auto',
        padding: '24px 20px 48px',
      }}
    >
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav('/')} style={{ marginBottom: 16, color: '#5f6368' }}>
        返回工作台
      </Button>

      <Typography.Title level={2} style={{ margin: '0 0 8px', fontWeight: 600, color: '#202124' }}>
        新建论文项目
      </Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 28, color: '#5f6368', fontSize: 15 }}>
        先选择学校和对应模板，再填写论文基本信息。选中的模板将用于大纲生成、格式控制和导出。
      </Typography.Paragraph>

      <Card
        bordered={false}
        style={{ borderRadius: 12, border: '1px solid #e8eaed', boxShadow: '0 1px 2px rgba(60,64,67,0.08)', marginBottom: 20 }}
      >
        <Typography.Title level={5} style={{ margin: '0 0 16px', fontWeight: 500 }}>
          1. 选择学校模板
        </Typography.Title>

        <Select
          placeholder="搜索并选择学校"
          style={{ width: '100%', marginBottom: 16 }}
          loading={schoolsQ.isLoading}
          showSearch
          filterOption={false}
          onSearch={setSchoolSearch}
          value={selectedSchoolId}
          onChange={handleSchoolSelect}
          allowClear
          onClear={() => { setSelectedSchoolId(null); setSelectedGroupId(null); }}
          size="large"
        >
          {filteredSchools.map(s => (
            <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
          ))}
        </Select>

        {selectedSchoolId && templatesQ.isLoading && (
          <Typography.Text type="secondary">加载模板...</Typography.Text>
        )}

        {selectedSchoolId && !templatesQ.isLoading && (templatesQ.data ?? []).length === 0 && (
          <Empty description="该学校暂无可用模板，请联系管理员配置" />
        )}

        {selectedSchoolId && (templatesQ.data ?? []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templatesQ.data!.map(t => (
              <Card
                key={t.group_id}
                hoverable
                size="small"
                onClick={() => setSelectedGroupId(t.group_id)}
                style={{
                  borderRadius: 8,
                  border: selectedGroupId === t.group_id ? '2px solid #1a73e8' : '1px solid #e8eaed',
                  background: selectedGroupId === t.group_id ? '#e8f0fe' : '#fff',
                  cursor: 'pointer',
                  opacity: t.complete ? 1 : 0.6,
                }}
                styles={{ body: { padding: '10px 14px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedGroupId === t.group_id && <CheckCircleFilled style={{ color: '#1a73e8' }} />}
                    <Typography.Text strong>{degreeLabel(t.degree_level)}</Typography.Text>
                    {t.discipline && <Tag>{t.discipline}</Tag>}
                    {t.year && <Tag color="blue">{t.year}</Tag>}
                    {t.citation_style && <Typography.Text type="secondary" style={{ fontSize: 12 }}>引用: {t.citation_style}</Typography.Text>}
                  </div>
                  <div>
                    {t.complete
                      ? <Tag color="green">完整模板</Tag>
                      : <Tag color="orange">模板未完善</Tag>
                    }
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!selectedSchoolId && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            也可以跳过此步骤，直接创建项目（不使用学校模板）
          </Typography.Text>
        )}
      </Card>

      <Card bordered={false} style={{ borderRadius: 12, border: '1px solid #e8eaed', boxShadow: '0 1px 2px rgba(60,64,67,0.08)' }}>
        <Typography.Title level={5} style={{ margin: '0 0 16px', fontWeight: 500 }}>
          2. 论文基本信息
        </Typography.Title>

        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ degree_level: 'master' }} size="large">
          <Form.Item name="degree_level" label="层次" rules={[{ required: true }]}>
            <Select options={DEGREE_OPTIONS} />
          </Form.Item>
          <Form.Item name="discipline" label="学科 / 方向" rules={[{ required: true, message: '请填写学科或方向关键词' }]}>
            <Input placeholder="如：教育学、计算机科学与技术" autoFocus />
          </Form.Item>
          <Form.Item name="title" label="论文题目（可选）">
            <Input placeholder="可后续在写作流中再改" />
          </Form.Item>
          <Form.Item name="topic" label="主题说明（可选）">
            <Input.TextArea rows={4} placeholder="研究问题、方法或导师要求等，便于审核与大纲生成" />
          </Form.Item>
          {createMut.isError && (
            <Typography.Text type="danger" style={{ display: 'block', marginBottom: 16 }}>
              {(createMut.error as Error).message}
            </Typography.Text>
          )}
          <Form.Item style={{ marginBottom: 0 }}>
            <Space size="middle">
              <Button onClick={() => nav('/')}>取消</Button>
              <Button type="primary" htmlType="submit" loading={createMut.isPending} icon={<RocketOutlined />} size="large">
                创建并进入写作
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
