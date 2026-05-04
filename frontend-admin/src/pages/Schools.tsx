import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, Col, Empty, Input, List, message, Modal,
  Popconfirm, Row, Select, Space, Tag, Tooltip, Typography, InputNumber
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined,
  CheckCircleOutlined, StopOutlined, RightOutlined, SettingOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';

type School = {
  id: string; name: string; country: string | null;
  logo_url: string | null; enabled: boolean;
};

type TemplateGroup = {
  id: string; school_id: string; degree_level: string;
  discipline: string | null; year: number | null;
  citation_style: string | null; enabled: boolean;
  has_structure: boolean; has_format_rules: boolean; has_citation_rules: boolean;
};

const DEGREE_OPTIONS = [
  { value: 'bachelor', label: '本科 Bachelor' },
  { value: 'master', label: '硕士 Master' },
  { value: 'doctor', label: '博士 Doctor' },
];

export function Schools() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({
    degree_level: 'master', discipline: '', year: new Date().getFullYear(), citation_style: 'GB/T 7714'
  });

  // ── Queries ──────────────────────────────────────────────────────────────
  const schoolsQ = useQuery({
    queryKey: ['admin', 'schools'],
    queryFn: () => apiFetch('/api/admin/schools/schools') as Promise<School[]>
  });

  const groupsQ = useQuery({
    queryKey: ['admin', 'groups', selectedSchool?.id],
    queryFn: () => apiFetch(`/api/admin/schools/schools/${selectedSchool!.id}/groups`) as Promise<TemplateGroup[]>,
    enabled: !!selectedSchool,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
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

  const createGroupMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch('/api/admin/schools/groups', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups', selectedSchool?.id] });
      message.success('模板目录已创建');
      setCreateOpen(false);
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

  // ── Filtered list ────────────────────────────────────────────────────────
  const filteredSchools = useMemo(() => {
    const all = schoolsQ.data ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter(s => s.name.toLowerCase().includes(q)) : all;
  }, [schoolsQ.data, search]);

  // ── Create group ─────────────────────────────────────────────────────────
  const handleCreateGroup = () => {
    if (!selectedSchool) return;
    createGroupMut.mutate({
      school_id: selectedSchool.id,
      degree_level: newGroup.degree_level,
      discipline: newGroup.discipline.trim() || null,
      year: newGroup.year || null,
      citation_style: newGroup.citation_style.trim() || null,
    });
  };

  // ── Completeness badge ───────────────────────────────────────────────────
  const completeness = (g: TemplateGroup) => {
    const count = [g.has_structure, g.has_format_rules, g.has_citation_rules].filter(Boolean).length;
    if (count === 3) return <Tag color="green">完整</Tag>;
    if (count > 0) return <Tag color="orange">{count}/3</Tag>;
    return <Tag color="red">空</Tag>;
  };

  const degreeLabel = (v: string) => DEGREE_OPTIONS.find(o => o.value === v)?.label ?? v;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>学校模板管理</h2>
        <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
          左侧选择学校 → 右侧管理模板目录 → 点击编辑进入模板详情
        </p>
      </div>

      <Row gutter={20} style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* ── LEFT: School list ─────────────────────────────────────── */}
        <Col span={8} style={{ borderRight: '1px solid #e8eaed', paddingRight: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#9aa0a6' }} />}
              placeholder="搜索学校"
              value={search} onChange={e => setSearch(e.target.value)}
              allowClear style={{ borderRadius: 20, height: 36 }}
            />
            <Tooltip title="从预置列表初始化学校（幂等操作）">
              <Button onClick={() => bootstrapMut.mutate()} loading={bootstrapMut.isPending}>
                初始化
              </Button>
            </Tooltip>
          </div>

          {schoolsQ.isLoading && <Card loading style={{ borderRadius: 8 }} />}

          <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            <List
              dataSource={filteredSchools}
              locale={{ emptyText: <Empty description="暂无学校数据，请先初始化" /> }}
              renderItem={s => (
                <List.Item
                  key={s.id}
                  onClick={() => setSelectedSchool(s)}
                  style={{
                    cursor: 'pointer', padding: '10px 12px', borderRadius: 6,
                    background: selectedSchool?.id === s.id ? '#e8f0fe' : 'transparent',
                    opacity: s.enabled ? 1 : 0.5,
                    marginBottom: 2,
                  }}
                  extra={
                    <Tooltip title={s.enabled ? '禁用' : '启用'}>
                      <Button
                        type="text" size="small"
                        icon={s.enabled ? <CheckCircleOutlined style={{ color: '#34a853' }} /> : <StopOutlined style={{ color: '#d93025' }} />}
                        onClick={e => { e.stopPropagation(); toggleSchoolMut.mutate(s); }}
                      />
                    </Tooltip>
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: selectedSchool?.id === s.id ? 500 : 400 }}>{s.name}</span>
                    {!s.enabled && <Tag color="red" style={{ fontSize: 11 }}>禁用</Tag>}
                  </div>
                </List.Item>
              )}
            />
          </div>
        </Col>

        {/* ── RIGHT: Template groups ───────────────────────────────── */}
        <Col span={16} style={{ paddingLeft: 16 }}>
          {!selectedSchool && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9aa0a6' }}>
              <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                ← 请先从左侧选择一所学校
              </Typography.Text>
            </div>
          )}

          {selectedSchool && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <Typography.Title level={4} style={{ margin: 0, fontWeight: 500 }}>
                    {selectedSchool.name}
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    模板目录 · 每条对应一个学位层级×专业×年份组合
                  </Typography.Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新增模板目录
                </Button>
              </div>

              {groupsQ.isLoading && <Card loading style={{ borderRadius: 8 }} />}

              {!groupsQ.isLoading && (groupsQ.data ?? []).length === 0 && (
                <Empty description="该学校暂无模板目录" style={{ padding: 60 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    创建第一个模板目录
                  </Button>
                </Empty>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(groupsQ.data ?? []).map(g => (
                  <Card
                    key={g.id}
                    hoverable
                    style={{ borderRadius: 8, opacity: g.enabled ? 1 : 0.55, border: '1px solid #e8eaed', boxShadow: 'none' }}
                    styles={{ body: { padding: '12px 16px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Typography.Text strong style={{ fontSize: 14 }}>
                          {degreeLabel(g.degree_level)}
                        </Typography.Text>
                        {g.discipline && <Tag>{g.discipline}</Tag>}
                        {g.year && <Tag color="blue">{g.year}</Tag>}
                        {g.citation_style && <Typography.Text type="secondary" style={{ fontSize: 12 }}>引用: {g.citation_style}</Typography.Text>}
                        {completeness(g)}
                        {!g.enabled && <Tag color="red">禁用</Tag>}
                      </div>
                      <Space>
                        <Tooltip title="编辑模板内容">
                          <Button
                            type="primary" ghost size="small"
                            icon={<SettingOutlined />}
                            onClick={() => nav(`/schools/edit/${g.id}`)}
                          >
                            编辑
                          </Button>
                        </Tooltip>
                        <Tooltip title={g.enabled ? '禁用' : '启用'}>
                          <Button type="text" size="small"
                            icon={g.enabled ? <StopOutlined style={{ color: '#f9ab00' }} /> : <CheckCircleOutlined style={{ color: '#34a853' }} />}
                            onClick={() => toggleGroupMut.mutate(g)}
                          />
                        </Tooltip>
                        <Popconfirm title="确认删除此模板目录？所有关联内容将被删除。" onConfirm={() => deleteGroupMut.mutate(g.id)}>
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

      {/* ── Create group modal (Step 1 only) ───────────────────────── */}
      <Modal
        title="新增模板目录"
        open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreateGroup}
        okText="下一步：编辑模板内容" cancelText="取消"
        confirmLoading={createGroupMut.isPending} width={420} destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>学位层级 <span style={{ color: '#d93025' }}>*</span></div>
            <Select
              style={{ width: '100%' }} options={DEGREE_OPTIONS}
              value={newGroup.degree_level} onChange={v => setNewGroup(p => ({ ...p, degree_level: v }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>专业/方向</div>
            <Input
              value={newGroup.discipline}
              onChange={e => setNewGroup(p => ({ ...p, discipline: e.target.value }))}
              placeholder="如：设计学、美术学"
            />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>年份</div>
            <InputNumber
              style={{ width: '100%' }}
              value={newGroup.year}
              onChange={v => setNewGroup(p => ({ ...p, year: v ?? new Date().getFullYear() }))}
              min={2000} max={2099}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>引用格式</div>
            <Input
              value={newGroup.citation_style}
              onChange={e => setNewGroup(p => ({ ...p, citation_style: e.target.value }))}
              placeholder="GB/T 7714"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
