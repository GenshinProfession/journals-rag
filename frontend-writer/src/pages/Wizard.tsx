import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';

type ProjectRow = {
  id: string;
  discipline: string;
  title: string | null;
  topic: string | null;
  status: string;
};

type ModelRow = {
  id: string;
  display_name: string;
  provider_model: string;
  allowed_scenarios: string[];
};

type LiteratureRow = {
  id: string;
  title: string;
  rag_status: string;
};

type ChunkPreview = {
  id: string;
  chunk_index: number;
  preview: string;
};

type ChunkResponse = {
  document_id: string;
  literature_id: string;
  chunk_count: number;
  preview: ChunkPreview[];
};

type ChapterRow = {
  id: string;
  title: string;
  order_index: number;
  content: string | null;
  feedback: string | null;
  status: string;
};

function useProjects() {
  return useQuery({
    queryKey: ['writer', 'projects'],
    queryFn: () => apiFetch('/api/projects') as Promise<ProjectRow[]>
  });
}

function firstModelFor(models: ModelRow[] | undefined, scenario: string): string {
  const found = (models ?? []).find((m) => {
    const allowed = m.allowed_scenarios ?? [];
    return allowed.length === 0 || allowed.includes(scenario);
  });
  return found?.id ?? '';
}

function requireModel(models: ModelRow[] | undefined, scenario: string): string {
  const id = firstModelFor(models, scenario);
  if (!id) {
    throw new Error(`没有可用于 ${scenario} 的模型，请先让管理员配置模型目录。`);
  }
  return id;
}

function downloadBlob(filename: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Wizard() {
  const params = useParams();
  const qc = useQueryClient();
  const projectsQ = useProjects();
  const modelsQ = useQuery({
    queryKey: ['writer', 'models'],
    queryFn: () => apiFetch('/api/models') as Promise<ModelRow[]>
  });

  const [projectId, setProjectId] = useState(params.projectId ?? '');
  const project = useMemo(() => projectsQ.data?.find((p) => p.id === projectId), [projectId, projectsQ.data]);

  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [literatureId, setLiteratureId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [chunkPreview, setChunkPreview] = useState<ChunkPreview[]>([]);
  const [selectedChunkIds, setSelectedChunkIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchItems, setSearchItems] = useState<Array<{ id: string; text: string }>>([]);
  const [chapterDrafts, setChapterDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const literatureQ = useQuery({
    queryKey: ['writer', 'literature', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/literature`) as Promise<{ items: LiteratureRow[] }>,
    enabled: Boolean(projectId)
  });

  const chaptersQ = useQuery({
    queryKey: ['writer', 'chapters', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/chapters`) as Promise<ChapterRow[]>,
    enabled: Boolean(projectId)
  });

  const createLiterature = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/literature`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          body_text: bodyText,
          abstract: bodyText.slice(0, 2000)
        })
      }) as Promise<{ id: string; title: string; rag_status: string }>,
    onSuccess: (res) => {
      setLiteratureId(res.id);
      setMessage('参考论文已保存，下一步可发起质量审核。');
      qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const uploadLiterature = useMutation({
    mutationFn: () => {
      if (!uploadFile) {
        throw new Error('请先选择文件。');
      }
      const form = new FormData();
      form.set('title', title.trim() || uploadFile.name);
      form.set('file', uploadFile);
      return apiFetch(`/api/projects/${projectId}/literature/upload`, {
        method: 'POST',
        body: form
      }) as Promise<{ id: string; title: string; file_path: string; rag_status: string }>;
    },
    onSuccess: (res) => {
      setLiteratureId(res.id);
      setMessage(`文件已上传：${res.file_path}，下一步可发起质量审核。`);
      qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const review = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/reference/review`, {
        method: 'POST',
        body: JSON.stringify({
          literature_id: literatureId,
          model_id: requireModel(modelsQ.data, 'reference_review')
        })
      }) as Promise<{ passed: boolean; overall_score: number; report: string }>,
    onSuccess: (res) => {
      setMessage(`审核完成：${res.passed ? '通过' : '未通过'}，总分 ${res.overall_score}。${res.report}`);
      qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const chunk = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/rag/documents/${literatureId}/chunk`, {
        method: 'POST',
        body: JSON.stringify({
          literature_id: literatureId,
          model_id: requireModel(modelsQ.data, 'rag'),
          text_override: bodyText || undefined
        })
      }) as Promise<ChunkResponse>,
    onSuccess: (res) => {
      setDocumentId(res.document_id);
      setChunkPreview(res.preview);
      setSelectedChunkIds(res.preview.map((c) => c.id));
      setMessage(`已生成 ${res.chunk_count} 个预切块，可确认入库。`);
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const confirm = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/rag/documents/${documentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ chunk_ids: selectedChunkIds })
      }),
    onSuccess: () => {
      setMessage('已确认切块并写入向量索引。');
      qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const search = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/rag/search`, {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery, limit: 5 })
      }) as Promise<{ items: Array<{ id: string; text: string }> }>,
    onSuccess: (res) => {
      setSearchItems(res.items);
      setMessage(`检索到 ${res.items.length} 条片段。`);
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const outline = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/outline/generate`, {
        method: 'POST',
        body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'outline') })
      }),
    onSuccess: () => {
      setMessage('大纲已生成，章节草稿已创建。');
      qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] });
      qc.invalidateQueries({ queryKey: ['writer', 'projects'] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const generateChapter = useMutation({
    mutationFn: (chapterId: string) =>
      apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model_id: requireModel(modelsQ.data, 'chapter_write'),
          target_words: 1200
        })
      }),
    onSuccess: () => {
      setMessage('章节正文已生成。');
      qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const saveChapter = useMutation({
    mutationFn: (body: { id: string; content: string }) =>
      apiFetch(`/api/projects/${projectId}/chapters/${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: body.content })
      }),
    onSuccess: () => {
      setMessage('章节内容已保存。');
      qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const reviewChapter = useMutation({
    mutationFn: (chapterId: string) =>
      apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/review`, {
        method: 'POST',
        body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'chapter_review') })
      }),
    onSuccess: () => {
      setMessage('章节审校完成。');
      qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const rewriteChapter = useMutation({
    mutationFn: (chapterId: string) =>
      apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/rewrite`, {
        method: 'POST',
        body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'chapter_rewrite') })
      }),
    onSuccess: () => {
      setMessage('章节已按审校意见改写。');
      qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] });
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const exportDoc = useMutation({
    mutationFn: async (format: 'markdown' | 'latex' | 'docx') => {
      if (format === 'docx') {
        const token = localStorage.getItem('jr_access_token');
        const res = await fetch(`/api/projects/${projectId}/export?format=docx`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return { format, data: await res.arrayBuffer() };
      }
      const text = (await apiFetch(`/api/projects/${projectId}/export?format=${format}`)) as string;
      return { format, data: text };
    },
    onSuccess: ({ format, data }) => {
      if (format === 'docx') {
        downloadBlob(
          'thesis.docx',
          data,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        return;
      }
      downloadBlob(
        format === 'markdown' ? 'thesis.md' : 'thesis.tex',
        data,
        format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/x-tex'
      );
    },
    onError: (e: Error) => setMessage(e.message)
  });

  const selectedLiterature = literatureQ.data?.items?.find((x) => x.id === literatureId);

  const onSaveLiterature = (e: FormEvent) => {
    e.preventDefault();
    if (!projectId || !title.trim() || !bodyText.trim()) {
      setMessage('请选择项目，并填写参考论文标题和正文。');
      return;
    }
    createLiterature.mutate();
  };

  return (
    <div className="panel panel--wizard stack">
      <div>
        <h1>论文生成向导</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          按顺序完成参考论文、审核入库、检索大纲与章节写作。
        </p>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="wiz-project">当前项目</label>
        <select
          id="wiz-project"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setLiteratureId('');
            setDocumentId('');
            setChunkPreview([]);
            setSelectedChunkIds([]);
          }}
        >
          <option value="">请选择项目</option>
          {projectsQ.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || p.discipline} · {p.status}
            </option>
          ))}
        </select>
      </div>

      {project && (
        <div className="alert" style={{ marginBottom: 0 }}>
          {project.title || project.discipline}：先保存标准参考论文，再审核，审核通过后才能 RAG 入库。
        </div>
      )}

      <div className="wizard-step wizard-step--first">
        <form className="stack" style={{ gap: '1rem' }} onSubmit={onSaveLiterature}>
          <h2 style={{ marginTop: 0 }}>1. 标准参考论文</h2>
          <div className="field">
            <label htmlFor="lit-title">文献标题</label>
            <input id="lit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="lit-body">正文 / 摘要文本（本地联调用，可先粘贴 PDF 抽取文本）</label>
            <textarea id="lit-body" rows={8} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={createLiterature.isPending}>
            保存参考论文
          </button>
        </form>

        <div style={{ marginTop: '1.25rem' }}>
          <h3>或上传 PDF / 文本文件</h3>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <input
              type="file"
              accept=".pdf,.txt,.md,.text"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!projectId || !uploadFile || uploadLiterature.isPending}
              onClick={() => uploadLiterature.mutate()}
            >
              上传并创建文献
            </button>
          </div>
        </div>
      </div>

      <div className="wizard-step">
        <h2>2. 审核与入库</h2>
        <div className="field">
          <label htmlFor="lit-pick">选择已保存文献</label>
          <select id="lit-pick" value={literatureId} onChange={(e) => setLiteratureId(e.target.value)}>
            <option value="">请选择文献</option>
            {literatureQ.data?.items?.map((lit) => (
              <option key={lit.id} value={lit.id}>
                {lit.title} · {lit.rag_status}
              </option>
            ))}
          </select>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost btn--sm" disabled={!literatureId || review.isPending} onClick={() => review.mutate()}>
            AI 审核参考论文
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!literatureId || selectedLiterature?.rag_status !== 'review_passed' || chunk.isPending}
            onClick={() => chunk.mutate()}
          >
            预切块
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!documentId || selectedChunkIds.length === 0 || confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            确认入库
          </button>
        </div>
      </div>

      {chunkPreview.length > 0 && (
        <div className="wizard-step">
          <h3>切块预览（前 20 个）</h3>
          <ol className="chunk-list">
            {chunkPreview.map((c) => (
              <li key={c.id}>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={selectedChunkIds.includes(c.id)}
                    onChange={(e) => {
                      setSelectedChunkIds((prev) => {
                        if (e.target.checked) {
                          return prev.includes(c.id) ? prev : [...prev, c.id];
                        }
                        return prev.filter((id) => id !== c.id);
                      });
                    }}
                  />
                  <strong> #{c.chunk_index}</strong> {c.preview}
                </label>
              </li>
            ))}
          </ol>
          <p className="muted" style={{ marginBottom: 12 }}>
            已选择 {selectedChunkIds.length}/{chunkPreview.length} 个 chunk。
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedChunkIds(chunkPreview.map((c) => c.id))}>
              全选
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedChunkIds([])}>
              清空
            </button>
          </div>
        </div>
      )}

      <div className="wizard-step">
        <h2>3. 检索与大纲</h2>
        <div className="field">
          <label htmlFor="rag-q">RAG 检索问题</label>
          <input id="rag-q" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost btn--sm" disabled={!projectId || !searchQuery || search.isPending} onClick={() => search.mutate()}>
            检索
          </button>
          <button type="button" className="btn btn--primary btn--sm" disabled={!projectId || outline.isPending} onClick={() => outline.mutate()}>
            生成大纲
          </button>
        </div>
      </div>

      {searchItems.length > 0 && (
        <ul className="search-hits">
          {searchItems.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      )}

      {chaptersQ.data && chaptersQ.data.length > 0 && (
        <div className="wizard-step">
          <h2>章节草稿</h2>
          <ol className="chapter-list">
            {chaptersQ.data.map((ch) => (
              <li key={ch.id} className="chapter-item">
                <strong>{ch.title}</strong>
                <div className="chapter-item__actions">
                  <button type="button" className="btn btn--ghost btn--sm" disabled={generateChapter.isPending} onClick={() => generateChapter.mutate(ch.id)}>
                    生成正文
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={reviewChapter.isPending} onClick={() => reviewChapter.mutate(ch.id)}>
                    审校
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={rewriteChapter.isPending} onClick={() => rewriteChapter.mutate(ch.id)}>
                    降重改写
                  </button>
                </div>
                <div className="field">
                  <label htmlFor={`ch-${ch.id}`}>正文</label>
                  <textarea
                    id={`ch-${ch.id}`}
                    rows={8}
                    value={chapterDrafts[ch.id] ?? ch.content ?? ''}
                    onChange={(e) => setChapterDrafts((prev) => ({ ...prev, [ch.id]: e.target.value }))}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={saveChapter.isPending}
                  onClick={() => saveChapter.mutate({ id: ch.id, content: chapterDrafts[ch.id] ?? ch.content ?? '' })}
                >
                  保存本章
                </button>
                {ch.feedback && (
                  <div className="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                    审校意见：{ch.feedback}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportDoc.mutate('markdown')}>
              导出 Markdown
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportDoc.mutate('latex')}>
              导出 LaTeX
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportDoc.mutate('docx')}>
              导出 Word
            </button>
          </div>
        </div>
      )}

      {message && <div className="alert">{message}</div>}
    </div>
  );
}
