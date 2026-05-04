import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Empty, Input, InputNumber, List, message, Modal,
  Popconfirm, Row, Space, Tag, Tooltip, Typography
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SearchOutlined,
  CheckCircleOutlined, StopOutlined, SettingOutlined,
  ArrowLeftOutlined, RightOutlined, BookOutlined,
  ReadOutlined, ExperimentOutlined, PushpinOutlined, PushpinFilled
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';

/* ── types ──────────────────────────────────────────────────────────── */

type School = {
  id: string; name: string; country: string | null;
  logo_url: string | null; enabled: boolean; is_pinned: boolean;
};

type TemplateGroup = {
  id: string; school_id: string; degree_level: string;
  discipline: string | null; year: number | null;
  citation_style: string | null; enabled: boolean;
  has_structure: boolean; has_format_rules: boolean; has_citation_rules: boolean;
};

/* ── constants ──────────────────────────────────────────────────────── */

const DEGREES = [
  { key: 'bachelor', label: '本科', sub: 'Bachelor', icon: <BookOutlined style={{ fontSize: 22, color: '#34a853' }} /> },
  { key: 'master', label: '硕士', sub: 'Master', icon: <ReadOutlined style={{ fontSize: 22, color: '#1a73e8' }} /> },
  { key: 'doctor', label: '博士', sub: 'Doctor', icon: <ExperimentOutlined style={{ fontSize: 22, color: '#7b1fa2' }} /> },
];

const degreeLabel = (v: string) => DEGREES.find(d => d.key === v)?.label ?? v;

/* ── breadcrumb nav state ───────────────────────────────────────────── */

type DrillLevel = 'degrees' | 'disciplines' | 'years';

export function Schools() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Left panel
  const [search, setSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  // Right panel drill-down
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('degrees');
  const [selectedDegree, setSelectedDegree] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);

  // URL-param restoration flag
  const [restored, setRestored] = useState(false);

  // Modals
  const [addDisciplineOpen, setAddDisciplineOpen] = useState(false);
  const [newDiscipline, setNewDiscipline] = useState('');
  const [addYearOpen, setAddYearOpen] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  /* ── queries ────────────────────────────────────────────────────── */

  const schoolsQ = useQuery({
    queryKey: ['admin', 'schools'],
    queryFn: () => apiFetch('/api/admin/schools/schools') as Promise<School[]>,
  });

  // Restore drill-down from URL params (set by TemplateEditor back-nav)
  useEffect(() => {
    if (restored || !schoolsQ.data) return;
    const pSchool = searchParams.get('school');
    const pDegree = searchParams.get('degree');
    const pDisc = searchParams.get('discipline');
    if (pSchool) {
      const found = schoolsQ.data.find(s => s.id === pSchool);
      if (found) {
        setSelectedSchool(found);
        if (pDegree) {
          setSelectedDegree(pDegree);
          if (pDisc) {
            setSelectedDiscipline(pDisc);
            setDrillLevel('years');
          } else {
            setDrillLevel('disciplines');
          }
        } else {
          setDrillLevel('degrees');
        }
      }
      setSearchParams({}, { replace: true });
    }
    setRestored(true);
  }, [schoolsQ.data, restored, searchParams, setSearchParams]);

  const groupsQ = useQuery({
    queryKey: ['admin', 'groups', selectedSchool?.id],
    queryFn: () => apiFetch(`/api/admin/schools/schools/${selectedSchool!.id}/groups`) as Promise<TemplateGroup[]>,
    enabled: !!selectedSchool,
  });

  /* ── mutations ──────────────────────────────────────────────────── */

  const bootstrapMut = useMutation({
    mutationFn: () => apiFetch('/api/admin/schools/bootstrap-schools', { method: 'POST' }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['admin', 'schools'] });
      message.success(`初始化完成：新增 ${data.created} 所学校`);
    },
  });

  const toggleSchoolMut = useMutation({
    mutationFn: (s: School) => apiFetch(`/api/admin/schools/schools/${s.id}`, {
      method: 'PATCH', body: JSON.stringify({ enabled: !s.enabled }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'schools'] }),
  });

  const pinMut = useMutation({
    mutationFn: (s: School) => apiFetch(`/api/admin/schools/schools/${s.id}/pin`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'schools'] }),
  });

  const createGroupMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch('/api/admin/schools/groups', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups', selectedSchool?.id] });
      message.success('已创建');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/schools/groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups', selectedSchool?.id] });
      message.success('已删除');
    },
  });

  const toggleGroupMut = useMutation({
    mutationFn: (g: TemplateGroup) => apiFetch(`/api/admin/schools/groups/${g.id}`, {
      method: 'PATCH', body: JSON.stringify({ enabled: !g.enabled }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'groups', selectedSchool?.id] }),
  });

  /* ── derived data ───────────────────────────────────────────────── */

  const allGroups = groupsQ.data ?? [];

  const filteredSchools = useMemo(() => {
    const all = schoolsQ.data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? all.filter(s => s.name.toLowerCase().includes(q)) : all;
    return [...filtered].sort((a, b) => (a.is_pinned === b.is_pinned ? 0 : a.is_pinned ? -1 : 1));
  }, [schoolsQ.data, search]);

  // Unique disciplines for selected degree
  const disciplines = useMemo(() => {
    if (!selectedDegree) return [];
    const set = new Set<string>();
    allGroups
      .filter(g => g.degree_level === selectedDegree)
      .forEach(g => { if (g.discipline) set.add(g.discipline); });
    return Array.from(set).sort();
  }, [allGroups, selectedDegree]);

  // Year-level groups for selected degree + discipline
  const yearGroups = useMemo(() => {
    if (!selectedDegree || !selectedDiscipline) return [];
    return allGroups
      .filter(g => g.degree_level === selectedDegree && g.discipline === selectedDiscipline)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }, [allGroups, selectedDegree, selectedDiscipline]);

  // Count groups per degree for badges
  const degreeCount = (degree: string) => allGroups.filter(g => g.degree_level === degree).length;

  // Count year-templates per discipline
  const disciplineCount = (disc: string) =>
    allGroups.filter(g => g.degree_level === selectedDegree && g.discipline === disc).length;

  /* ── drill navigation helpers ───────────────────────────────────── */

  const selectSchool = (s: School) => {
    setSelectedSchool(s);
    setDrillLevel('degrees');
    setSelectedDegree(null);
    setSelectedDiscipline(null);
  };

  const enterDegree = (degree: string) => {
    setSelectedDegree(degree);
    setSelectedDiscipline(null);
    setDrillLevel('disciplines');
  };

  const enterDiscipline = (disc: string) => {
    setSelectedDiscipline(disc);
    setDrillLevel('years');
  };

  const goBack = () => {
    if (drillLevel === 'years') { setSelectedDiscipline(null); setDrillLevel('disciplines'); }
    else if (drillLevel === 'disciplines') { setSelectedDegree(null); setDrillLevel('degrees'); }
  };

  /* ── add discipline ─────────────────────────────────────────────── */

  const handleAddDiscipline = () => {
    if (!newDiscipline.trim() || !selectedSchool || !selectedDegree) return;
    createGroupMut.mutate({
      school_id: selectedSchool.id,
      degree_level: selectedDegree,
      discipline: newDiscipline.trim(),
      year: new Date().getFullYear(),
    }, {
      onSuccess: () => {
        setAddDisciplineOpen(false);
        setNewDiscipline('');
        enterDiscipline(newDiscipline.trim());
      },
    });
  };

  /* ── add year template ──────────────────────────────────────────── */

  const handleAddYear = () => {
    if (!selectedSchool || !selectedDegree || !selectedDiscipline) return;
    createGroupMut.mutate({
      school_id: selectedSchool.id,
      degree_level: selectedDegree,
      discipline: selectedDiscipline,
      year: newYear,
    }, {
      onSuccess: () => { setAddYearOpen(false); },
    });
  };

  /* ── completeness ───────────────────────────────────────────────── */

  const completeness = (g: TemplateGroup) => {
    const count = [g.has_structure, g.has_format_rules, g.has_citation_rules].filter(Boolean).length;
    if (count === 3) return <Tag color="green">完整</Tag>;
    if (count > 0) return <Tag color="orange">{count}/3</Tag>;
    return <Tag color="red">空</Tag>;
  };

  /* ── breadcrumb ─────────────────────────────────────────────────── */

  const breadcrumb = () => {
    const parts: { label: string; onClick?: () => void }[] = [
      { label: selectedSchool?.name ?? '', onClick: () => { setDrillLevel('degrees'); setSelectedDegree(null); setSelectedDiscipline(null); } },
    ];
    if (selectedDegree) {
      parts.push({
        label: degreeLabel(selectedDegree),
        onClick: drillLevel === 'years' ? () => { setDrillLevel('disciplines'); setSelectedDiscipline(null); } : undefined,
      });
    }
    if (selectedDiscipline) {
      parts.push({ label: selectedDiscipline });
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#5f6368', marginBottom: 16 }}>
        {drillLevel !== 'degrees' && (
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={goBack} style={{ marginRight: 4 }} />
        )}
        {parts.map((p, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <RightOutlined style={{ fontSize: 10, color: '#bdc1c6' }} />}
            {p.onClick ? (
              <a onClick={p.onClick} style={{ cursor: 'pointer', color: '#1a73e8' }}>{p.label}</a>
            ) : (
              <span style={{ fontWeight: 500, color: '#202124' }}>{p.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>学校模板管理</h2>
        <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
          选学校 → 选学位层级 → 选专业 → 管理年份模板
        </p>
      </div>

      <Row gutter={20} style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* ══ LEFT: School list ═══════════════════════════════════════ */}
        <Col span={7} style={{ borderRight: '1px solid #e8eaed', paddingRight: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#9aa0a6' }} />}
              placeholder="搜索学校"
              value={search} onChange={e => setSearch(e.target.value)}
              allowClear style={{ borderRadius: 20, height: 36 }}
            />
            <Tooltip title="从预置列表初始化学校（幂等）">
              <Button onClick={() => bootstrapMut.mutate()} loading={bootstrapMut.isPending} size="small" style={{ height: 36 }}>
                初始化
              </Button>
            </Tooltip>
          </div>

          {schoolsQ.isLoading && <Card loading style={{ borderRadius: 8 }} />}

          <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            <List
              dataSource={filteredSchools}
              locale={{ emptyText: <Empty description="暂无学校，请先初始化" /> }}
              renderItem={s => (
                <List.Item
                  key={s.id}
                  onClick={() => selectSchool(s)}
                  style={{
                    cursor: 'pointer', padding: '10px 12px', borderRadius: 6,
                    background: selectedSchool?.id === s.id ? '#e8f0fe' : 'transparent',
                    opacity: s.enabled ? 1 : 0.5, marginBottom: 2,
                  }}
                  extra={
                    <Space size={0}>
                      <Tooltip title={s.is_pinned ? '取消置顶' : '置顶'}>
                        <Button
                          type="text" size="small"
                          icon={s.is_pinned ? <PushpinFilled style={{ color: '#1a73e8' }} /> : <PushpinOutlined style={{ color: '#9aa0a6' }} />}
                          onClick={e => { e.stopPropagation(); pinMut.mutate(s); }}
                        />
                      </Tooltip>
                      <Tooltip title={s.enabled ? '禁用' : '启用'}>
                        <Button
                          type="text" size="small"
                          icon={s.enabled ? <CheckCircleOutlined style={{ color: '#34a853' }} /> : <StopOutlined style={{ color: '#d93025' }} />}
                          onClick={e => { e.stopPropagation(); toggleSchoolMut.mutate(s); }}
                        />
                      </Tooltip>
                    </Space>
                  }
                >
                  <span style={{ fontSize: 14, fontWeight: selectedSchool?.id === s.id ? 500 : 400 }}>
                    {s.name}
                  </span>
                </List.Item>
              )}
            />
          </div>
        </Col>

        {/* ══ RIGHT: Drill-down panel ════════════════════════════════ */}
        <Col span={17} style={{ paddingLeft: 20 }}>
          {!selectedSchool && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                ← 请先从左侧选择一所学校
              </Typography.Text>
            </div>
          )}

          {selectedSchool && groupsQ.isLoading && <Card loading style={{ borderRadius: 8 }} />}

          {/* ── Level 1: Degree (固定三个) ─────────────────────────── */}
          {selectedSchool && !groupsQ.isLoading && drillLevel === 'degrees' && (
            <>
              {breadcrumb()}
              <Typography.Title level={4} style={{ margin: '0 0 20px', fontWeight: 500 }}>
                选择学位层级
              </Typography.Title>
              <Row gutter={[16, 16]}>
                {DEGREES.map(d => (
                  <Col span={8} key={d.key}>
                    <Card
                      hoverable
                      onClick={() => enterDegree(d.key)}
                      style={{ borderRadius: 10, textAlign: 'center', border: '1px solid #e8eaed', cursor: 'pointer' }}
                      styles={{ body: { padding: '28px 16px' } }}
                    >
                      <div style={{ marginBottom: 12 }}>{d.icon}</div>
                      <Typography.Title level={4} style={{ margin: '0 0 4px', fontWeight: 500 }}>{d.label}</Typography.Title>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>{d.sub}</Typography.Text>
                      <div style={{ marginTop: 12 }}>
                        <Tag color={degreeCount(d.key) > 0 ? 'blue' : 'default'}>
                          {degreeCount(d.key)} 个模板
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}

          {/* ── Level 2: Disciplines ──────────────────────────────── */}
          {selectedSchool && !groupsQ.isLoading && drillLevel === 'disciplines' && selectedDegree && (
            <>
              {breadcrumb()}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Typography.Title level={4} style={{ margin: 0, fontWeight: 500 }}>
                  专业 / 方向
                </Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setNewDiscipline(''); setAddDisciplineOpen(true); }}>
                  新增专业
                </Button>
              </div>

              {disciplines.length === 0 && (
                <Empty description="暂无专业，请先新增" style={{ padding: 60 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setNewDiscipline(''); setAddDisciplineOpen(true); }}>
                    新增专业
                  </Button>
                </Empty>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {disciplines.map(disc => (
                  <Card
                    key={disc}
                    hoverable
                    onClick={() => enterDiscipline(disc)}
                    style={{ borderRadius: 8, border: '1px solid #e8eaed', cursor: 'pointer', boxShadow: 'none' }}
                    styles={{ body: { padding: '14px 18px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Typography.Text strong style={{ fontSize: 15 }}>{disc}</Typography.Text>
                        <Tag color="blue">{disciplineCount(disc)} 个年份模板</Tag>
                      </div>
                      <RightOutlined style={{ color: '#bdc1c6' }} />
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ── Level 3: Year templates ───────────────────────────── */}
          {selectedSchool && !groupsQ.isLoading && drillLevel === 'years' && selectedDegree && selectedDiscipline && (
            <>
              {breadcrumb()}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Typography.Title level={4} style={{ margin: 0, fontWeight: 500 }}>
                  年份模板
                </Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setNewYear(new Date().getFullYear()); setAddYearOpen(true); }}>
                  新增年份
                </Button>
              </div>

              {yearGroups.length === 0 && (
                <Empty description="暂无模板，请新增年份" style={{ padding: 60 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setNewYear(new Date().getFullYear()); setAddYearOpen(true); }}>
                    新增年份
                  </Button>
                </Empty>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {yearGroups.map(g => (
                  <Card
                    key={g.id}
                    hoverable
                    style={{ borderRadius: 8, opacity: g.enabled ? 1 : 0.55, border: '1px solid #e8eaed', boxShadow: 'none' }}
                    styles={{ body: { padding: '14px 18px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Typography.Text strong style={{ fontSize: 16 }}>
                          {g.year ?? '通用'}
                        </Typography.Text>
                        {g.citation_style && (
                          <Tag>{g.citation_style}</Tag>
                        )}
                        {completeness(g)}
                        {!g.enabled && <Tag color="red">禁用</Tag>}
                      </div>
                      <Space>
                        <Button
                          type="primary" ghost size="small"
                          icon={<SettingOutlined />}
                          onClick={() => nav(`/schools/edit/${g.id}`)}
                        >
                          编辑模板
                        </Button>
                        <Tooltip title={g.enabled ? '禁用' : '启用'}>
                          <Button type="text" size="small"
                            icon={g.enabled ? <StopOutlined style={{ color: '#f9ab00' }} /> : <CheckCircleOutlined style={{ color: '#34a853' }} />}
                            onClick={() => toggleGroupMut.mutate(g)}
                          />
                        </Tooltip>
                        <Popconfirm title="确认删除？关联的结构、格式和引用模板将全部删除。" onConfirm={() => deleteGroupMut.mutate(g.id)}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </Col>
      </Row>

      {/* ── Modal: Add Discipline ─────────────────────────────────── */}
      <Modal
        title={`新增专业 — ${selectedSchool?.name} · ${degreeLabel(selectedDegree ?? '')}`}
        open={addDisciplineOpen}
        onCancel={() => setAddDisciplineOpen(false)}
        onOk={handleAddDiscipline}
        okText="创建" cancelText="取消"
        confirmLoading={createGroupMut.isPending}
        width={380} destroyOnClose
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>专业名称</div>
          <Input
            value={newDiscipline}
            onChange={e => setNewDiscipline(e.target.value)}
            placeholder="如：设计学、美术学、艺术学理论"
            autoFocus
            onPressEnter={handleAddDiscipline}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
            创建后会自动生成当前年份的模板条目，可进入后继续添加其他年份
          </Typography.Text>
        </div>
      </Modal>

      {/* ── Modal: Add Year ───────────────────────────────────────── */}
      <Modal
        title={`新增年份模板 — ${selectedDiscipline}`}
        open={addYearOpen}
        onCancel={() => setAddYearOpen(false)}
        onOk={handleAddYear}
        okText="创建" cancelText="取消"
        confirmLoading={createGroupMut.isPending}
        width={340} destroyOnClose
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>年份</div>
          <InputNumber
            style={{ width: '100%' }}
            value={newYear}
            onChange={v => setNewYear(v ?? new Date().getFullYear())}
            min={2000} max={2099}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}
