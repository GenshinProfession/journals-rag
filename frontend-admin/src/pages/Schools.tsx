import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
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

const EMPTY_FORM = {
  name: '',
  degreeLevel: '',
  discipline: '',
  citationStyle: '',
  minWords: '' as string | number,
  maxWords: '' as string | number,
  formattingRules: '',
};

export function Schools() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolTemplate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

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
      message.success(editing ? '已更新' : '已创建');
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message)
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/schools/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'schools'] }); message.success('已删除'); },
    onError: (e: Error) => message.error(e.message)
  });

  const toggleMut = useMutation({
    mutationFn: (item: SchoolTemplate) =>
      apiFetch(`/api/admin/schools/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !item.enabled })
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'schools'] }); message.success('已切换'); },
    onError: (e: Error) => message.error(e.message)
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: SchoolTemplate) => {
    setEditing(item);
    setForm({
      name: item.name,
      degreeLevel: item.degree_level ?? '',
      discipline: item.discipline ?? '',
      citationStyle: item.citation_style ?? '',
      minWords: item.word_count_min ?? '',
      maxWords: item.word_count_max ?? '',
      formattingRules: item.formatting_rules ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormError('模板名称不能为空');
      return;
    }
    saveMut.mutate({
      name: form.name.trim(),
      degree_level: form.degreeLevel.trim() || null,
      discipline: form.discipline.trim() || null,
      citation_style: form.citationStyle.trim() || null,
      word_count_min: form.minWords !== '' ? Number(form.minWords) : null,
      word_count_max: form.maxWords !== '' ? Number(form.maxWords) : null,
      formatting_rules: form.formattingRules.trim() || null,
      enabled: editing ? editing.enabled : true
    });
  };

  const columns: ColumnsType<SchoolTemplate> = [
    {
      title: '名称', dataIndex: 'name', ellipsis: true,
      render: (name: string, item: SchoolTemplate) => (
        <span>
          {name}
          {!item.enabled && <Tag color="red" style={{ marginLeft: 8 }}>已禁用</Tag>}
        </span>
      )
    },
    {
      title: '层次/专业', key: 'deg', width: 180, ellipsis: true,
      render: (_: unknown, item: SchoolTemplate) => `${item.degree_level || '通用'} / ${item.discipline || '通用'}`
    },
    {
      title: '引用格式', dataIndex: 'citation_style', width: 130, ellipsis: true,
      render: (v: string | null) => v || '—'
    },
    {
      title: '字数范围', key: 'words', width: 130, align: 'right',
      render: (_: unknown, item: SchoolTemplate) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {item.word_count_min ?? '—'} – {item.word_count_max ?? '—'}
        </span>
      )
    },
    {
      title: '操作', key: 'actions', width: 140, align: 'center',
      render: (_: unknown, item: SchoolTemplate) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(item)} />
          </Tooltip>
          <Tooltip title={item.enabled ? '禁用' : '启用'}>
            <Button
              size="small"
              type="text"
              icon={item.enabled ? <StopOutlined style={{ color: '#faad14' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              disabled={toggleMut.isPending}
              onClick={() => toggleMut.mutate(item)}
            />
          </Tooltip>
          <Popconfirm title="确认删除此模板？" onConfirm={() => deleteMut.mutate(item.id)}>
            <Tooltip title="删除">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>学校模板</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            维护学校/专业的格式、引用和字数规则，writer 新建项目时可选择。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模板</Button>
      </div>

      <Table<SchoolTemplate>
        rowKey="id"
        size="middle"
        loading={listQ.isLoading}
        columns={columns}
        dataSource={listQ.data ?? []}
        pagination={false}
        style={{ borderRadius: 8 }}
      />

      <Modal
        title={editing ? `编辑：${editing.name}` : '新增模板'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSave}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={saveMut.isPending}
        width={520}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <F label="模板名称">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例如 清华大学 MBA" />
          </F>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <F label="层次（可空）">
                <Input value={form.degreeLevel} onChange={e => setForm(f => ({ ...f, degreeLevel: e.target.value }))} placeholder="master" />
              </F>
            </div>
            <div style={{ flex: 1 }}>
              <F label="专业/方向（可空）">
                <Input value={form.discipline} onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))} />
              </F>
            </div>
          </div>
          <F label="引用格式（可空）">
            <Input value={form.citationStyle} onChange={e => setForm(f => ({ ...f, citationStyle: e.target.value }))} placeholder="GB/T 7714" />
          </F>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <F label="最少字数">
                <InputNumber
                  style={{ width: '100%' }}
                  value={form.minWords !== '' ? Number(form.minWords) : undefined}
                  min={0}
                  onChange={v => setForm(f => ({ ...f, minWords: v ?? '' }))}
                />
              </F>
            </div>
            <div style={{ flex: 1 }}>
              <F label="最多字数">
                <InputNumber
                  style={{ width: '100%' }}
                  value={form.maxWords !== '' ? Number(form.maxWords) : undefined}
                  min={0}
                  onChange={v => setForm(f => ({ ...f, maxWords: v ?? '' }))}
                />
              </F>
            </div>
          </div>
          <F label="格式规则（可空）">
            <Input.TextArea
              rows={3}
              value={form.formattingRules}
              onChange={e => setForm(f => ({ ...f, formattingRules: e.target.value }))}
            />
          </F>
          {formError && <div className="alert alert--error" style={{ marginBottom: 0 }}>{formError}</div>}
        </div>
      </Modal>
    </div>
  );
}
