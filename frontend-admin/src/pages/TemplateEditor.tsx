import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Card, Col, Divider, Input, InputNumber, message, Popconfirm,
  Row, Select, Space, Spin, Tabs, Tag, Tooltip, Typography, Upload
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, DragOutlined, InboxOutlined,
  PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined,
  UploadOutlined, FileTextOutlined, CheckCircleOutlined, LoadingOutlined
} from '@ant-design/icons';
import { apiFetch } from '../api/client';

/* ── types ──────────────────────────────────────────────────────────── */

type GroupDetail = {
  id: string; school_id: string; school_name: string;
  degree_level: string; discipline: string | null;
  year: number | null; citation_style: string | null; enabled: boolean;
  has_structure: boolean; has_format_rules: boolean; has_citation_rules: boolean;
};

type Section = {
  type: string;
  template?: string;
  variables?: string[];
  chapters?: string[];
};

/* ── constants ──────────────────────────────────────────────────────── */

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

const DEFAULT_SECTIONS: Section[] = [
  { type: 'cover', template: 'cover_1', variables: ['title', 'author', 'school', 'date', 'advisor'] },
  { type: 'declaration' },
  { type: 'abstract_cn' },
  { type: 'abstract_en' },
  { type: 'toc' },
  { type: 'body', chapters: ['绪论', '文献综述', '研究设计', '分析与讨论', '结论'] },
  { type: 'references' },
  { type: 'acknowledgement' },
];

const DEFAULT_FORMAT = {
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

const DEGREE_LABELS: Record<string, string> = { bachelor: '本科', master: '硕士', doctor: '博士' };

const CITATION_TYPES = ['GB/T 7714', 'APA 7th', 'MLA 9th', 'Chicago 17th', 'IEEE', 'Vancouver', '自定义'];

/* ── component ──────────────────────────────────────────────────────── */

export function TemplateEditor() {
  const { groupId } = useParams<{ groupId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  // ── state: structure ─────────────────────────────────────────────
  const [sections, setSections] = useState<Section[]>([]);
  const [structureFile, setStructureFile] = useState<string | null>(null);

  // ── state: format ────────────────────────────────────────────────
  const [formatData, setFormatData] = useState<Record<string, any>>(DEFAULT_FORMAT);
  const [formatFiles, setFormatFiles] = useState<string[]>([]);
  const [formatAnalyzing, setFormatAnalyzing] = useState(false);

  // ── state: citation ──────────────────────────────────────────────
  const [citationType, setCitationType] = useState('GB/T 7714');
  const [citationExamples, setCitationExamples] = useState<string[]>(['']);
  const [citationRules, setCitationRules] = useState<string[]>(['']);
  const [citationText, setCitationText] = useState('');

  // ── state: saving ────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  /* ── queries ────────────────────────────────────────────────────── */

  const groupQ = useQuery({
    queryKey: ['admin', 'group-detail', groupId],
    queryFn: () => apiFetch(`/api/admin/schools/groups/${groupId}`) as Promise<GroupDetail>,
    enabled: !!groupId,
  });

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

  const group = groupQ.data;

  /* ── init from fetched data ─────────────────────────────────────── */

  useEffect(() => {
    if (structureQ.data?.structure_json?.sections) {
      setSections(structureQ.data.structure_json.sections);
    } else if (!structureQ.isLoading && !structureQ.data) {
      setSections(DEFAULT_SECTIONS);
    }
  }, [structureQ.data, structureQ.isLoading]);

  useEffect(() => {
    if (formatQ.data?.rules_json && Object.keys(formatQ.data.rules_json).length > 0) {
      setFormatData(formatQ.data.rules_json);
    } else if (!formatQ.isLoading && !formatQ.data) {
      setFormatData(DEFAULT_FORMAT);
    }
  }, [formatQ.data, formatQ.isLoading]);

  useEffect(() => {
    if (citationQ.data) {
      const cj = citationQ.data.citation_json;
      if (cj) {
        setCitationType(cj.type ?? 'GB/T 7714');
        setCitationExamples(Array.isArray(cj.examples) && cj.examples.length > 0 ? cj.examples : ['']);
        setCitationRules(Array.isArray(cj.rules) && cj.rules.length > 0 ? cj.rules : ['']);
      }
      setCitationText(citationQ.data.citation_text ?? '');
    }
  }, [citationQ.data]);

  /* ── unified save ───────────────────────────────────────────────── */

  const handleSaveAll = async () => {
    if (!groupId) return;
    setSaving(true);
    try {
      await Promise.all([
        apiFetch(`/api/admin/schools/groups/${groupId}/structure`, {
          method: 'PUT',
          body: JSON.stringify({ structure_json: { sections } }),
        }),
        apiFetch(`/api/admin/schools/groups/${groupId}/format-rules`, {
          method: 'PUT',
          body: JSON.stringify({ rules_json: formatData }),
        }),
        apiFetch(`/api/admin/schools/groups/${groupId}/citation-rules`, {
          method: 'PUT',
          body: JSON.stringify({
            citation_json: {
              type: citationType,
              examples: citationExamples.filter(Boolean),
              rules: citationRules.filter(Boolean),
            },
            citation_text: citationText || null,
          }),
        }),
      ]);
      qc.invalidateQueries({ queryKey: ['template'] });
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
      qc.invalidateQueries({ queryKey: ['admin', 'group-detail', groupId] });
      message.success('全部模板内容已保存');
      setDirty(false);
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  /* ── mark dirty on any change ───────────────────────────────────── */

  const markDirty = () => { if (!dirty) setDirty(true); };

  /* ── structure helpers ──────────────────────────────────────────── */

  const moveSection = useCallback((idx: number, dir: -1 | 1) => {
    setSections(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    markDirty();
  }, [dirty]);

  const removeSection = useCallback((idx: number) => {
    setSections(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  }, [dirty]);

  const addSection = useCallback((type: string) => {
    const sec: Section = { type };
    if (type === 'body') sec.chapters = ['绪论', '研究方法', '分析与讨论', '结论'];
    if (type === 'cover') { sec.template = 'cover_1'; sec.variables = ['title', 'author', 'school', 'date']; }
    setSections(prev => [...prev, sec]);
    markDirty();
  }, [dirty]);

  const updateChapters = useCallback((idx: number, chapters: string[]) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, chapters } : s));
    markDirty();
  }, [dirty]);

  const sectionLabel = (type: string) => SECTION_TYPES.find(t => t.value === type)?.label ?? type;

  const sectionColor = (type: string): string => {
    const map: Record<string, string> = {
      cover: '#1a73e8', declaration: '#5f6368', abstract_cn: '#e37400',
      abstract_en: '#e37400', toc: '#9aa0a6', body: '#34a853',
      references: '#d93025', appendix: '#7b1fa2', acknowledgement: '#00796b',
    };
    return map[type] ?? '#5f6368';
  };

  /* ── structure file upload ──────────────────────────────────────── */

  const handleStructureUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setStructureFile(file.name);
        message.success(`已读取 ${file.name}，稍后将用于 AI 分析结构`);
        markDirty();
      }
    };
    reader.readAsText(file);
    return false;
  };

  /* ── format file upload & "AI analyze" ──────────────────────────── */

  const handleFormatFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        setFormatFiles(prev => [...prev, file.name]);
        message.success(`已添加: ${file.name}`);
      }
    };
    reader.readAsText(file);
    return false;
  };

  const handleAIAnalyzeFormat = () => {
    setFormatAnalyzing(true);
    setTimeout(() => {
      setFormatAnalyzing(false);
      message.info('AI 格式分析功能将在接入 AI 中转站后生效，当前使用默认格式');
    }, 1500);
  };

  /* ── format preview editable fields ─────────────────────────────── */

  const updateFormatField = (path: string[], value: any) => {
    setFormatData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;
      return next;
    });
    markDirty();
  };

  /* ── citation helpers ───────────────────────────────────────────── */

  const updateExample = (idx: number, val: string) => {
    setCitationExamples(prev => prev.map((e, i) => i === idx ? val : e));
    markDirty();
  };
  const addExample = () => { setCitationExamples(prev => [...prev, '']); markDirty(); };
  const removeExample = (idx: number) => { setCitationExamples(prev => prev.filter((_, i) => i !== idx)); markDirty(); };

  const updateRule = (idx: number, val: string) => {
    setCitationRules(prev => prev.map((r, i) => i === idx ? val : r));
    markDirty();
  };
  const addRule = () => { setCitationRules(prev => [...prev, '']); markDirty(); };
  const removeRule = (idx: number) => { setCitationRules(prev => prev.filter((_, i) => i !== idx)); markDirty(); };

  /* ── back navigation ────────────────────────────────────────────── */

  const handleBack = () => {
    if (group) {
      const params = new URLSearchParams({
        school: group.school_id,
        degree: group.degree_level,
        discipline: group.discipline ?? '',
      });
      nav(`/schools?${params.toString()}`);
    } else {
      nav('/schools');
    }
  };

  /* ── loading state ──────────────────────────────────────────────── */

  if (groupQ.isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      {/* ══ Header with unified save ═════════════════════════════════ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24, padding: '12px 16px', background: '#fff',
        borderRadius: 8, border: '1px solid #e8eaed',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
          <Divider type="vertical" style={{ height: 24, margin: 0 }} />
          <div>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {group?.school_name}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ margin: '0 8px' }}>›</Typography.Text>
            <Typography.Text>{DEGREE_LABELS[group?.degree_level ?? ''] ?? group?.degree_level}</Typography.Text>
            <Typography.Text type="secondary" style={{ margin: '0 8px' }}>›</Typography.Text>
            <Typography.Text>{group?.discipline ?? '通用'}</Typography.Text>
            <Typography.Text type="secondary" style={{ margin: '0 8px' }}>›</Typography.Text>
            <Tag color="blue">{group?.year ?? '通用'}</Tag>
          </div>
        </div>
        <Space>
          {dirty && <Tag color="orange">未保存</Tag>}
          <Button
            type="primary" size="large"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSaveAll}
          >
            保存全部
          </Button>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="structure"
        type="card"
        items={[
          /* ══ Tab 1: Structure ═══════════════════════════════════════ */
          {
            key: 'structure',
            label: '结构模板',
            children: (
              <Row gutter={20}>
                {/* Left: upload */}
                <Col span={8}>
                  <Card title="论文规范文件" size="small" style={{ borderRadius: 8, marginBottom: 16 }}>
                    <Upload.Dragger
                      beforeUpload={handleStructureUpload}
                      accept=".pdf,.doc,.docx,.txt"
                      showUploadList={false}
                      multiple={false}
                    >
                      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                      <p className="ant-upload-text" style={{ fontSize: 13 }}>
                        上传学校论文规范文件
                      </p>
                      <p className="ant-upload-hint" style={{ fontSize: 12 }}>
                        PDF / Word / TXT 格式
                      </p>
                    </Upload.Dragger>
                    {structureFile && (
                      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6 }}>
                        <FileTextOutlined style={{ marginRight: 8 }} />
                        <Typography.Text style={{ fontSize: 13 }}>{structureFile}</Typography.Text>
                      </div>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                      上传后系统将 AI 解析出页面结构，也可在右侧手动调整
                    </Typography.Text>
                  </Card>
                </Col>
                {/* Right: visual structure */}
                <Col span={16}>
                  <Card title="页面结构排列" size="small" style={{ borderRadius: 8 }} extra={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      上下移动调整顺序，代写端将按此结构生成
                    </Typography.Text>
                  }>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {sections.map((sec, idx) => (
                        <Card
                          key={`${sec.type}-${idx}`}
                          size="small"
                          style={{ borderLeft: `3px solid ${sectionColor(sec.type)}`, borderRadius: 6 }}
                          styles={{ body: { padding: '6px 10px' } }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <DragOutlined style={{ color: '#9aa0a6', cursor: 'grab' }} />
                                <Tag color={sectionColor(sec.type)} style={{ margin: 0 }}>{sectionLabel(sec.type)}</Tag>
                                {sec.template && <Typography.Text type="secondary" style={{ fontSize: 11 }}>模板: {sec.template}</Typography.Text>}
                              </div>
                              {sec.type === 'body' && sec.chapters && (
                                <div style={{ marginTop: 6, marginLeft: 28 }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {sec.chapters.map((ch, ci) => (
                                      <Tag key={ci} closable onClose={() => updateChapters(idx, sec.chapters!.filter((_, j) => j !== ci))}>{ch}</Tag>
                                    ))}
                                    <Tag style={{ borderStyle: 'dashed', cursor: 'pointer' }}
                                      onClick={() => { const n = prompt('章节名称'); if (n) updateChapters(idx, [...(sec.chapters ?? []), n]); }}>
                                      <PlusOutlined /> 添加
                                    </Tag>
                                  </div>
                                </div>
                              )}
                              {sec.type === 'cover' && sec.variables && (
                                <div style={{ marginTop: 6, marginLeft: 28, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {sec.variables.map((v, vi) => <Tag key={vi} color="geekblue">{v}</Tag>)}
                                </div>
                              )}
                            </div>
                            <Space size={2}>
                              <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveSection(idx, -1)} />
                              <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === sections.length - 1} onClick={() => moveSection(idx, 1)} />
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeSection(idx)} />
                            </Space>
                          </div>
                        </Card>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {SECTION_TYPES.map(t => (
                        <Button key={t.value} size="small" onClick={() => addSection(t.value)}>+ {t.label}</Button>
                      ))}
                    </div>
                  </Card>
                </Col>
              </Row>
            ),
          },

          /* ══ Tab 2: Format Rules ═══════════════════════════════════ */
          {
            key: 'format',
            label: '格式规则',
            children: (
              <Row gutter={20}>
                {/* Left: upload files */}
                <Col span={8}>
                  <Card title="附录 / 规范文件" size="small" style={{ borderRadius: 8, marginBottom: 16 }}>
                    <Upload.Dragger
                      beforeUpload={handleFormatFileUpload}
                      accept=".pdf,.doc,.docx,.txt,.png,.jpg"
                      showUploadList={false}
                      multiple
                    >
                      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                      <p className="ant-upload-text" style={{ fontSize: 13 }}>上传格式规范附录</p>
                      <p className="ant-upload-hint" style={{ fontSize: 12 }}>支持多文件，PDF / Word / 图片</p>
                    </Upload.Dragger>

                    {formatFiles.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {formatFiles.map((f, i) => (
                          <div key={i} style={{ padding: '6px 10px', background: '#f8f9fa', borderRadius: 4, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FileTextOutlined /> {f}
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      type="primary" block
                      style={{ marginTop: 16 }}
                      loading={formatAnalyzing}
                      icon={formatAnalyzing ? <LoadingOutlined /> : <CheckCircleOutlined />}
                      onClick={handleAIAnalyzeFormat}
                      disabled={formatFiles.length === 0}
                    >
                      {formatAnalyzing ? 'AI 分析中…' : 'AI 解析格式规则'}
                    </Button>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                      AI 将从附录文件中提取字体、行距、页边距等格式规则
                    </Typography.Text>
                  </Card>
                </Col>

                {/* Right: editable preview */}
                <Col span={16}>
                  <Card title="格式规则预览" size="small" style={{ borderRadius: 8 }} extra={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>可直接在此修改</Typography.Text>
                  }>
                    <FormatEditablePreview data={formatData} onChange={(path, val) => updateFormatField(path, val)} />
                  </Card>
                </Col>
              </Row>
            ),
          },

          /* ══ Tab 3: Citation Rules ═════════════════════════════════ */
          {
            key: 'citation',
            label: '参考文献模板',
            children: (
              <Row gutter={20}>
                <Col span={12}>
                  <Card title="引用格式设定" size="small" style={{ borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>引用标准</div>
                      <Select
                        style={{ width: '100%' }}
                        value={citationType}
                        onChange={v => { setCitationType(v); markDirty(); }}
                        options={CITATION_TYPES.map(t => ({ value: t, label: t }))}
                      />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                        引用示例
                        <Button type="link" size="small" onClick={addExample}>+ 添加</Button>
                      </div>
                      {citationExamples.map((ex, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <Input
                            value={ex}
                            onChange={e => updateExample(i, e.target.value)}
                            placeholder="[1] 张三. 论文标题[J]. 期刊, 2023."
                            style={{ fontSize: 13 }}
                          />
                          {citationExamples.length > 1 && (
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeExample(i)} />
                          )}
                        </div>
                      ))}
                    </div>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                        格式规则说明
                        <Button type="link" size="small" onClick={addRule}>+ 添加</Button>
                      </div>
                      {citationRules.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <Input
                            value={r}
                            onChange={e => updateRule(i, e.target.value)}
                            placeholder="如：作者不超过3人全部列出"
                            style={{ fontSize: 13 }}
                          />
                          {citationRules.length > 1 && (
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeRule(i)} />
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                </Col>

                <Col span={12}>
                  <Card title="完整引用模板文本（可选）" size="small" style={{ borderRadius: 8, marginBottom: 16 }}>
                    <Input.TextArea
                      value={citationText}
                      onChange={e => { setCitationText(e.target.value); markDirty(); }}
                      rows={14}
                      style={{ fontSize: 13 }}
                      placeholder={
                        '人工整理的完整引用模板，代写端可直接参考：\n\n' +
                        '[1] 张三. 论文标题[J]. 期刊名, 2023, 10(2): 1-10.\n' +
                        '[2] 李四, 王五. 书名[M]. 出版社, 2022.\n' +
                        '...'
                      }
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                      此处文本将完整提供给代写端和 AI，作为引用格式的直接参考
                    </Typography.Text>
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}

/* ── Format editable preview ─────────────────────────────────────── */

function FormatEditablePreview({
  data,
  onChange,
}: {
  data: Record<string, any>;
  onChange: (path: string[], value: any) => void;
}) {
  const font = data.font ?? {};
  const spacing = data.spacing ?? {};
  const margin = data.margin ?? {};
  const page = data.page ?? {};

  const NumField = ({ label, value, path, unit = '', step = 0.5, min = 0 }: {
    label: string; value: any; path: string[]; unit?: string; step?: number; min?: number;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 80, fontSize: 13, color: '#5f6368' }}>{label}</span>
      <InputNumber
        size="small" style={{ width: 80 }}
        value={value} step={step} min={min}
        onChange={v => onChange(path, v)}
      />
      {unit && <span style={{ fontSize: 12, color: '#9aa0a6' }}>{unit}</span>}
    </div>
  );

  const FontRow = ({ name, label, val }: { name: string; label: string; val: any }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Tag style={{ width: 56, textAlign: 'center' }}>{label}</Tag>
      <Input
        size="small" style={{ width: 80 }}
        value={val?.family ?? ''}
        onChange={e => onChange(['font', name, 'family'], e.target.value)}
        placeholder="字体"
      />
      <InputNumber
        size="small" style={{ width: 60 }}
        value={val?.size} min={6} max={72}
        onChange={v => onChange(['font', name, 'size'], v)}
      />
      <span style={{ fontSize: 12, color: '#9aa0a6' }}>pt</span>
      <Select
        size="small" style={{ width: 80 }}
        value={val?.bold ? 'bold' : 'normal'}
        onChange={v => onChange(['font', name, 'bold'], v === 'bold')}
        options={[{ value: 'normal', label: '常规' }, { value: 'bold', label: '加粗' }]}
      />
    </div>
  );

  return (
    <div style={{ fontSize: 13, color: '#202124' }}>
      <div style={{ marginBottom: 16, padding: 14, background: '#f8f9fa', borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>页面设置</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#5f6368', marginBottom: 4 }}>纸张</div>
            <Select size="small" style={{ width: 100 }} value={page.size ?? 'A4'}
              onChange={v => onChange(['page', 'size'], v)}
              options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }, { value: 'B5', label: 'B5' }]}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#5f6368', marginBottom: 4 }}>方向</div>
            <Select size="small" style={{ width: 100 }} value={page.orientation ?? 'portrait'}
              onChange={v => onChange(['page', 'orientation'], v)}
              options={[{ value: 'portrait', label: '纵向' }, { value: 'landscape', label: '横向' }]}
            />
          </div>
        </div>
        <Divider style={{ margin: '10px 0' }} />
        <div style={{ fontWeight: 500, marginBottom: 6 }}>页边距 (cm)</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <NumField label="上" value={margin.top} path={['margin', 'top']} unit="cm" />
          <NumField label="下" value={margin.bottom} path={['margin', 'bottom']} unit="cm" />
          <NumField label="左" value={margin.left} path={['margin', 'left']} unit="cm" />
          <NumField label="右" value={margin.right} path={['margin', 'right']} unit="cm" />
        </div>
      </div>

      <div style={{ marginBottom: 16, padding: 14, background: '#f8f9fa', borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>字体设置</div>
        {Object.entries(font).map(([key, val]) => (
          <FontRow key={key} name={key} label={
            ({ title: '标题', subtitle: '副标题', body: '正文', header: '页眉', footer: '页脚' } as Record<string, string>)[key] ?? key
          } val={val} />
        ))}
      </div>

      <div style={{ padding: 14, background: '#f8f9fa', borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>段落间距</div>
        <NumField label="行距" value={spacing.line} path={['spacing', 'line']} unit="倍" step={0.25} min={1} />
        <NumField label="段后" value={spacing.paragraph} path={['spacing', 'paragraph']} unit="pt" step={1} min={0} />
      </div>
    </div>
  );
}
