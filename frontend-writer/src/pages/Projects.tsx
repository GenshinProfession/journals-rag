import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Form, Input, Modal, Select, Space, Tag, Tooltip } from 'antd';
import { PlusOutlined, RocketOutlined, BookOutlined } from '@ant-design/icons';
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

type SchoolTemplate = {
  id: string;
  name: string;
  degree_level: string | null;
  discipline: string | null;
  citation_style: string | null;
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  literature_ready: { color: 'blue', label: '文献就绪' },
  outline_ready: { color: 'cyan', label: '大纲就绪' },
  writing: { color: 'processing', label: '写作中' },
  review: { color: 'orange', label: '审校中' },
  completed: { color: 'success', label: '已完成' },
};

const DEGREE_OPTIONS = [
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'doctor', label: '博士' },
];

export function Projects() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const listQ = useQuery({
    queryKey: ['writer', 'projects'],
    queryFn: () => apiFetch('/api/projects') as Promise<ProjectRow[]>,
  });

  const schoolsQ = useQuery({
    queryKey: ['writer', 'school-templates'],
    queryFn: () => apiFetch('/api/school-templates') as Promise<SchoolTemplate[]>,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['writer', 'projects'] });
      setOpen(false);
      form.resetFields();
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

  const projects = listQ.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: '#202124' }}>我的项目</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5f6368' }}>
            创建项目后进入论文向导，完成参考文献审核与章节生成。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新建项目
        </Button>
      </div>

      {listQ.isLoading && <p style={{ color: '#5f6368' }}>加载中…</p>}

      {!listQ.isLoading && projects.length === 0 && (
        <Card style={{ textAlign: 'center', padding: '48px 0' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有项目"
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              创建第一个项目
            </Button>
          </Empty>
        </Card>
      )}

      {projects.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map((p) => {
            const st = STATUS_MAP[p.status] ?? { color: 'default', label: p.status };
            return (
              <Card
                key={p.id}
                hoverable
                onClick={() => nav(`/wizard/${p.id}`)}
                style={{ borderColor: '#e8eaed', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOutlined style={{ color: '#1a73e8', fontSize: 16 }} />
                    <span style={{ fontWeight: 500, fontSize: 15, color: '#202124' }}>{p.discipline}</span>
                  </div>
                  <Tag color={st.color}>{st.label}</Tag>
                </div>
                {p.title && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#5f6368' }}>{p.title}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#9aa0a6' }}>
                  <span>{DEGREE_OPTIONS.find(d => d.value === p.degree_level)?.label ?? p.degree_level}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.word_count_total.toLocaleString()} 字</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="新建项目"
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); createMut.reset(); }}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ degree_level: 'master' }} style={{ marginTop: 16 }}>
          <Form.Item name="degree_level" label="层次" rules={[{ required: true }]}>
            <Select options={DEGREE_OPTIONS} />
          </Form.Item>
          <Form.Item name="discipline" label="学科 / 方向" rules={[{ required: true, message: '请填写学科或方向关键词' }]}>
            <Input placeholder="如: 计算机科学、教育学" />
          </Form.Item>
          <Form.Item name="school_id" label="学校模板（可选）">
            <Select allowClear placeholder="不使用模板" loading={schoolsQ.isLoading}>
              {schoolsQ.data?.map(t => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name} · {t.degree_level || '通用'} · {t.citation_style || '未设引用'}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="title" label="论文题目（可选）">
            <Input placeholder="选填，后续可在向导中修改" />
          </Form.Item>
          <Form.Item name="topic" label="主题说明（可选）">
            <Input.TextArea rows={3} placeholder="简要描述研究方向或要求" />
          </Form.Item>
          {createMut.isError && (
            <div style={{ color: '#d93025', fontSize: 13, marginBottom: 12 }}>
              {(createMut.error as Error).message}
            </div>
          )}
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setOpen(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={createMut.isPending} icon={<RocketOutlined />}>
                创建项目
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
