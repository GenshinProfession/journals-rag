import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  return (
    <section>
      <h2>模型目录</h2>

      <form onSubmit={onCreate} style={{ marginBottom: '2rem', maxWidth: 520 }}>
        <h3>{editing ? `编辑模型：${editing.display_name}` : '新增模型'}</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          展示名称
          <input style={{ width: '100%', marginTop: 4 }} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          provider_model（中继模型名）
          <input style={{ width: '100%', marginTop: 4 }} value={providerModel} onChange={(e) => setProviderModel(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          endpoint_type
          <select style={{ width: '100%', marginTop: 4 }} value={endpointType} onChange={(e) => setEndpointType(e.target.value)}>
            <option value="openai_chat">openai_chat (/v1/chat/completions)</option>
            <option value="openai_responses">openai_responses (/v1/responses)</option>
            <option value="gemini_generate_content">gemini_generate_content (/v1beta/models/...:generateContent)</option>
            <option value="anthropic_messages">anthropic_messages (/v1/messages)</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          api_key_name（可空）
          <input style={{ width: '100%', marginTop: 4 }} value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} placeholder="例如 yunwu-chat-a" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Input 美分/千 token
          <input style={{ width: '100%', marginTop: 4 }} value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Output 美分/千 token
          <input style={{ width: '100%', marginTop: 4 }} value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          适用场景标签（逗号分隔，可空）
          <input style={{ width: '100%', marginTop: 4 }} value={scenarios} onChange={(e) => setScenarios(e.target.value)} placeholder="outline, rag" />
        </label>
        {formError && <p style={{ color: 'crimson' }}>{formError}</p>}
        <button type="submit" disabled={saveMut.isPending}>
          {saveMut.isPending ? '保存中…' : '保存模型'}
        </button>
        {editing && (
          <button
            type="button"
            style={{ marginLeft: 8 }}
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
      </form>

      {listQ.isLoading && <p>加载模型…</p>}
      {listQ.error && <p style={{ color: 'crimson' }}>{(listQ.error as Error).message}</p>}
      {listQ.data && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 1000, fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>名称</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>中继</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>端点</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Key</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>价格 in/out</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>场景</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {listQ.data.map((m) => (
              <tr key={m.id}>
                <td style={{ padding: '6px 0' }}>
                  {m.display_name}
                  {!m.enabled && <span style={{ opacity: 0.6 }}>（禁用）</span>}
                </td>
                <td>
                  <code>{m.provider_model}</code>
                </td>
                <td>
                  <code>{m.endpoint_type}</code>
                </td>
                <td>{m.api_key_name || '默认'}</td>
                <td>
                  {m.input_price_per_1k_cents}/{m.output_price_per_1k_cents}
                </td>
                <td>{m.allowed_scenarios?.join(', ') || '—'}</td>
                <td>
                  <button type="button" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(m.id)}>
                    删除
                  </button>
                  <button type="button" disabled={toggleMut.isPending} onClick={() => toggleMut.mutate(m)} style={{ marginLeft: 6 }}>
                    {m.enabled ? '禁用' : '启用'}
                  </button>
                  <button type="button" onClick={() => startEdit(m)} style={{ marginLeft: 6 }}>
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
