import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, Checkbox, Collapse, Divider,
  Dropdown, Empty, Form, Input, List, Modal, Popconfirm, Progress,
  Select, Space, Steps, Table, Tag, Tooltip, Tree, Typography,
  message as antMsg,
} from 'antd';
import type { TreeDataNode } from 'antd';
import {
  UploadOutlined, CheckCircleOutlined, SearchOutlined, FileTextOutlined,
  EditOutlined, SyncOutlined, DownloadOutlined, ExperimentOutlined,
  OrderedListOutlined, SaveOutlined, DeleteOutlined, SafetyCertificateOutlined,
  ThunderboltOutlined, PlusOutlined,
  FileWordOutlined, UploadOutlined as UploadTemplateOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../api/client';
import { SubmitTemplateModal } from '../components/SubmitTemplateModal';

const { Text, Title } = Typography;

/* ── Types ──────────────────────────────────────────────────────────── */
type ProjectRow = { id: string; discipline: string; title: string | null; topic: string | null; status: string; school_id: string | null; abstract: string | null };
type ModelRow = { id: string; display_name: string; provider_model: string; allowed_scenarios: string[] };
type LiteratureRow = {
  id: string; title: string; authors: string | null; year: number | null;
  journal: string | null; doi: string | null; abstract: string | null;
  rag_status: string; source: string; folder: string | null; is_cited: boolean;
};
type LitListResponse = { project_id: string; total: number; min_required: number; can_start_writing: boolean; items: LiteratureRow[] };
type ChunkPreview = { id: string; chunk_index: number; preview: string };
type ChunkResponse = { document_id: string; literature_id: string; chunk_count: number; preview: ChunkPreview[] };
type ChapterRow = {
  id: string; title: string; order_index: number; content: string | null;
  feedback: string | null; status: string; level: number; parent_id: string | null;
  word_count: number; version: number;
};
type WritingReadiness = { literature_count: number; indexed_count: number; min_required: number; ready: boolean; message: string };
type SearchResult = { title: string; authors: string; year: number; journal: string; abstract: string; doi: string };

/* ── Helpers ─────────────────────────────────────────────────────────── */
function findModel(models: ModelRow[] | undefined, scenario: string, selectedId: string | null): string {
  if (selectedId) {
    const sel = (models ?? []).find(m => m.id === selectedId);
    if (sel) {
      const a = sel.allowed_scenarios ?? [];
      if (a.length === 0 || a.includes(scenario)) return sel.id;
    }
  }
  const found = (models ?? []).find(m => {
    const a = m.allowed_scenarios ?? [];
    return a.length === 0 || a.includes(scenario);
  });
  if (!found?.id) throw new Error(`没有可用于 ${scenario} 的模型，请先让管理员配置模型目录。`);
  return found.id;
}

function downloadBlob(filename: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  generated: { color: 'cyan', label: '已生成' },
  pending_accept: { color: 'processing', label: '待确认' },
  reviewed: { color: 'orange', label: '已审校' },
  rewritten: { color: 'blue', label: '已改写' },
  rejected: { color: 'red', label: '已拒绝' },
};

function buildTree(chapters: ChapterRow[]): TreeDataNode[] {
  const map = new Map<string, TreeDataNode & { _level: number; _order: number }>();
  const roots: (TreeDataNode & { _level: number; _order: number })[] = [];
  for (const ch of chapters) {
    map.set(ch.id, {
      key: ch.id,
      title: ch.title,
      children: [],
      _level: ch.level,
      _order: ch.order_index,
    });
  }
  for (const ch of chapters) {
    const node = map.get(ch.id)!;
    if (ch.parent_id && map.has(ch.parent_id)) {
      map.get(ch.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortFn = (a: { _order: number }, b: { _order: number }) => a._order - b._order;
  roots.sort(sortFn);
  map.forEach(n => (n.children as typeof roots).sort(sortFn));
  return roots;
}

/* ── Tabs for the left panel ─────────────────────────────────────────── */
type PanelTab = 'literature' | 'writing';

/* ══════════════════════════════════════════════════════════════════════ */
export function Wizard() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [msgApi, ctxHolder] = antMsg.useMessage();
  const projectId = projectIdParam ?? '';

  /* ── Queries ─────────────────────────────────────────────────────── */
  const projectsQ = useQuery({ queryKey: ['writer', 'projects'], queryFn: () => apiFetch('/api/projects') as Promise<ProjectRow[]> });
  const modelsQ = useQuery({ queryKey: ['writer', 'models'], queryFn: () => apiFetch('/api/models') as Promise<ModelRow[]> });
  const literatureQ = useQuery({
    queryKey: ['writer', 'literature', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/literature`) as Promise<LitListResponse>,
    enabled: Boolean(projectId),
  });
  const chaptersQ = useQuery({
    queryKey: ['writer', 'chapters', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/chapters`) as Promise<ChapterRow[]>,
    enabled: Boolean(projectId),
  });
  const readinessQ = useQuery({
    queryKey: ['writer', 'readiness', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/writing-readiness`) as Promise<WritingReadiness>,
    enabled: Boolean(projectId),
  });
  const project = useMemo(() => projectsQ.data?.find(p => p.id === projectId), [projectId, projectsQ.data]);

  /* ── Local state ─────────────────────────────────────────────────── */
  const [panelTab, setPanelTab] = useState<PanelTab>('literature');
  const [viewStep, setViewStep] = useState<number | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [chapterDrafts, setChapterDrafts] = useState<Record<string, string>>({});
  const [addChapterTitle, setAddChapterTitle] = useState('');
  const [addChapterLevel, setAddChapterLevel] = useState(1);
  const [showAddChapter, setShowAddChapter] = useState(false);

  // Model selection
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Topic state
  const [topicText, setTopicText] = useState(project?.topic ?? '');

  // Literature state
  const [litTitle, setLitTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [literatureId, setLiteratureId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [chunkPreview, setChunkPreview] = useState<ChunkPreview[]>([]);
  const [selectedChunkIds, setSelectedChunkIds] = useState<string[]>([]);
  const [litSearchQuery, setLitSearchQuery] = useState('');
  const [litSearchResults, setLitSearchResults] = useState<SearchResult[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSubmitTemplate, setShowSubmitTemplate] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Template completeness query
  const templateCompletenessQ = useQuery({
    queryKey: ['writer', 'template-completeness', project?.school_id],
    queryFn: async () => {
      if (!project?.school_id) return null;
      // First get the template groups for this school
      const groups = await apiFetch(`/api/schools/${project.school_id}/templates`) as Array<{ group_id: string }>;
      if (!groups?.length) return null;
      // Then check completeness of the first group
      return apiFetch(`/api/school-templates/${groups[0].group_id}/completeness`) as Promise<{
        has_group: boolean;
        structure: boolean;
        format_rules: boolean;
        citation_rules: boolean;
      }>;
    },
    enabled: Boolean(project?.school_id),
  });
  const templateCompleteness = templateCompletenessQ.data;

  useEffect(() => {
    setActiveChapterId(null); setChapterDrafts({});
    setLitTitle(''); setBodyText(''); setUploadFiles([]); setLiteratureId('');
    setDocumentId(''); setChunkPreview([]); setSelectedChunkIds([]);
    setLitSearchQuery(''); setLitSearchResults([]);
    setTopicText(project?.topic ?? '');
  }, [projectId]);

  useEffect(() => {
    if (project?.topic && !topicText) setTopicText(project.topic);
  }, [project?.topic]);

  // Auto-select first chapter when chapters load
  useEffect(() => {
    if (!activeChapterId && chaptersQ.data?.length) {
      setActiveChapterId(chaptersQ.data[0].id);
      setPanelTab('writing');
    }
  }, [chaptersQ.data, activeChapterId]);

  const ok = (text: string) => msgApi.success(text);
  const fail = (e: Error) => msgApi.error(e.message);
  const refreshLit = () => { qc.invalidateQueries({ queryKey: ['writer', 'literature', projectId] }); qc.invalidateQueries({ queryKey: ['writer', 'readiness', projectId] }); };
  const refreshChapters = () => qc.invalidateQueries({ queryKey: ['writer', 'chapters', projectId] });

  /* ── Derived ─────────────────────────────────────────────────────── */
  const litData = literatureQ.data;
  const litCount = litData?.total ?? 0;
  const minRequired = litData?.min_required ?? 10;
  const canStartWriting = litData?.can_start_writing ?? false;
  const chapters = chaptersQ.data ?? [];
  const activeChapter = chapters.find(c => c.id === activeChapterId) ?? null;
  const treeData = useMemo(() => buildTree(chapters), [chapters]);
  const selectedLiterature = litData?.items?.find(x => x.id === literatureId);

  /* ── Mutations ───────────────────────────────────────────────────── */
  const saveTopic = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}`, {
      method: 'PATCH', body: JSON.stringify({ topic: topicText.trim() }),
    }),
    onSuccess: () => { ok('主题说明已保存'); qc.invalidateQueries({ queryKey: ['writer', 'projects'] }); setViewStep(1); },
    onError: fail,
  });

  const createLiterature = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/literature`, {
      method: 'POST', body: JSON.stringify({ title: litTitle, body_text: bodyText, abstract: bodyText.slice(0, 2000) }),
    }) as Promise<{ id: string }>,
    onSuccess: (res) => { setLiteratureId(res.id); ok('参考论文已保存'); refreshLit(); },
    onError: fail,
  });

  const uploadLiterature = useMutation({
    mutationFn: () => {
      if (!uploadFiles.length) throw new Error('请先选择文件');
      const fd = new FormData();
      fd.set('title', litTitle.trim());
      uploadFiles.forEach(f => fd.append('files', f));
      return apiFetch(`/api/projects/${projectId}/literature/upload`, { method: 'POST', body: fd }) as Promise<{ count: number; errors: string[] }>;
    },
    onSuccess: (res) => {
      const msg = `已上传 ${res.count} 个文件` + (res.errors.length ? `，${res.errors.length} 个失败` : '');
      ok(msg); setUploadFiles([]); refreshLit();
    },
    onError: fail,
  });

  const deleteLit = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/projects/${projectId}/literature/${id}`, { method: 'DELETE' }),
    onSuccess: () => { ok('已删除'); refreshLit(); },
    onError: fail,
  });

  const checkRelevance = useMutation({
    mutationFn: (litId: string) => apiFetch(`/api/projects/${projectId}/literature/relevance-check`, {
      method: 'POST', body: JSON.stringify({ literature_id: litId }),
    }) as Promise<{ score: number; reason: string; should_add_to_library: boolean }>,
    onSuccess: (res) => { msgApi.info(`相关性 ${res.score}/100 — ${res.should_add_to_library ? '推荐入库' : '不推荐'}：${res.reason}`); },
    onError: fail,
  });

  const review = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/reference/review`, {
      method: 'POST', body: JSON.stringify({ literature_id: literatureId, model_id: findModel(modelsQ.data, 'reference_review', selectedModelId) }),
    }) as Promise<{ passed: boolean; overall_score: number }>,
    onSuccess: (res) => { ok(`审核${res.passed ? '通过' : '未通过'}，总分 ${res.overall_score}`); refreshLit(); },
    onError: fail,
  });

  const chunk = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/rag/documents/${literatureId}/chunk`, {
      method: 'POST', body: JSON.stringify({ literature_id: literatureId, model_id: findModel(modelsQ.data, 'rag', selectedModelId), text_override: bodyText || undefined }),
    }) as Promise<ChunkResponse>,
    onSuccess: (res) => { setDocumentId(res.document_id); setChunkPreview(res.preview); setSelectedChunkIds(res.preview.map(c => c.id)); ok(`已生成 ${res.chunk_count} 个预切块`); },
    onError: fail,
  });

  const confirmMut = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/rag/documents/${documentId}/confirm`, {
      method: 'POST', body: JSON.stringify({ chunk_ids: selectedChunkIds }),
    }),
    onSuccess: () => { ok('已确认切块并写入向量索引'); refreshLit(); },
    onError: fail,
  });

  const outline = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/outline/generate`, {
      method: 'POST', body: JSON.stringify({ model_id: findModel(modelsQ.data, 'outline', selectedModelId) }),
    }),
    onSuccess: () => { ok('大纲已生成'); refreshChapters(); qc.invalidateQueries({ queryKey: ['writer', 'projects'] }); },
    onError: fail,
  });

  const addChapter = useMutation({
    mutationFn: (body: { title: string; level: number; parent_id?: string }) =>
      apiFetch(`/api/projects/${projectId}/chapters`, { method: 'POST', body: JSON.stringify(body) }) as Promise<ChapterRow>,
    onSuccess: (ch) => { ok('已添加'); refreshChapters(); setActiveChapterId(ch.id); setShowAddChapter(false); setAddChapterTitle(''); },
    onError: fail,
  });

  const deleteChapter = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/projects/${projectId}/chapters/${id}`, { method: 'DELETE' }),
    onSuccess: () => { ok('已删除'); refreshChapters(); if (activeChapterId && chapters.length > 1) { const next = chapters.find(c => c.id !== activeChapterId); setActiveChapterId(next?.id ?? null); } },
    onError: fail,
  });

  const generateChapter = useMutation({
    mutationFn: (chapterId: string) => apiFetch(`/api/projects/${projectId}/chapters/${chapterId}/generate`, {
      method: 'POST', body: JSON.stringify({ model_id: findModel(modelsQ.data, 'chapter_write', selectedModelId), target_words: 1200 }),
    }),
    onSuccess: () => { ok('章节正文已生成'); refreshChapters(); },
    onError: fail,
  });

  const saveChapter = useMutation({
    mutationFn: (body: { id: string; content: string }) => apiFetch(`/api/projects/${projectId}/chapters/${body.id}`, {
      method: 'PATCH', body: JSON.stringify({ content: body.content }),
    }),
    onSuccess: () => { ok('已保存'); refreshChapters(); },
    onError: fail,
  });

  const reviewChapter = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/projects/${projectId}/chapters/${id}/review`, {
      method: 'POST', body: JSON.stringify({ model_id: findModel(modelsQ.data, 'chapter_review', selectedModelId) }),
    }),
    onSuccess: () => { ok('审校完成'); refreshChapters(); },
    onError: fail,
  });

  const rewriteChapter = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/projects/${projectId}/chapters/${id}/rewrite`, {
      method: 'POST', body: JSON.stringify({ model_id: findModel(modelsQ.data, 'chapter_rewrite', selectedModelId) }),
    }),
    onSuccess: () => { ok('已改写'); refreshChapters(); },
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

  const litSearch = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/literature/search`, {
      method: 'POST', body: JSON.stringify({ query: litSearchQuery, max_results: 10 }),
    }) as Promise<{ results: SearchResult[] }>,
    onSuccess: (res) => { setLitSearchResults(res.results); },
    onError: fail,
  });

  const addSearchResult = useMutation({
    mutationFn: (item: SearchResult) => apiFetch(`/api/projects/${projectId}/literature`, {
      method: 'POST', body: JSON.stringify({ title: item.title, authors: item.authors, year: item.year, journal: item.journal, doi: item.doi, abstract: item.abstract }),
    }) as Promise<{ id: string }>,
    onSuccess: () => { ok('已添加到文献库'); refreshLit(); },
    onError: fail,
  });

  if (!projectId) return <Navigate to="/" replace />;

  const progressStep = (() => {
    if (!project?.topic) return 0;
    if (litCount < minRequired) return 1;
    const hasIndexed = litData?.items?.some(l => l.rag_status === 'indexed');
    if (!hasIndexed) return 2;
    if (!chapters.length) return 3;
    return 4;
  })();

  const activeStep = viewStep ?? progressStep;

  const activeContent = activeChapter ? (chapterDrafts[activeChapter.id] ?? activeChapter.content ?? '') : '';
  const setActiveContent = (v: string) => { if (activeChapter) setChapterDrafts(prev => ({ ...prev, [activeChapter.id]: v })); };

  /* ── Column defs for literature table ─────────────────────────────── */
  const litTableCols = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '作者', dataIndex: 'authors', key: 'authors', width: 120, ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '年', dataIndex: 'year', key: 'year', width: 50, render: (v: number | null) => v || '-' },
    {
      title: '状态', dataIndex: 'rag_status', key: 'status', width: 90,
      render: (v: string) => <Tag color={v === 'indexed' ? 'green' : v === 'review_passed' ? 'blue' : v === 'review_failed' ? 'red' : 'default'}>{v}</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, row: LiteratureRow) => (
        <Space size="small">
          <Tooltip title="AI相关性检测"><Button size="small" icon={<SafetyCertificateOutlined />} loading={checkRelevance.isPending} onClick={() => checkRelevance.mutate(row.id)} /></Tooltip>
          <Button size="small" type="link" onClick={() => setLiteratureId(row.id)}>选中</Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => deleteLit.mutate(row.id)} />
        </Space>
      ),
    },
  ];

  /* ══════════════════════════════════════════════════════════════════ */
  /* RENDER                                                            */
  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)' }}>
      {ctxHolder}

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 12px', borderBottom: '1px solid #e8eaed', marginBottom: 0, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="small" onClick={() => nav('/', { replace: true })}>← 工作台</Button>
          <Title level={5} style={{ margin: 0 }}>{project?.title || project?.discipline || '论文项目'}</Title>
          <Tag>{project?.status ?? ''}</Tag>
        </div>
        <Space size="small">
          <Select
            style={{ width: 180 }}
            placeholder="选择模型"
            value={selectedModelId}
            onChange={v => setSelectedModelId(v)}
            options={(modelsQ.data ?? []).map(m => ({ label: m.display_name, value: m.id }))}
            allowClear
            size="small"
          />
          <Dropdown menu={{ items: [
            { key: 'md', label: 'Markdown', icon: <DownloadOutlined />, onClick: () => exportDoc.mutate('markdown') },
            { key: 'tex', label: 'LaTeX', icon: <DownloadOutlined />, onClick: () => exportDoc.mutate('latex') },
            { key: 'docx', label: 'Word (.docx)', icon: <FileWordOutlined />, onClick: () => exportDoc.mutate('docx') },
          ]}}>
            <Button icon={<DownloadOutlined />} loading={exportDoc.isPending}>导出</Button>
          </Dropdown>
          
          {/* Template status indicator */}
          {templateCompleteness && (
            <Tooltip title={
              <div>
                <div>结构规则: {templateCompleteness.structure ? '✅ 已配置' : '❌ 未配置'}</div>
                <div>格式规则: {templateCompleteness.format_rules ? '✅ 已配置' : '❌ 未配置'}</div>
                <div>引用规则: {templateCompleteness.citation_rules ? '✅ 已配置' : '❌ 未配置'}</div>
              </div>
            }>
              <Tag 
                color={templateCompleteness.structure && templateCompleteness.format_rules && templateCompleteness.citation_rules ? 'success' : 'warning'}
                style={{ cursor: 'pointer' }}
                onClick={() => setShowSubmitTemplate(true)}
              >
                模板: {templateCompleteness.structure && templateCompleteness.format_rules && templateCompleteness.citation_rules ? '完整' : '不完整'}
              </Tag>
            </Tooltip>
          )}
          {(!templateCompleteness || !templateCompleteness.has_group) && project?.school_id && (
            <Button 
              size="small" 
              icon={<UploadTemplateOutlined />} 
              onClick={() => setShowSubmitTemplate(true)}
            >
              上传学校模板
            </Button>
          )}
        </Space>
      </div>

      {/* ── Steps bar ────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 0', flexShrink: 0 }}>
        {(() => {
          const stepTitles = ['主题说明', `文献 (${litCount}/${minRequired})`, '审核入库', '大纲', '写作'];
          const goTo = (i: number) => { setViewStep(i); if (i <= 2) setPanelTab('literature'); else setPanelTab('writing'); };
          return (
            <Steps current={activeStep} size="small" items={stepTitles.map((t, i) => ({
              title: <span onClick={() => goTo(i)} style={{ cursor: 'pointer' }}>{t}</span>,
              status: i === activeStep ? 'process' : i < progressStep ? 'finish' : 'wait' as 'process' | 'finish' | 'wait',
              style: { cursor: 'pointer' },
              onClick: () => goTo(i),
            }))} />
          );
        })()}
      </div>

      {/* ── Main split panel ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden', border: '1px solid #e8eaed', borderRadius: 8 }}>

        {/* LEFT: Editor / Literature */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e8eaed' }}>
          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

            {/* ── STEP 0: 主题说明 ─────────────────────────────────── */}
            {activeStep === 0 && (
              <Card size="small">
                <Title level={5} style={{ margin: '0 0 8px' }}>主题说明</Title>
                <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                  请填写研究问题、方法或导师要求等，便于后续审核与大纲生成。
                </Typography.Paragraph>
                <Input.TextArea
                  rows={6}
                  value={topicText}
                  onChange={e => setTopicText(e.target.value)}
                  placeholder="例如：基于深度学习的图像分类研究，导师要求使用 Transformer 架构..."
                  style={{ marginBottom: 12 }}
                />
                <Button type="primary" loading={saveTopic.isPending} disabled={!topicText.trim()} onClick={() => saveTopic.mutate()}>
                  保存并继续
                </Button>
              </Card>
            )}

            {/* ── STEP 1: 文献管理 ─────────────────────────────────── */}
            {activeStep === 1 && (
              <>
                {!canStartWriting && (
                  <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                    message={`至少需要 ${minRequired} 篇文献`}
                    description={<Progress percent={Math.round((litCount / minRequired) * 100)} size="small" style={{ maxWidth: 260 }} />}
                  />
                )}

                <Collapse size="small" style={{ marginBottom: 12 }} items={[{
                  key: 'upload', label: '上传文件',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <input type="file" multiple accept=".pdf,.txt,.md,.text" onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                      {uploadFiles.length > 0 && <span style={{ fontSize: 12, color: '#888' }}>已选 {uploadFiles.length} 个文件</span>}
                      <Button type="primary" icon={<UploadOutlined />} disabled={!uploadFiles.length} loading={uploadLiterature.isPending} onClick={() => uploadLiterature.mutate()}>上传 {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}</Button>
                    </Space>
                  ),
                }, {
                  key: 'add', label: '手动添加文献',
                  children: (
                    <Form layout="vertical" onFinish={() => { if (!litTitle.trim()) { msgApi.warning('请填写文献标题'); return; } createLiterature.mutate(); }}>
                      <Form.Item label="文献标题"><Input value={litTitle} onChange={e => setLitTitle(e.target.value)} placeholder="参考论文标题" /></Form.Item>
                      <Form.Item label="正文 / 摘要"><Input.TextArea rows={3} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="粘贴 PDF 抽取文本或摘要" /></Form.Item>
                      <Button type="primary" htmlType="submit" loading={createLiterature.isPending} icon={<FileTextOutlined />}>保存</Button>
                    </Form>
                  ),
                }]} />

                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={() => setShowSearchModal(true)}>AI 文献搜索</Button>
                </div>

                <Table dataSource={litData?.items ?? []} columns={litTableCols} rowKey="id" size="small" pagination={false}
                  locale={{ emptyText: <Empty description="暂无文献" /> }} scroll={{ y: 300 }}
                />
              </>
            )}

            {/* ── STEP 2: 审核入库 ─────────────────────────────────── */}
            {activeStep === 2 && (
              <>
                <Card size="small" title="审核与入库">
                  <Select value={literatureId || undefined} onChange={setLiteratureId} placeholder="选择文献" allowClear style={{ width: '100%', marginBottom: 8 }}>
                    {litData?.items?.map(lit => <Select.Option key={lit.id} value={lit.id}>{lit.title} · <Tag>{lit.rag_status}</Tag></Select.Option>)}
                  </Select>
                  <Space wrap size="small">
                    <Button size="small" icon={<ExperimentOutlined />} disabled={!literatureId} loading={review.isPending} onClick={() => review.mutate()}>审核</Button>
                    <Button size="small" disabled={!literatureId || selectedLiterature?.rag_status !== 'review_passed'} loading={chunk.isPending} onClick={() => chunk.mutate()}>切块</Button>
                    <Button size="small" type="primary" icon={<CheckCircleOutlined />} disabled={!documentId || !selectedChunkIds.length} loading={confirmMut.isPending} onClick={() => confirmMut.mutate()}>确认入库</Button>
                  </Space>
                  {chunkPreview.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: 6, fontSize: 12 }}>
                      {chunkPreview.map(c => (
                        <label key={c.id} style={{ display: 'flex', gap: 6, padding: '4px 0', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                          <Checkbox checked={selectedChunkIds.includes(c.id)} onChange={e => setSelectedChunkIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />
                          <span><strong>#{c.chunk_index}</strong> {c.preview}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </Card>

                <Table dataSource={litData?.items ?? []} columns={litTableCols} rowKey="id" size="small" pagination={false} style={{ marginTop: 12 }}
                  locale={{ emptyText: <Empty description="暂无文献" /> }} scroll={{ y: 240 }}
                />
              </>
            )}

            {/* ── STEP 3 & 4: 大纲 & 写作 ─────────────────────────── */}
            {activeStep >= 3 && (
              <>
                {!activeChapter ? (
                  <div style={{ textAlign: 'center', paddingTop: 60 }}>
                    <Empty description="请从右侧大纲选择章节，或先生成大纲">
                      <Button type="primary" icon={<OrderedListOutlined />} loading={outline.isPending} disabled={!canStartWriting} onClick={() => outline.mutate()}>
                        生成大纲
                      </Button>
                    </Empty>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Chapter header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
                      <div>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>
                          {'#'.repeat(activeChapter.level)} {activeChapter.title}
                        </span>
                        <Tag style={{ marginLeft: 8 }} color={(STATUS_TAG[activeChapter.status] ?? STATUS_TAG.draft).color}>
                          {(STATUS_TAG[activeChapter.status] ?? STATUS_TAG.draft).label}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          {activeContent.length} 字 · v{activeChapter.version}
                        </Text>
                      </div>
                    </div>

                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                      <Button size="small" icon={<EditOutlined />} loading={generateChapter.isPending} disabled={!canStartWriting}
                        onClick={() => generateChapter.mutate(activeChapter.id)}>AI 生成</Button>
                      <Button size="small" icon={<ExperimentOutlined />} loading={reviewChapter.isPending} disabled={!activeChapter.content}
                        onClick={() => reviewChapter.mutate(activeChapter.id)}>审校</Button>
                      <Button size="small" icon={<SyncOutlined />} loading={rewriteChapter.isPending} disabled={!activeChapter.content}
                        onClick={() => rewriteChapter.mutate(activeChapter.id)}>降重改写</Button>
                      <Button size="small" type="primary" icon={<SaveOutlined />} loading={saveChapter.isPending}
                        onClick={() => saveChapter.mutate({ id: activeChapter.id, content: activeContent })}>保存</Button>
                    </div>

                    {/* Feedback */}
                    {activeChapter.feedback && (
                      <Alert type="info" showIcon style={{ marginBottom: 8, flexShrink: 0 }} message={`审校意见：${activeChapter.feedback}`} closable />
                    )}

                    {/* Editor */}
                    <textarea
                      ref={editorRef}
                      value={activeContent}
                      onChange={e => setActiveContent(e.target.value)}
                      placeholder="在此编辑章节内容，或点击「AI 生成」自动填写…"
                      style={{
                        flex: 1, width: '100%', resize: 'none', border: '1px solid #dadce0', borderRadius: 6,
                        padding: 14, fontSize: 14, lineHeight: 1.8, fontFamily: '"Noto Serif SC", serif',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Outline tree ─────────────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fafbfc' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#202124' }}>大纲目录</span>
            <Space size={4}>
              <Tooltip title="生成大纲"><Button size="small" type="text" icon={<OrderedListOutlined />} loading={outline.isPending} disabled={!canStartWriting} onClick={() => outline.mutate()} /></Tooltip>
              <Tooltip title="添加章节"><Button size="small" type="text" icon={<PlusOutlined />} onClick={() => { setAddChapterTitle(''); setAddChapterLevel(1); setShowAddChapter(true); }} /></Tooltip>
            </Space>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }}>
            {chapters.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 12px', color: '#9aa0a6', fontSize: 13 }}>
                暂无章节<br />请先生成大纲或手动添加
              </div>
            ) : (
              <Tree
                treeData={treeData}
                selectedKeys={activeChapterId ? [activeChapterId] : []}
                onSelect={(keys) => {
                  if (keys[0]) { setActiveChapterId(keys[0] as string); setPanelTab('writing'); }
                }}
                defaultExpandAll
                blockNode
                titleRender={(node) => {
                  const ch = chapters.find(c => c.id === node.key);
                  if (!ch) return <span>{String(node.title)}</span>;
                  const st = STATUS_TAG[ch.status] ?? STATUS_TAG.draft;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '2px 0' }}>
                      <span style={{ fontSize: 13, fontWeight: ch.level === 1 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {ch.title}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <Badge color={st.color === 'default' ? '#d9d9d9' : undefined} status={st.color === 'processing' ? 'processing' : undefined} />
                        <Popconfirm title="删除此章节？" onConfirm={(e) => { e?.stopPropagation(); deleteChapter.mutate(ch.id); }}>
                          <DeleteOutlined style={{ fontSize: 11, color: '#bbb', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                        </Popconfirm>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>

          {/* Word count summary */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid #e8eaed', fontSize: 12, color: '#5f6368', flexShrink: 0 }}>
            共 {chapters.length} 节 · {chapters.reduce((s, c) => s + (c.word_count || 0), 0).toLocaleString()} 字
          </div>
        </div>
      </div>

      {/* ── Add chapter modal ────────────────────────────────────────── */}
      <Modal title="添加章节" open={showAddChapter} onCancel={() => setShowAddChapter(false)} width={400} destroyOnClose
        onOk={() => {
          if (!addChapterTitle.trim()) { msgApi.warning('请输入标题'); return; }
          addChapter.mutate({ title: addChapterTitle.trim(), level: addChapterLevel, parent_id: addChapterLevel > 1 && activeChapterId ? activeChapterId : undefined });
        }}
        okText="添加" cancelText="取消" confirmLoading={addChapter.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>标题</div>
            <Input value={addChapterTitle} onChange={e => setAddChapterTitle(e.target.value)} placeholder="如：第一章 绪论" autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>级别</div>
            <Select value={addChapterLevel} onChange={setAddChapterLevel} style={{ width: '100%' }}
              options={[
                { value: 1, label: '一级标题（章）' },
                { value: 2, label: '二级标题（节）' },
                { value: 3, label: '三级标题（小节）' },
              ]}
            />
          </div>
        </div>
      </Modal>

      {/* ── Paid Literature Search Modal ──────────────────────────────── */}
      <Modal open={showSearchModal} title="AI 文献搜索（付费服务）" width={800} onCancel={() => setShowSearchModal(false)} footer={null}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="此功能将消耗 AI 调用额度。" />
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input value={litSearchQuery} onChange={e => setLitSearchQuery(e.target.value)} placeholder="搜索关键词" onPressEnter={() => litSearch.mutate()} />
          <Button type="primary" icon={<SearchOutlined />} loading={litSearch.isPending} onClick={() => litSearch.mutate()}>搜索</Button>
        </Space.Compact>
        {litSearchResults.length > 0 && (
          <List dataSource={litSearchResults} renderItem={item => (
            <List.Item actions={[<Button size="small" type="primary" onClick={() => addSearchResult.mutate(item)} loading={addSearchResult.isPending}>添加</Button>]}>
              <List.Item.Meta title={<Text strong>{item.title}</Text>}
                description={<div style={{ fontSize: 12, color: '#5f6368' }}>{item.authors} ({item.year}) · {item.journal}{item.abstract && <div style={{ marginTop: 4 }}>{item.abstract.slice(0, 200)}...</div>}</div>} />
            </List.Item>
          )} />
        )}
        {litSearch.isSuccess && litSearchResults.length === 0 && <Empty description="未找到相关文献" />}
      </Modal>

      {/* Submit Template Modal */}
      <SubmitTemplateModal
        open={showSubmitTemplate}
        onClose={() => setShowSubmitTemplate(false)}
        schoolName={project?.school_id ? undefined : undefined}
      />
    </div>
  );
}
