import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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

export function Schools() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SchoolTemplate | null>(null);
  const [name, setName] = useState('');
  const [degreeLevel, setDegreeLevel] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [citationStyle, setCitationStyle] = useState('');
  const [minWords, setMinWords] = useState('');
  const [maxWords, setMaxWords] = useState('');
  const [formattingRules, setFormattingRules] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      resetForm();
    },
    onError: (e: Error) => setError(e.message)
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/schools/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'schools'] }),
    onError: (e: Error) => setError(e.message)
  });

  const toggleMut = useMutation({
    mutationFn: (item: SchoolTemplate) =>
      apiFetch(`/api/admin/schools/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !item.enabled })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'schools'] }),
    onError: (e: Error) => setError(e.message)
  });

  function resetForm() {
    setEditing(null);
    setName('');
    setDegreeLevel('');
    setDiscipline('');
    setCitationStyle('');
    setMinWords('');
    setMaxWords('');
    setFormattingRules('');
    setError(null);
  }

  function startEdit(item: SchoolTemplate) {
    setEditing(item);
    setName(item.name);
    setDegreeLevel(item.degree_level ?? '');
    setDiscipline(item.discipline ?? '');
    setCitationStyle(item.citation_style ?? '');
    setMinWords(item.word_count_min?.toString() ?? '');
    setMaxWords(item.word_count_max?.toString() ?? '');
    setFormattingRules(item.formatting_rules ?? '');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('模板名称不能为空');
      return;
    }
    saveMut.mutate({
      name: name.trim(),
      degree_level: degreeLevel.trim() || null,
      discipline: discipline.trim() || null,
      citation_style: citationStyle.trim() || null,
      word_count_min: minWords ? Number(minWords) : null,
      word_count_max: maxWords ? Number(maxWords) : null,
      formatting_rules: formattingRules.trim() || null,
      enabled: true
    });
  }

  const columns: ColumnsType<SchoolTemplate> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 180,
      ellipsis: true,
      render: (name: string, item: SchoolTemplate) => (
        <span>
          {name}
          {!item.enabled && (
            <Tag color="red" style={{ marginLeft: 8 }}>
              已禁用
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '层次/专业',
      key: 'deg',
      width: 160,
      ellipsis: true,
      render: (_: unknown, item) => `${item.degree_level || '通用'} / ${item.discipline || '通用'}`
    },
    {
      title: '引用',
      dataIndex: 'citation_style',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || '—'
    },
    {
      title: '字数',
      key: 'words',
      width: 120,
      align: 'right',
      render: (_: unknown, item) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {item.word_count_min ?? '—'} - {item.word_count_max ?? '—'}
        </span>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      align: 'center',
      render: (_: unknown, item) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => startEdit(item)}>
            编辑
          </Button>
          <Button size="small" disabled={toggleMut.isPending} onClick={() => toggleMut.mutate(item)}>
            {item.enabled ? '禁用' : '启用'}
          </Button>
          <Button type="primary" danger size="small" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(item.id)}>
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className="panel stack">
      <div>
        <h2>学校模板</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          维护学校/专业的格式、引用和字数规则，writer 新建项目时可选择。
        </p>
      </div>

      <form className="form-stack form-stack--wide" onSubmit={onSubmit}>
        <h3 style={{ marginTop: 0 }}>{editing ? `编辑：${editing.name}` : '新增模板'}</h3>
        <div className="field">
          <label htmlFor="sch-name">模板名称</label>
          <input id="sch-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sch-degree">层次（可空）</label>
          <input
            id="sch-degree"
            value={degreeLevel}
            onChange={(e) => setDegreeLevel(e.target.value)}
            placeholder="master"
          />
        </div>
        <div className="field">
          <label htmlFor="sch-disc">专业/方向（可空）</label>
          <input id="sch-disc" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sch-cite">引用格式</label>
          <input
            id="sch-cite"
            value={citationStyle}
            onChange={(e) => setCitationStyle(e.target.value)}
            placeholder="GB/T 7714"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="sch-min">最少字数</label>
            <input id="sch-min" value={minWords} onChange={(e) => setMinWords(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sch-max">最多字数</label>
            <input id="sch-max" value={maxWords} onChange={(e) => setMaxWords(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sch-rules">格式规则</label>
          <textarea id="sch-rules" rows={4} value={formattingRules} onChange={(e) => setFormattingRules(e.target.value)} />
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        <div className="btn-row">
          <button className="btn btn--primary" type="submit" disabled={saveMut.isPending}>
            保存模板
          </button>
          {editing && (
            <button type="button" className="btn btn--ghost" onClick={resetForm}>
              取消
            </button>
          )}
        </div>
      </form>

      {listQ.error && <div className="alert alert--error">{(listQ.error as Error).message}</div>}
      <Card size="small" styles={{ body: { padding: 0 } }} className="antd-table-card">
        <Table<SchoolTemplate>
          rowKey="id"
          size="middle"
          loading={listQ.isLoading}
          columns={columns}
          dataSource={listQ.data ?? []}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
