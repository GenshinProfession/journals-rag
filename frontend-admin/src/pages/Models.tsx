import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { apiFetch } from '../api/client';

type ModelRow = {
  id: string;
  display_name: string;
  provider: string;
  provider_model: string;
  endpoint_type: string;
  api_key_name: string | null;
  input_price_per_1k_cents: number;
  output_price_per_1k_cents: number;
  enabled: boolean;
  allowed_scenarios: string[];
  sort_order: number;
};

const ENDPOINT_OPTIONS = [
  { label: 'openai_chat (/v1/chat/completions)', value: 'openai_chat' },
  { label: 'openai_responses (/v1/responses)', value: 'openai_responses' },
  { label: 'gemini_generate_content', value: 'gemini_generate_content' },
  { label: 'anthropic_messages (/v1/messages)', value: 'anthropic_messages' },
];

const SCENARIO_OPTIONS = [
  { label: '文献综述', value: 'reference_review' },
  { label: 'RAG 检索', value: 'rag' },
  { label: '大纲生成', value: 'outline' },
  { label: '章节写作', value: 'chapter_write' },
  { label: '章节审阅', value: 'chapter_review' },
  { label: '章节改写', value: 'chapter_rewrite' },
];

const EMPTY_FORM = {
  displayName: '',
  providerModel: '',
  endpointType: 'openai_chat',
  apiKeyName: '',
  inputPrice: '',
  outputPrice: '',
  scenarios: [] as string[],
};

export function Models() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: () => apiFetch('/api/admin/models') as Promise<ModelRow[]>
  });

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (editing) {
        return apiFetch(`/api/admin/models/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      return apiFetch('/api/admin/models', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'models'] });
      message.success(editing ? '已更新' : '已创建');
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message)
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'models'] }); message.success('已删除'); },
    onError: (e: Error) => message.error(e.message)
  });

  const toggleMut = useMutation({
    mutationFn: (model: ModelRow) =>
      apiFetch(`/api/admin/models/${model.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !model.enabled })
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'models'] }); message.success('已切换'); },
    onError: (e: Error) => message.error(e.message)
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (m: ModelRow) => {
    setEditing(m);
    setForm({
      displayName: m.display_name,
      providerModel: m.provider_model,
      endpointType: m.endpoint_type,
      apiKeyName: m.api_key_name ?? '',
      inputPrice: String(m.input_price_per_1k_cents),
      outputPrice: String(m.output_price_per_1k_cents),
      scenarios: m.allowed_scenarios ?? [],
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
    const inp = Number(form.inputPrice);
    const outp = Number(form.outputPrice);
    if (!form.displayName.trim() || !form.providerModel.trim()) {
      setFormError('展示名与中转 model 不能为空');
      return;
    }
    if (!Number.isFinite(inp) || inp < 0 || !Number.isFinite(outp) || outp < 0) {
      setFormError('价格须为非负数（美分/千 token）');
      return;
    }
    saveMut.mutate({
      display_name: form.displayName.trim(),
      provider_model: form.providerModel.trim(),
      endpoint_type: form.endpointType,
      api_key_name: form.apiKeyName.trim() || null,
      input_price_per_1k_cents: Math.round(inp),
      output_price_per_1k_cents: Math.round(outp),
      allowed_scenarios: form.scenarios
    });
  };

  const columns: ColumnsType<ModelRow> = [
    {
      title: '名称', dataIndex: 'display_name', ellipsis: true,
      render: (name: string, m: ModelRow) => (
        <span>
          {name}
          {!m.enabled && <Tag color="red" style={{ marginLeft: 8 }}>已禁用</Tag>}
        </span>
      )
    },
    {
      title: '中继', dataIndex: 'provider_model', width: 180, ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>
    },
    {
      title: '端点', dataIndex: 'endpoint_type', width: 160, ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>
    },
    {
      title: 'Key', dataIndex: 'api_key_name', width: 120, ellipsis: true,
      render: (v: string | null) => v || '默认'
    },
    {
      title: '价格 in/out', key: 'prices', width: 120, align: 'center',
      render: (_: unknown, m: ModelRow) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {m.input_price_per_1k_cents}/{m.output_price_per_1k_cents}
        </span>
      )
    },
    {
      title: '场景', dataIndex: 'allowed_scenarios', width: 140, ellipsis: true,
      render: (sc: string[]) => {
        if (!sc?.length) return '—';
        const labelMap: Record<string, string> = {};
        SCENARIO_OPTIONS.forEach(o => { labelMap[o.value] = o.label; });
        return <Space size={2} wrap>{sc.map(s => <Tag key={s} style={{ margin: 0 }}>{labelMap[s] || s}</Tag>)}</Space>;
      }
    },
    {
      title: '操作', key: 'actions', width: 160, align: 'center', fixed: 'right',
      render: (_: unknown, m: ModelRow) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(m)} />
          </Tooltip>
          <Tooltip title={m.enabled ? '禁用' : '启用'}>
            <Button
              size="small"
              type="text"
              icon={m.enabled ? <StopOutlined style={{ color: '#faad14' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              disabled={toggleMut.isPending}
              onClick={() => toggleMut.mutate(m)}
            />
          </Tooltip>
          <Popconfirm title="确认删除此模型？" onConfirm={() => deleteMut.mutate(m.id)}>
            <Tooltip title="删除">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>模型目录</h2>
          <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
            配置中继模型名、端点类型、单价与可用场景。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模型</Button>
      </div>

      <Table<ModelRow>
        rowKey="id"
        size="middle"
        loading={listQ.isLoading}
        columns={columns}
        dataSource={listQ.data ?? []}
        pagination={false}
        style={{ borderRadius: 8 }}
      />

      <Modal
        title={editing ? `编辑模型：${editing.display_name}` : '新增模型'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSave}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={saveMut.isPending}
        width={560}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <F label="展示名称">
            <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="例如 GPT-4o" />
          </F>
          <F label="provider_model（中继模型名）">
            <Input value={form.providerModel} onChange={e => setForm(f => ({ ...f, providerModel: e.target.value }))} placeholder="gpt-4o" />
          </F>
          <F label="endpoint_type">
            <Select
              style={{ width: '100%' }}
              value={form.endpointType}
              onChange={v => setForm(f => ({ ...f, endpointType: v }))}
              options={ENDPOINT_OPTIONS}
            />
          </F>
          <F label="api_key_name（可空）">
            <Input value={form.apiKeyName} onChange={e => setForm(f => ({ ...f, apiKeyName: e.target.value }))} placeholder="例如 yunwu-chat-a" />
          </F>
          <div style={{ display: 'flex', gap: 12 }}>
            <F label="Input 美分/千 token">
              <InputNumber
                style={{ width: '100%' }}
                value={form.inputPrice ? Number(form.inputPrice) : undefined}
                min={0}
                onChange={v => setForm(f => ({ ...f, inputPrice: v != null ? String(v) : '' }))}
              />
            </F>
            <F label="Output 美分/千 token">
              <InputNumber
                style={{ width: '100%' }}
                value={form.outputPrice ? Number(form.outputPrice) : undefined}
                min={0}
                onChange={v => setForm(f => ({ ...f, outputPrice: v != null ? String(v) : '' }))}
              />
            </F>
          </div>
          <F label="适用场景">
            <Checkbox.Group
              value={form.scenarios}
              onChange={v => setForm(f => ({ ...f, scenarios: v as string[] }))}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {SCENARIO_OPTIONS.map(opt => (
                <Checkbox key={opt.value} value={opt.value}>{opt.label}</Checkbox>
              ))}
            </Checkbox.Group>
          </F>
          {formError && <div className="alert alert--error" style={{ marginBottom: 0 }}>{formError}</div>}
        </div>
      </Modal>
    </div>
  );
}
