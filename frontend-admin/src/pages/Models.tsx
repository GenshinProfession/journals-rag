import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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

export function Models() {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [providerModel, setProviderModel] = useState('');
  const [endpointType, setEndpointType] = useState('openai_chat');
  const [apiKeyName, setApiKeyName] = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');
  const [scenarios, setScenarios] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModelRow | null>(null);

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
      setDisplayName('');
      setProviderModel('');
      setEndpointType('openai_chat');
      setApiKeyName('');
      setInputPrice('');
      setOutputPrice('');
      setScenarios('');
      setEditing(null);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message)
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'models'] })
  });

  const toggleMut = useMutation({
    mutationFn: (model: ModelRow) =>
      apiFetch(`/api/admin/models/${model.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !model.enabled })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'models'] }),
    onError: (e: Error) => setFormError(e.message)
  });

  const startEdit = (model: ModelRow) => {
    setEditing(model);
    setDisplayName(model.display_name);
    setProviderModel(model.provider_model);
    setEndpointType(model.endpoint_type);
    setApiKeyName(model.api_key_name ?? '');
    setInputPrice(String(model.input_price_per_1k_cents));
    setOutputPrice(String(model.output_price_per_1k_cents));
    setScenarios(model.allowed_scenarios?.join(', ') ?? '');
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    const inp = Number(inputPrice);
    const outp = Number(outputPrice);
    if (!displayName.trim() || !providerModel.trim()) {
      setFormError('展示名与中转 model 不能为空');
      return;
    }
    if (!Number.isFinite(inp) || inp < 0 || !Number.isFinite(outp) || outp < 0) {
      setFormError('价格须为非负数（美分/千 token）');
      return;
    }
    const allowed = scenarios
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    saveMut.mutate({
      display_name: displayName.trim(),
      provider_model: providerModel.trim(),
      endpoint_type: endpointType,
      api_key_name: apiKeyName.trim() || null,
      input_price_per_1k_cents: Math.round(inp),
      output_price_per_1k_cents: Math.round(outp),
      allowed_scenarios: allowed
    });
  };

  const columns: ColumnsType<ModelRow> = [
    {
      title: '名称',
      dataIndex: 'display_name',
      width: 160,
      ellipsis: true,
      render: (name: string, m: ModelRow) => (
        <span>
          {name}
          {!m.enabled && (
            <Tag color="red" style={{ marginLeft: 8 }}>
              已禁用
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '中继',
      dataIndex: 'provider_model',
      width: 160,
      ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>
    },
    {
      title: '端点',
      dataIndex: 'endpoint_type',
      width: 150,
      ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>
    },
    {
      title: 'Key',
      dataIndex: 'api_key_name',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || '默认'
    },
    {
      title: '价格 in/out',
      key: 'prices',
      width: 120,
      render: (_: unknown, m) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {m.input_price_per_1k_cents}/{m.output_price_per_1k_cents}
        </span>
      )
    },
    {
      title: '场景',
      dataIndex: 'allowed_scenarios',
      width: 140,
      ellipsis: true,
      render: (sc: string[]) => sc?.join(', ') || '—'
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, m) => (
        <Space size={4} wrap>
          <Button type="primary" danger size="small" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(m.id)}>
            删除
          </Button>
          <Button size="small" disabled={toggleMut.isPending} onClick={() => toggleMut.mutate(m)}>
            {m.enabled ? '禁用' : '启用'}
          </Button>
          <Button size="small" onClick={() => startEdit(m)}>
            编辑
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className="panel stack">
      <div>
        <h2>模型目录</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          配置中继模型名、端点类型、单价与可用场景标签。
        </p>
      </div>

      <form className="form-stack form-stack--wide" onSubmit={onCreate}>
        <h3 style={{ marginTop: 0 }}>{editing ? `编辑模型：${editing.display_name}` : '新增模型'}</h3>
        <div className="field">
          <label htmlFor="m-display">展示名称</label>
          <input id="m-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-provider">provider_model（中继模型名）</label>
          <input id="m-provider" value={providerModel} onChange={(e) => setProviderModel(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-endpoint">endpoint_type</label>
          <select id="m-endpoint" value={endpointType} onChange={(e) => setEndpointType(e.target.value)}>
            <option value="openai_chat">openai_chat (/v1/chat/completions)</option>
            <option value="openai_responses">openai_responses (/v1/responses)</option>
            <option value="gemini_generate_content">gemini_generate_content (/v1beta/models/...:generateContent)</option>
            <option value="anthropic_messages">anthropic_messages (/v1/messages)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-key">api_key_name（可空）</label>
          <input
            id="m-key"
            value={apiKeyName}
            onChange={(e) => setApiKeyName(e.target.value)}
            placeholder="例如 yunwu-chat-a"
          />
        </div>
        <div className="field">
          <label htmlFor="m-in">Input 美分/千 token</label>
          <input id="m-in" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-out">Output 美分/千 token</label>
          <input id="m-out" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-sc">适用场景标签（逗号分隔，可空）</label>
          <input id="m-sc" value={scenarios} onChange={(e) => setScenarios(e.target.value)} placeholder="outline, rag" />
        </div>
        {formError && <div className="alert alert--error">{formError}</div>}
        <div className="btn-row">
          <button className="btn btn--primary" type="submit" disabled={saveMut.isPending}>
            {saveMut.isPending ? '保存中…' : '保存模型'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setEditing(null);
                setDisplayName('');
                setProviderModel('');
                setEndpointType('openai_chat');
                setApiKeyName('');
                setInputPrice('');
                setOutputPrice('');
                setScenarios('');
              }}
            >
              取消编辑
            </button>
          )}
        </div>
      </form>

      {listQ.error && <div className="alert alert--error">{(listQ.error as Error).message}</div>}
      <Card size="small" styles={{ body: { padding: 0 } }} className="antd-table-card">
        <Table<ModelRow>
          rowKey="id"
          size="middle"
          loading={listQ.isLoading}
          columns={columns}
          dataSource={listQ.data ?? []}
          pagination={false}
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
}
