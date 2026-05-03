import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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

export function Projects() {
  const qc = useQueryClient();
  const [degreeLevel, setDegreeLevel] = useState('master');
  const [discipline, setDiscipline] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['writer', 'projects'],
    queryFn: () => apiFetch('/api/projects') as Promise<ProjectRow[]>
  });

  const schoolsQ = useQuery({
    queryKey: ['writer', 'school-templates'],
    queryFn: () => apiFetch('/api/school-templates') as Promise<SchoolTemplate[]>
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['writer', 'projects'] });
      setDiscipline('');
      setTitle('');
      setTopic('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message)
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!discipline.trim()) {
      setError('请填写学科/专业关键词');
      return;
    }
    createMut.mutate({
      degree_level: degreeLevel,
      discipline: discipline.trim(),
      title: title.trim() || null,
      topic: topic.trim() || null,
      school_id: schoolId || null
    });
  };

  return (
    <section>
      <h1>项目列表</h1>

      <form onSubmit={onCreate} style={{ marginBottom: '2rem', maxWidth: 480 }}>
        <h2 style={{ fontSize: '1.1rem' }}>新建项目</h2>
        <label style={{ display: 'block', marginBottom: 8 }}>
          层次
          <select style={{ width: '100%', marginTop: 4 }} value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)}>
            <option value="bachelor">本科</option>
            <option value="master">硕士</option>
            <option value="doctor">博士</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          学科 / 方向
          <input style={{ width: '100%', marginTop: 4 }} value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          学校模板（可选）
          <select style={{ width: '100%', marginTop: 4 }} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">不使用模板</option>
            {schoolsQ.data?.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} · {tpl.degree_level || '通用'} · {tpl.citation_style || '未设引用'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          论文题目（可选）
          <input style={{ width: '100%', marginTop: 4 }} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          主题说明（可选）
          <textarea style={{ width: '100%', marginTop: 4 }} rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? '创建中…' : '创建项目'}
        </button>
      </form>

      {listQ.isLoading && <p>加载项目…</p>}
      {listQ.error && <p style={{ color: 'crimson' }}>{(listQ.error as Error).message}</p>}
      {listQ.data && (
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {listQ.data.map((p) => (
            <li key={p.id} style={{ borderBottom: '1px solid #eee', padding: '12px 0' }}>
              <div>
                <strong>{p.discipline}</strong>{' '}
                <span style={{ opacity: 0.85 }}>
                  ({p.degree_level}) · {p.status}
                </span>
              </div>
              {p.title && <div>{p.title}</div>}
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <code>{p.id}</code> · 字数快照 {p.word_count_total}
              </div>
              <Link to={`/wizard/${p.id}`} style={{ fontSize: 14 }}>
                进入论文向导
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
