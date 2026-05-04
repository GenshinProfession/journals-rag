import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Card, Col, Input, message, Row, Space, Tabs, Tag, Tooltip, Typography
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, DragOutlined,
  PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined
} from '@ant-design/icons';
import { apiFetch } from '../api/client';

/* ── types ──────────────────────────────────────────────────────────────── */

type TemplateGroup = {
  id: string; school_id: string; degree_level: string;
  discipline: string | null; year: number | null;
  citation_style: string | null; enabled: boolean;
  has_structure: boolean; has_format_rules: boolean; has_citation_rules: boolean;
};

type Section = {
  type: string;
  template?: string;
  variables?: string[];
  chapters?: string[];
};

type StructureData = { sections: Section[] };
type FormatData = Record<string, unknown>;
type CitationData = { citation_json: Record<string, unknown> | null; citation_text: string | null };

const SECTION_TYPES = [
  { value: 'cover', label: '封面' },
  { value: 'declaration', label: '声明' },
  { value: 'abstract_cn', label: '中文摘要' },
  { value: 'abstract_en', label: '英文摘要' },
  { value: 'toc', label: '目录' },
  { value: 'body', label: '正文' },
  { value: 'references', label: '参考文献' },
  { value: 'appendix', label: '附录' },
  { value: 'acknowledgement', label: '致谢' },
];

const DEFAULT_STRUCTURE: StructureData = {
  sections: [
    { type: 'cover', template: 'cover_1', variables: ['title', 'author', 'school', 'date', 'advisor'] },
    { type: 'declaration' },
    { type: 'abstract_cn' },
    { type: 'abstract_en' },
    { type: 'toc' },
    { type: 'body', chapters: ['绪论', '文献综述', '研究设计', '分析与讨论', '结论'] },
    { type: 'references' },
    { type: 'acknowledgement' },
  ]
};

const DEFAULT_FORMAT: FormatData = {
  font: {
    title: { family: '黑体', size: 16, bold: true },
    subtitle: { family: '黑体', size: 14, bold: true },
    body: { family: '宋体', size: 12 },
    header: { family: '宋体', size: 10 },
    footer: { family: '宋体', size: 10 },
  },
  spacing: { line: 1.5, paragraph: 10 },
  margin: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.0 },
  page: { size: 'A4', orientation: 'portrait' },
};

const DEFAULT_CITATION = {
  type: 'GB/T 7714',
  examples: ['[1] 张三. 论文标题[J]. 期刊, 2023.'],
  rules: ['作者不超过3人全部列出', '超过3人使用 et al.'],
};

/* ── component ──────────────────────────────────────────────────────────── */

export function TemplateEditor() {
  const { groupId } = useParams<{ groupId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  // structure state
  const [sections, setSections] = useState<Section[]>([]);
  // format state
  const [formatJson, setFormatJson] = useState('');
  const [formatError, setFormatError] = useState<string | null>(null);
  // citation state
  const [citationJson, setCitationJson] = useState('');
  const [citationText, setCitationText] = useState('');

  // ── Fetch existing data ──────────────────────────────────────────────
  const structureQ = useQuery({
    queryKey: ['template', 'structure', groupId],
    queryFn: () => apiFetch(`/api/admin/schools/groups/${groupId}/structure`),
    enabled: !!groupId,
  });

  const formatQ = useQuery({
    queryKey: ['template', 'format', groupId],
    queryFn: () => apiFetch(`/api/admin/schools/groups/${groupId}/format-rules`),
    enabled: !!groupId,
  });

  const citationQ = useQuery({
    queryKey: ['template', 'citation', groupId],
    queryFn: () => apiFetch(`/api/admin/schools/groups/${groupId}/citation-rules`),
    enabled: !!groupId,
  });

  // Initialize from fetched data or defaults
  useEffect(() => {
    if (structureQ.data?.structure_json?.sections) {
      setSections(structureQ.data.structure_json.sections);
    } else if (!structureQ.isLoading && !structureQ.data) {
      setSections(DEFAULT_STRUCTURE.sections);
    }
  }, [structureQ.data, structureQ.isLoading]);

  useEffect(() => {
    if (formatQ.data?.rules_json) {
      setFormatJson(JSON.stringify(formatQ.data.rules_json, null, 2));
    } else if (!formatQ.isLoading && !formatQ.data) {
      setFormatJson(JSON.stringify(DEFAULT_FORMAT, null, 2));
    }
  }, [formatQ.data, formatQ.isLoading]);

  useEffect(() => {
    if (citationQ.data) {
      setCitationJson(citationQ.data.citation_json ? JSON.stringify(citationQ.data.citation_json, null, 2) : JSON.stringify(DEFAULT_CITATION, null, 2));
      setCitationText(citationQ.data.citation_text ?? '');
    } else if (!citationQ.isLoading && !citationQ.data) {
      setCitationJson(JSON.stringify(DEFAULT_CITATION, null, 2));
      setCitationText('');
    }
  }, [citationQ.data, citationQ.isLoading]);

  // ── Save mutations ───────────────────────────────────────────────────
  const saveStructure = useMutation({
    mutationFn: () => apiFetch(`/api/admin/schools/groups/${groupId}/structure`, {
      method: 'PUT', body: JSON.stringify({ structure_json: { sections } }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['template', 'structure', groupId] }); message.success('结构模板已保存'); },
    onError: (e: Error) => message.error(e.message),
  });

  const saveFormat = useMutation({
    mutationFn: (json: object) => apiFetch(`/api/admin/schools/groups/${groupId}/format-rules`, {
      method: 'PUT', body: JSON.stringify({ rules_json: json }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['template', 'format', groupId] }); message.success('格式规则已保存'); },
    onError: (e: Error) => message.error(e.message),
  });

  const saveCitation = useMutation({
    mutationFn: () => {
      let cj: Record<string, unknown> | null = null;
      try { cj = JSON.parse(citationJson); } catch { /* keep null */ }
      return apiFetch(`/api/admin/schools/groups/${groupId}/citation-rules`, {
        method: 'PUT', body: JSON.stringify({ citation_json: cj, citation_text: citationText || null }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['template', 'citation', groupId] }); message.success('引用模板已保存'); },
    onError: (e: Error) => message.error(e.message),
  });

  // ── Structure helpers ────────────────────────────────────────────────
  const moveSection = useCallback((idx: number, dir: -1 | 1) => {
    setSections(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const removeSection = useCallback((idx: number) => {
    setSections(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const addSection = useCallback((type: string) => {
    const newSec: Section = { type };
    if (type === 'body') newSec.chapters = ['绪论', '研究方法', '分析与讨论', '结论'];
    if (type === 'cover') { newSec.template = 'cover_1'; newSec.variables = ['title', 'author', 'school', 'date']; }
    setSections(prev => [...prev, newSec]);
  }, []);

  const updateChapters = useCallback((idx: number, chapters: string[]) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, chapters } : s));
  }, []);

  // ── Format validation ────────────────────────────────────────────────
  const handleFormatSave = () => {
    try {
      const parsed = JSON.parse(formatJson);
      setFormatError(null);
      saveFormat.mutate(parsed);
    } catch (e: any) {
      setFormatError(`JSON 格式错误: ${e.message}`);
    }
  };

  // ── Section label ────────────────────────────────────────────────────
  const sectionLabel = (type: string) => SECTION_TYPES.find(t => t.value === type)?.label ?? type;

  const sectionColor = (type: string): string => {
    const map: Record<string, string> = {
      cover: '#1a73e8', declaration: '#5f6368', abstract_cn: '#e37400',
      abstract_en: '#e37400', toc: '#9aa0a6', body: '#34a853',
      references: '#d93025', appendix: '#7b1fa2', acknowledgement: '#00796b',
    };
    return map[type] ?? '#5f6368';
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav('/schools')}>
          返回
        </Button>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 500 }}>
            模板编辑
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            ID: {groupId}
          </Typography.Text>
        </div>
      </div>

      <Tabs
        defaultActiveKey="structure"
        type="card"
        items={[
          /* ── Tab 1: Structure ─────────────────────────────────── */
          {
            key: 'structure',
            label: '结构模板',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Typography.Text type="secondary">
                    拖拽排列论文页面结构顺序，定义封面变量和正文章节
                  </Typography.Text>
                  <Button
                    type="primary" icon={<SaveOutlined />}
                    loading={saveStructure.isPending}
                    onClick={() => saveStructure.mutate()}
                  >
                    保存结构
                  </Button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {sections.map((sec, idx) => (
                    <Card
                      key={`${sec.type}-${idx}`}
                      size="small"
                      style={{ borderLeft: `3px solid ${sectionColor(sec.type)}`, borderRadius: 6 }}
                      styles={{ body: { padding: '8px 12px' } }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <DragOutlined style={{ color: '#9aa0a6', cursor: 'grab' }} />
                            <Tag color={sectionColor(sec.type)} style={{ margin: 0 }}>
                              {sectionLabel(sec.type)}
                            </Tag>
                            {sec.template && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                模板: {sec.template}
                              </Typography.Text>
                            )}
                          </div>

                          {sec.type === 'body' && sec.chapters && (
                            <div style={{ marginTop: 8, marginLeft: 28 }}>
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>章节：</Typography.Text>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {sec.chapters.map((ch, ci) => (
                                  <Tag
                                    key={ci} closable
                                    onClose={() => updateChapters(idx, sec.chapters!.filter((_, j) => j !== ci))}
                                  >
                                    {ch}
                                  </Tag>
                                ))}
                                <Tag
                                  style={{ borderStyle: 'dashed', cursor: 'pointer' }}
                                  onClick={() => {
                                    const name = prompt('章节名称');
                                    if (name) updateChapters(idx, [...(sec.chapters ?? []), name]);
                                  }}
                                >
                                  <PlusOutlined /> 添加
                                </Tag>
                              </div>
                            </div>
                          )}

                          {sec.type === 'cover' && sec.variables && (
                            <div style={{ marginTop: 8, marginLeft: 28 }}>
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>变量：</Typography.Text>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {sec.variables.map((v, vi) => (
                                  <Tag key={vi} color="geekblue">{v}</Tag>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <Space size={4}>
                          <Tooltip title="上移"><Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveSection(idx, -1)} /></Tooltip>
                          <Tooltip title="下移"><Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === sections.length - 1} onClick={() => moveSection(idx, 1)} /></Tooltip>
                          <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeSection(idx)} /></Tooltip>
                        </Space>
                      </div>
                    </Card>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SECTION_TYPES.map(t => (
                    <Button key={t.value} size="small" onClick={() => addSection(t.value)}>
                      + {t.label}
                    </Button>
                  ))}
                </div>
              </div>
            ),
          },

          /* ── Tab 2: Format Rules ─────────────────────────────── */
          {
            key: 'format',
            label: '格式规则 DSL',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Typography.Text type="secondary">
                    左侧编辑 JSON DSL（字体、行距、页边距等），右侧实时预览
                  </Typography.Text>
                  <Button
                    type="primary" icon={<SaveOutlined />}
                    loading={saveFormat.isPending}
                    onClick={handleFormatSave}
                  >
                    保存格式
                  </Button>
                </div>

                {formatError && <Alert type="error" message={formatError} style={{ marginBottom: 12 }} />}

                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="JSON 编辑器" size="small" style={{ borderRadius: 8 }}>
                      <Input.TextArea
                        value={formatJson}
                        onChange={e => { setFormatJson(e.target.value); setFormatError(null); }}
                        rows={20}
                        style={{ fontFamily: 'Consolas, "Courier New", monospace', fontSize: 13, resize: 'vertical' }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="预览" size="small" style={{ borderRadius: 8, minHeight: 480 }}>
                      <FormatPreview json={formatJson} />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },

          /* ── Tab 3: Citation Rules ───────────────────────────── */
          {
            key: 'citation',
            label: '参考文献模板',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Typography.Text type="secondary">
                    配置参考文献引用格式（JSON 规则 + 纯文本模板均可）
                  </Typography.Text>
                  <Button
                    type="primary" icon={<SaveOutlined />}
                    loading={saveCitation.isPending}
                    onClick={() => saveCitation.mutate()}
                  >
                    保存引用模板
                  </Button>
                </div>

                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="引用规则 JSON" size="small" style={{ borderRadius: 8, marginBottom: 16 }}>
                      <Input.TextArea
                        value={citationJson}
                        onChange={e => setCitationJson(e.target.value)}
                        rows={10}
                        style={{ fontFamily: 'Consolas, "Courier New", monospace', fontSize: 13 }}
                        placeholder='{"type": "GB/T 7714", "examples": [...], "rules": [...]}'
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="引用模板文本（人工整理）" size="small" style={{ borderRadius: 8, marginBottom: 16 }}>
                      <Input.TextArea
                        value={citationText}
                        onChange={e => setCitationText(e.target.value)}
                        rows={10}
                        style={{ fontSize: 13 }}
                        placeholder={
                          '[1] 张三. 论文标题[J]. 期刊名, 2023, 10(2): 1-10.\n' +
                          '[2] 李四, 王五. 书名[M]. 出版社, 2022.\n' +
                          '...'
                        }
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/* ── Format preview sub-component ────────────────────────────────────── */

function FormatPreview({ json }: { json: string }) {
  let data: Record<string, any> = {};
  try { data = JSON.parse(json); } catch { return <Typography.Text type="secondary">JSON 解析失败，请检查格式</Typography.Text>; }

  const font = data.font ?? {};
  const spacing = data.spacing ?? {};
  const margin = data.margin ?? {};
  const page = data.page ?? {};

  return (
    <div style={{ fontSize: 13, lineHeight: 1.8, color: '#202124' }}>
      <div style={{ marginBottom: 12, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>页面设置</div>
        <div>纸张: {page.size ?? 'A4'} · {page.orientation ?? 'portrait'}</div>
        <div>页边距: 上 {margin.top ?? '—'}cm · 下 {margin.bottom ?? '—'}cm · 左 {margin.left ?? '—'}cm · 右 {margin.right ?? '—'}cm</div>
      </div>
      <div style={{ marginBottom: 12, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>字体设置</div>
        {Object.entries(font).map(([key, val]: [string, any]) => (
          <div key={key}>
            <Tag>{key}</Tag>
            {val?.family ?? '—'} · {val?.size ?? '—'}pt
            {val?.bold && ' · 加粗'}
            {val?.italic && ' · 斜体'}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>段落间距</div>
        <div>行距: {spacing.line ?? '—'}倍 · 段后: {spacing.paragraph ?? '—'}pt</div>
        {spacing.paragraph_before != null && <div>段前: {spacing.paragraph_before}pt</div>}
      </div>
    </div>
  );
}

