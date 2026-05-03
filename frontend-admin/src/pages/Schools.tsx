import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Empty, Input, InputNumber, Modal, Popconfirm,
  Row, Tag, Tooltip, Typography, Upload, message
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, StopOutlined,
  CheckCircleOutlined, UploadOutlined, FileTextOutlined
} from '@ant-design/icons';
import { apiFetch } from '../api/client';

type SchoolTemplate = {
  id: string;
  name: string;
  degree_level: string | null;
  discipline: string | null;
  citation_style: string | null;
  word_count_min: number | null;
  word_count_max: number | null;
  formatting_rules: string | null;
  enabled: boolean;
};

const EMPTY_FORM = {
  name: '',
  degreeLevel: '',
  discipline: '',
  citationStyle: '',
  minWords: '' as string | number,
  maxWords: '' as string | number,
  formattingRules: '',
};

export function Schools() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolTemplate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'schools'],
    queryFn: () => apiFetch('/api/admin/schools') as Promise<SchoolTemplate[]>
  });

  const saveMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (editing) {
        return apiFetch(`/api/admin/schools/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }
      return apiFetch('/api/admin/schools', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'schools'] });
      message.success(editing ? '已更新' : '已创建');
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message)
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/schools/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'schools'] }); message.success('已删除'); },
    onError: (e: Error) => message.error(e.message)
  });

  const toggleMut = useMutation({
    mutationFn: (item: SchoolTemplate) =>
      apiFetch(`/api/admin/schools/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !item.enabled })
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'schools'] }); message.success('已切换'); },
    onError: (e: Error) => message.error(e.message)
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: SchoolTemplate) => {
    setEditing(item);
    setForm({
      name: item.name,
      degreeLevel: item.degree_level ?? '',
      discipline: item.discipline ?? '',
      citationStyle: item.citation_style ?? '',
      minWords: item.word_count_min ?? '',
      maxWords: item.word_count_max ?? '',
      formattingRules: item.formatting_rules ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) { setFormError('模板名称不能为空'); return; }
    saveMut.mutate({
      name: form.name.trim(),
      degree_level: form.degreeLevel.trim() || null,
      discipline: form.discipline.trim() || null,
      citation_style: form.citationStyle.trim() || null,
      word_count_min: form.minWords !== '' ? Number(form.minWords) : null,
      word_count_max: form.maxWords !== '' ? Number(form.maxWords) : null,
      formatting_rules: form.formattingRules.trim() || null,
      enabled: editing ? editing.enabled : true
    });
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setForm(f => ({ ...f, formattingRules: text }));
        message.success(`已读取 ${file.name}`);
      }
    };
    reader.readAsText(file);
    return false;
  };

  const F = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: '#1f1f1f', fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>学校模板</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            维护学校/专业的格式、引用和字数规则，writer 新建项目时可选择。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模板</Button>
      </div>

      {listQ.isLoading && <Card loading style={{ borderRadius: 12 }} />}
      {!listQ.isLoading && (!listQ.data || listQ.data.length === 0) && (
        <Empty description="暂无模板" style={{ padding: 60 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建第一个模板</Button>
        </Empty>
      )}

      <Row gutter={[16, 16]}>
        {(listQ.data ?? []).map(item => (
          <Col key={item.id} xs={24} sm={12} lg={8} xl={6}>
            <Card
              hoverable
              style={{
                borderRadius: 12,
                opacity: item.enabled ? 1 : 0.6,
                transition: 'box-shadow 0.2s, opacity 0.2s',
              }}
              styles={{ body: { padding: '20px 20px 16px' } }}
              actions={[
                <Tooltip title="编辑" key="edit">
                  <EditOutlined onClick={() => openEdit(item)} />
                </Tooltip>,
                <Tooltip title={item.enabled ? '禁用' : '启用'} key="toggle">
                  {item.enabled
                    ? <StopOutlined style={{ color: '#faad14' }} onClick={() => toggleMut.mutate(item)} />
                    : <CheckCircleOutlined style={{ color: '#52c41a' }} onClick={() => toggleMut.mutate(item)} />
                  }
                </Tooltip>,
                <Popconfirm title="确认删除？" onConfirm={() => deleteMut.mutate(item.id)} key="del">
                  <DeleteOutlined style={{ color: '#ff4d4f' }} />
                </Popconfirm>,
              ]}
            >
              <div style={{ marginBottom: 10 }}>
                <Typography.Text strong style={{ fontSize: 15 }}>{item.name}</Typography.Text>
                {!item.enabled && <Tag color="red" style={{ marginLeft: 8, verticalAlign: 'text-top' }}>已禁用</Tag>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#71717a' }}>
                <div>
                  <span style={{ color: '#999', marginRight: 6 }}>层次</span>
                  {item.degree_level || '通用'}
                  <span style={{ margin: '0 8px', color: '#e5e5e5' }}>|</span>
                  <span style={{ color: '#999', marginRight: 6 }}>专业</span>
                  {item.discipline || '通用'}
                </div>
                {item.citation_style && (
                  <div>
                    <span style={{ color: '#999', marginRight: 6 }}>引用</span>
                    {item.citation_style}
                  </div>
                )}
                {(item.word_count_min || item.word_count_max) && (
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: '#999', marginRight: 6 }}>字数</span>
                    {item.word_count_min ?? '—'} – {item.word_count_max ?? '—'}
                  </div>
                )}
                {item.formatting_rules && (
                  <div style={{ marginTop: 4 }}>
                    <Tag icon={<FileTextOutlined />} color="blue">已配置格式规则</Tag>
                  </div>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title={editing ? `编辑 — ${editing.name}` : '新增模板'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSave}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={saveMut.isPending}
        width={540}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0 4px' }}>
          <F label="模板名称" required>
            <Input size="large" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例如 清华大学 MBA" />
          </F>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <F label="层次">
                <Input value={form.degreeLevel} onChange={e => setForm(f => ({ ...f, degreeLevel: e.target.value }))} placeholder="master" />
              </F>
            </div>
            <div style={{ flex: 1 }}>
              <F label="专业/方向">
                <Input value={form.discipline} onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))} />
              </F>
            </div>
          </div>
          <F label="引用格式">
            <Input value={form.citationStyle} onChange={e => setForm(f => ({ ...f, citationStyle: e.target.value }))} placeholder="GB/T 7714" />
          </F>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <F label="最少字数">
                <InputNumber style={{ width: '100%' }} value={form.minWords !== '' ? Number(form.minWords) : undefined} min={0} onChange={v => setForm(f => ({ ...f, minWords: v ?? '' }))} />
              </F>
            </div>
            <div style={{ flex: 1 }}>
              <F label="最多字数">
                <InputNumber style={{ width: '100%' }} value={form.maxWords !== '' ? Number(form.maxWords) : undefined} min={0} onChange={v => setForm(f => ({ ...f, maxWords: v ?? '' }))} />
              </F>
            </div>
          </div>
          <F label="格式规则">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Upload beforeUpload={handleFileUpload} accept=".txt,.md,.json" showUploadList={false} maxCount={1}>
                <Button icon={<UploadOutlined />} size="small">上传规则文件（.txt / .md / .json）</Button>
              </Upload>
              <Input.TextArea
                rows={4}
                value={form.formattingRules}
                onChange={e => setForm(f => ({ ...f, formattingRules: e.target.value }))}
                placeholder="直接输入或上传文件后自动填充"
                style={{ fontSize: 13 }}
              />
            </div>
          </F>
          {formError && <div className="alert alert--error" style={{ marginBottom: 0 }}>{formError}</div>}
        </div>
      </Modal>
    </div>
  );
}
