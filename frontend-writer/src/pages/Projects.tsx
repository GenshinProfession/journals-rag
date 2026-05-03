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
    <div className="panel stack">
      <div>
        <h1>项目列表</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          新建项目后进入论文向导，完成参考论文审核与 RAG 入库。
        </p>
      </div>

      <form className="form-stack" style={{ maxWidth: 520 }} onSubmit={onCreate}>
        <h2>新建项目</h2>
        <div className="field">
          <label htmlFor="proj-degree">层次</label>
          <select id="proj-degree" value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)}>
            <option value="bachelor">本科</option>
            <option value="master">硕士</option>
            <option value="doctor">博士</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="proj-disc">学科 / 方向</label>
          <input id="proj-disc" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="proj-school">学校模板（可选）</label>
          <select id="proj-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">不使用模板</option>
            {schoolsQ.data?.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} · {tpl.degree_level || '通用'} · {tpl.citation_style || '未设引用'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="proj-title">论文题目（可选）</label>
          <input id="proj-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="proj-topic">主题说明（可选）</label>
          <textarea id="proj-topic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? '创建中…' : '创建项目'}
        </button>
      </form>

      {listQ.isLoading && <p className="muted">加载项目…</p>}
      {listQ.error && <div className="alert alert--error">{(listQ.error as Error).message}</div>}
      {listQ.data && (
        <ul className="project-list">
          {listQ.data.map((p) => (
            <li key={p.id} className="project-card">
              <div className="project-card__title">{p.discipline}</div>
              <div className="project-card__meta">
                {p.degree_level} · {p.status}
              </div>
              {p.title && <div style={{ marginTop: 8, color: 'var(--ink-muted)', fontSize: '0.92rem' }}>{p.title}</div>}
              <div className="project-card__sub">
                <code>{p.id}</code> · 字数快照 {p.word_count_total}
              </div>
              <Link className="project-card__link" to={`/wizard/${p.id}`}>
                进入论文向导
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
