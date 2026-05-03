import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Button, Card, Checkbox, Collapse, Divider, Empty, Form, Input, List,
  Select, Space, Steps, Tag, Tooltip, Upload, message as antMsg,
} from 'antd';
import {
  UploadOutlined, CheckCircleOutlined, SearchOutlined, FileTextOutlined,
  EditOutlined, SyncOutlined, DownloadOutlined, ExperimentOutlined,
  OrderedListOutlined, SaveOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../api/client';

type ProjectRow = { id: string; discipline: string; title: string | null; topic: string | null; status: string };
type ModelRow = { id: string; display_name: string; provider_model: string; allowed_scenarios: string[] };
type LiteratureRow = { id: string; title: string; rag_status: string };
type ChunkPreview = { id: string; chunk_index: number; preview: string };
type ChunkResponse = { document_id: string; literature_id: string; chunk_count: number; preview: ChunkPreview[] };
type ChapterRow = { id: string; title: string; order_index: number; content: string | null; feedback: string | null; status: string };

function firstModelFor(models: ModelRow[] | undefined, scenario: string): string {
  const found = (models ?? []).find(m => {
    const a = m.allowed_scenarios ?? [];
    return a.length === 0 || a.includes(scenario);
  });
  return found?.id ?? '';
}

function requireModel(models: ModelRow[] | undefined, scenario: string): string {
  const id = firstModelFor(models, scenario);
  if (!id) throw new Error(`没有可用于 ${scenario} 的模型，请先让管理员配置模型目录。`);
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
  const nav = useNavigate();
  const qc = useQueryClient();
  const [msgApi, ctxHolder] = antMsg.useMessage();

  const projectsQ = useQuery({ queryKey: ['writer', 'projects'], queryFn: () => apiFetch('/api/projects') as Promise<ProjectRow[]> });
  const modelsQ = useQuery({ queryKey: ['writer', 'models'], queryFn: () => apiFetch('/api/models') as Promise<ModelRow[]> });

  const [projectId, setProjectId] = useState(params.projectId ?? '');
  const project = useMemo(() => projectsQ.data?.find(p => p.id === projectId), [projectId, projectsQ.data]);

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

  const literatureQ = useQuery({
    queryKey: ['writer', 'literature', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/literature`) as Promise<{ items: LiteratureRow[] }>,
    enabled: Boolean(projectId),
  });
  const chaptersQ = useQuery({
    queryKey: ['writer', 'chapters', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/chapters`) as Promise<ChapterRow[]>,
    enabled: Boolean(projectId),
  });

  const ok = (text: string) => msgApi.success(text);
  const fail = (e: Error) => msgApi.error(e.message);

  const createLiterature = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/literature`, {
      method: 'POST', body: JSON.stringify({ title, body_text: bodyText, abstract: bodyText.slice(0, 2000) }),
    }) as Promise<{ id: string }>,
    onSuccess: (res) => { setLiteratureId(res.id); ok('参考论文已保存'); qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] }); },
    onError: fail,
  });
  const uploadLiterature = useMutation({
    mutationFn: () => {
      if (!uploadFile) throw new Error('请先选择文件');
      const fd = new FormData(); fd.set('title', title.trim() || uploadFile.name); fd.set('file', uploadFile);
      return apiFetch(`/api/projects/${projectId}/literature/upload`, { method: 'POST', body: fd }) as Promise<{ id: string; file_path: string }>;
    },
    onSuccess: (res) => { setLiteratureId(res.id); ok(`文件已上传：${res.file_path}`); qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] }); },
    onError: fail,
  });
  const review = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/reference/review`, {
      method: 'POST', body: JSON.stringify({ literature_id: literatureId, model_id: requireModel(modelsQ.data, 'reference_review') }),
    }) as Promise<{ passed: boolean; overall_score: number; report: string }>,
    onSuccess: (res) => ok(`审核${res.passed ? '通过' : '未通过'}，总分 ${res.overall_score}`),
    onError: fail,
  });
  const chunk = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/rag/documents/${literatureId}/chunk`, {
      method: 'POST', body: JSON.stringify({ literature_id: literatureId, model_id: requireModel(modelsQ.data, 'rag'), text_override: bodyText || undefined }),
    }) as Promise<ChunkResponse>,
    onSuccess: (res) => { setDocumentId(res.document_id); setChunkPreview(res.preview); setSelectedChunkIds(res.preview.map(c => c.id)); ok(`已生成 ${res.chunk_count} 个预切块`); },
    onError: fail,
  });
  const confirmMut = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/rag/documents/${documentId}/confirm`, {
      method: 'POST', body: JSON.stringify({ chunk_ids: selectedChunkIds }),
    }),
    onSuccess: () => { ok('已确认切块并写入向量索引'); qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] }); },
    onError: fail,
  });
  const search = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/rag/search`, {
      method: 'POST', body: JSON.stringify({ query: searchQuery, limit: 5 }),
    }) as Promise<{ items: Array<{ id: string; text: string }> }>,
    onSuccess: (res) => { setSearchItems(res.items); ok(`检索到 ${res.items.length} 条片段`); },
    onError: fail,
  });
  const outline = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/outline/generate`, {
      method: 'POST', body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'outline') }),
    }),
    onSuccess: () => { ok('大纲已生成'); qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] }); qc.invalidateQueries({ queryKey: ['writer', 'projects'] }); },
    onError: fail,
  });
  const generateChapter = useMutation({
    mutationFn: (chapterId: string) => apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/generate`, {
      method: 'POST', body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'chapter_write'), target_words: 1200 }),
    }),
    onSuccess: () => { ok('章节正文已生成'); qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] }); },
    onError: fail,
  });
  const saveChapter = useMutation({
    mutationFn: (body: { id: string; content: string }) => apiFetch(`/api/projects/${projectId}/chapters/${body.id}`, {
      method: 'PATCH', body: JSON.stringify({ content: body.content }),
    }),
    onSuccess: () => { ok('已保存'); qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] }); },
    onError: fail,
  });
  const reviewChapter = useMutation({
    mutationFn: (chapterId: string) => apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/review`, {
      method: 'POST', body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'chapter_review') }),
    }),
    onSuccess: () => { ok('审校完成'); qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] }); },
    onError: fail,
  });
  const rewriteChapter = useMutation({
    mutationFn: (chapterId: string) => apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/rewrite`, {
      method: 'POST', body: JSON.stringify({ model_id: requireModel(modelsQ.data, 'chapter_rewrite') }),
    }),
    onSuccess: () => { ok('已按审校意见改写'); qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] }); },
    onError: fail,
  });
  const exportDoc = useMutation({
    mutationFn: async (format: 'markdown' | 'latex' | 'docx') => {
      if (format === 'docx') {
        const token = localStorage.getItem('jr_access_token');
        const res = await fetch(`/api/projects/${projectId}/export?format=docx`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!res.ok) throw new Error(await res.text());
        return { format, data: await res.arrayBuffer() };
      }
      const text = (await apiFetch(`/api/projects/${projectId}/export?format=${format}`)) as string;
      return { format, data: text };
    },
    onSuccess: ({ format, data }) => {
      if (format === 'docx') { downloadBlob('thesis.docx', data, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); return; }
      downloadBlob(format === 'markdown' ? 'thesis.md' : 'thesis.tex', data, format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/x-tex');
    },
    onError: fail,
  });

  const selectedLiterature = literatureQ.data?.items?.find(x => x.id === literatureId);

  if (!projectId) {
    return (
      <div>
        {ctxHolder}
        <h2 style={{ fontSize: 20, fontWeight: 500, color: '#202124', marginBottom: 8 }}>论文生成向导</h2>
        <p style={{ color: '#5f6368', marginBottom: 24, fontSize: 13 }}>选择一个项目来开始论文写作流程。</p>
        {projectsQ.isLoading && <p style={{ color: '#5f6368' }}>加载中…</p>}
        {projectsQ.data && projectsQ.data.length === 0 && (
          <Empty description="还没有项目">
            <Button type="primary" onClick={() => nav('/')}>去创建项目</Button>
          </Empty>
        )}
        {projectsQ.data && projectsQ.data.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {projectsQ.data.map(p => (
              <Card key={p.id} hoverable onClick={() => { setProjectId(p.id); nav(`/wizard/${p.id}`, { replace: true }); }} style={{ borderColor: '#e8eaed' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{p.title || p.discipline}</div>
                <Tag>{p.status}</Tag>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const currentStep = (() => {
    if (!literatureQ.data?.items?.length) return 0;
    const hasReviewed = literatureQ.data.items.some(l => l.rag_status === 'review_passed' || l.rag_status === 'indexed');
    if (!hasReviewed) return 0;
    const hasIndexed = literatureQ.data.items.some(l => l.rag_status === 'indexed');
    if (!hasIndexed) return 1;
    if (!chaptersQ.data?.length) return 2;
    return 3;
  })();

  return (
    <div>
      {ctxHolder}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: '#202124' }}>
            {project?.title || project?.discipline || '论文向导'}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5f6368' }}>
            按顺序完成参考论文、审核入库、检索大纲与章节写作。
          </p>
        </div>
        <Button size="small" onClick={() => { setProjectId(''); nav('/wizard', { replace: true }); }}>切换项目</Button>
      </div>

      <Steps current={currentStep} size="small" style={{ marginBottom: 28 }} items={[
        { title: '添加参考文献' },
        { title: '审核与入库' },
        { title: '大纲生成' },
        { title: '章节写作' },
      ]} />

      {/* Step 1: Literature */}
      <Card title="1. 标准参考论文" style={{ marginBottom: 16, borderColor: '#e8eaed' }}>
        <Form layout="vertical" onFinish={() => {
          if (!title.trim() || !bodyText.trim()) { msgApi.warning('请填写文献标题和正文'); return; }
          createLiterature.mutate();
        }}>
          <Form.Item label="文献标题">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="参考论文标题" />
          </Form.Item>
          <Form.Item label="正文 / 摘要文本">
            <Input.TextArea rows={6} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="粘贴 PDF 抽取文本或摘要" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={createLiterature.isPending} icon={<FileTextOutlined />}>
              保存参考论文
            </Button>
          </Space>
        </Form>
        <Divider style={{ margin: '16px 0' }} />
        <Space direction="vertical" style={{ width: '100%' }}>
          <span style={{ fontSize: 13, color: '#5f6368' }}>或上传 PDF / 文本文件：</span>
          <Space>
            <input type="file" accept=".pdf,.txt,.md,.text" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
            <Button icon={<UploadOutlined />} disabled={!uploadFile} loading={uploadLiterature.isPending} onClick={() => uploadLiterature.mutate()}>
              上传并创建文献
            </Button>
          </Space>
        </Space>
      </Card>

      {/* Step 2: Review & Chunk */}
      <Card title="2. 审核与入库" style={{ marginBottom: 16, borderColor: '#e8eaed' }}>
        <Form.Item label="选择已保存文献" style={{ marginBottom: 16 }}>
          <Select value={literatureId || undefined} onChange={setLiteratureId} placeholder="请选择文献" allowClear style={{ width: '100%' }}>
            {literatureQ.data?.items?.map(lit => (
              <Select.Option key={lit.id} value={lit.id}>
                {lit.title} · <Tag style={{ marginLeft: 4 }}>{lit.rag_status}</Tag>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Space wrap>
          <Button icon={<ExperimentOutlined />} disabled={!literatureId} loading={review.isPending} onClick={() => review.mutate()}>
            AI 审核
          </Button>
          <Button disabled={!literatureId || selectedLiterature?.rag_status !== 'review_passed'} loading={chunk.isPending} onClick={() => chunk.mutate()}>
            预切块
          </Button>
          <Button type="primary" icon={<CheckCircleOutlined />} disabled={!documentId || selectedChunkIds.length === 0} loading={confirmMut.isPending} onClick={() => confirmMut.mutate()}>
            确认入库
          </Button>
        </Space>
        {chunkPreview.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#5f6368' }}>已选 {selectedChunkIds.length}/{chunkPreview.length} 个 chunk</span>
              <Space size="small">
                <Button size="small" type="link" onClick={() => setSelectedChunkIds(chunkPreview.map(c => c.id))}>全选</Button>
                <Button size="small" type="link" onClick={() => setSelectedChunkIds([])}>清空</Button>
              </Space>
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e8eaed', borderRadius: 4, padding: 8 }}>
              {chunkPreview.map(c => (
                <label key={c.id} style={{ display: 'flex', gap: 8, padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                  <Checkbox
                    checked={selectedChunkIds.includes(c.id)}
                    onChange={e => setSelectedChunkIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                  />
                  <span><strong>#{c.chunk_index}</strong> {c.preview}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Step 3: Search & Outline */}
      <Card title="3. 检索与大纲" style={{ marginBottom: 16, borderColor: '#e8eaed' }}>
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="输入检索问题" style={{ flex: 1 }} />
          <Button icon={<SearchOutlined />} disabled={!searchQuery} loading={search.isPending} onClick={() => search.mutate()}>检索</Button>
        </Space.Compact>
        <Button type="primary" icon={<OrderedListOutlined />} loading={outline.isPending} onClick={() => outline.mutate()}>
          生成大纲
        </Button>
        {searchItems.length > 0 && (
          <List
            size="small"
            style={{ marginTop: 12 }}
            bordered
            dataSource={searchItems}
            renderItem={item => <List.Item style={{ fontSize: 13 }}>{item.text}</List.Item>}
          />
        )}
      </Card>

      {/* Step 4: Chapters */}
      {chaptersQ.data && chaptersQ.data.length > 0 && (
        <Card title="章节草稿" style={{ marginBottom: 16, borderColor: '#e8eaed' }}>
          <Collapse
            accordion
            items={chaptersQ.data.map(ch => ({
              key: ch.id,
              label: (
                <span>
                  {ch.title}
                  <Tag style={{ marginLeft: 8 }}>{ch.status}</Tag>
                </span>
              ),
              children: (
                <div>
                  <Input.TextArea
                    rows={10}
                    value={chapterDrafts[ch.id] ?? ch.content ?? ''}
                    onChange={e => setChapterDrafts(prev => ({ ...prev, [ch.id]: e.target.value }))}
                    style={{ marginBottom: 12 }}
                  />
                  <Space wrap>
                    <Button icon={<EditOutlined />} loading={generateChapter.isPending} onClick={() => generateChapter.mutate(ch.id)}>生成正文</Button>
                    <Button icon={<ExperimentOutlined />} loading={reviewChapter.isPending} onClick={() => reviewChapter.mutate(ch.id)}>审校</Button>
                    <Button icon={<SyncOutlined />} loading={rewriteChapter.isPending} onClick={() => rewriteChapter.mutate(ch.id)}>降重改写</Button>
                    <Button type="primary" icon={<SaveOutlined />} loading={saveChapter.isPending}
                      onClick={() => saveChapter.mutate({ id: ch.id, content: chapterDrafts[ch.id] ?? ch.content ?? '' })}>
                      保存本章
                    </Button>
                  </Space>
                  {ch.feedback && <Alert style={{ marginTop: 12 }} type="info" message={`审校意见：${ch.feedback}`} />}
                </div>
              ),
            }))}
          />
          <Divider />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportDoc.mutate('markdown')}>Markdown</Button>
            <Button icon={<DownloadOutlined />} onClick={() => exportDoc.mutate('latex')}>LaTeX</Button>
            <Button icon={<DownloadOutlined />} onClick={() => exportDoc.mutate('docx')}>Word</Button>
          </Space>
        </Card>
      )}
    </div>
  );
}
