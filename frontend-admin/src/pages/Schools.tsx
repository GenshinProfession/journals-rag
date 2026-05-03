import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  return (
    <section>
      <h2>学校模板</h2>
      <p>维护学校/专业的格式、引用和字数规则，writer 新建项目时可选择。</p>

      <form onSubmit={onSubmit} style={{ maxWidth: 640, marginBottom: 24 }}>
        <h3>{editing ? `编辑：${editing.name}` : '新增模板'}</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          模板名称
          <input style={{ width: '100%', marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          层次（可空）
          <input style={{ width: '100%', marginTop: 4 }} value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)} placeholder="master" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          专业/方向（可空）
          <input style={{ width: '100%', marginTop: 4 }} value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          引用格式
          <input style={{ width: '100%', marginTop: 4 }} value={citationStyle} onChange={(e) => setCitationStyle(e.target.value)} placeholder="GB/T 7714" />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'block', marginBottom: 8, flex: 1 }}>
            最少字数
            <input style={{ width: '100%', marginTop: 4 }} value={minWords} onChange={(e) => setMinWords(e.target.value)} />
          </label>
          <label style={{ display: 'block', marginBottom: 8, flex: 1 }}>
            最多字数
            <input style={{ width: '100%', marginTop: 4 }} value={maxWords} onChange={(e) => setMaxWords(e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'block', marginBottom: 8 }}>
          格式规则
          <textarea style={{ width: '100%', marginTop: 4 }} rows={4} value={formattingRules} onChange={(e) => setFormattingRules(e.target.value)} />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={saveMut.isPending}>保存模板</button>
        {editing && <button type="button" style={{ marginLeft: 8 }} onClick={resetForm}>取消</button>}
      </form>

      {listQ.data && (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>名称</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>层次/专业</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>引用</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>字数</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {listQ.data.map((item) => (
              <tr key={item.id}>
                <td style={{ padding: '6px 0' }}>{item.name}{!item.enabled && '（禁用）'}</td>
                <td>{item.degree_level || '通用'} / {item.discipline || '通用'}</td>
                <td>{item.citation_style || '—'}</td>
                <td>{item.word_count_min ?? '—'} - {item.word_count_max ?? '—'}</td>
                <td>
                  <button type="button" onClick={() => startEdit(item)}>编辑</button>
                  <button type="button" style={{ marginLeft: 6 }} onClick={() => toggleMut.mutate(item)}>
                    {item.enabled ? '禁用' : '启用'}
                  </button>
                  <button type="button" style={{ marginLeft: 6 }} onClick={() => deleteMut.mutate(item.id)}>
                    删除
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
