import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, message, Select, Space, Typography } from 'antd';
import { ArrowLeftOutlined, RocketOutlined } from '@ant-design/icons';
import { apiFetch } from '../api/client';

type SchoolTemplate = {
  id: string;
  name: string;
  degree_level: string | null;
  discipline: string | null;
  citation_style: string | null;
};

type ProjectResponse = {
  id: string;
};

const DEGREE_OPTIONS = [
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'doctor', label: '博士' },
];

export function NewProject() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const schoolsQ = useQuery({
    queryKey: ['writer', 'school-templates'],
    queryFn: () => apiFetch('/api/school-templates') as Promise<SchoolTemplate[]>,
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

  const onFinish = (values: Record<string, string>) => {
    createMut.mutate({
      degree_level: values.degree_level,
      discipline: values.discipline?.trim(),
      title: values.title?.trim() || null,
      topic: values.topic?.trim() || null,
      school_id: values.school_id || null,
    });
  };

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 48px)',
        maxWidth: 720,
        margin: '0 auto',
        padding: '24px 20px 48px',
      }}
    >
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => nav('/')}
        style={{ marginBottom: 16, color: '#5f6368' }}
      >
        返回工作台
      </Button>

      <Typography.Title level={2} style={{ margin: '0 0 8px', fontWeight: 600, color: '#202124' }}>
        新建论文项目
      </Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 28, color: '#5f6368', fontSize: 15 }}>
        请填写学科与层次；学校模板用于大纲、正文与导出中的格式说明（建议在管理员已为该校配置模板时选择）。
      </Typography.Paragraph>

      <Card bordered={false} style={{ borderRadius: 12, border: '1px solid #e8eaed', boxShadow: '0 1px 2px rgba(60,64,67,0.08)' }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ degree_level: 'master' }} size="large">
          <Form.Item name="degree_level" label="层次" rules={[{ required: true }]}>
            <Select options={DEGREE_OPTIONS} />
          </Form.Item>
          <Form.Item name="discipline" label="学科 / 方向" rules={[{ required: true, message: '请填写学科或方向关键词' }]}>
            <Input placeholder="如：教育学、计算机科学与技术" autoFocus />
          </Form.Item>
          <Form.Item name="school_id" label="学校模板（可选）">
            <Select allowClear placeholder="不使用模板" loading={schoolsQ.isLoading} optionFilterProp="children" showSearch>
              {schoolsQ.data?.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name} · {t.degree_level || '通用'} · {t.citation_style || '未设引用'}
                </Select.Option>
              ))}
            </Select>
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
