import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Checkbox, Input, Modal, Popconfirm, Select, Space, Switch,
  Table, Tag, Tooltip, message
} from 'antd';
import {
  PlusOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined,
  BankOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

type UserRow = {
  id: string; username: string; nickname: string | null; role: string;
  is_active: boolean; manage_all_schools: boolean; assigned_school_ids: string[];
};
type SchoolOption = { id: string; name: string };

export function Members() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [manageAll, setManageAll] = useState(false);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<UserRow | null>(null);
  const [assignSchools, setAssignSchools] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<UserRow[]>
  });

  const schoolsQ = useQuery({
    queryKey: ['admin', 'schools'],
    queryFn: () => apiFetch('/api/admin/schools/schools') as Promise<SchoolOption[]>
  });
  const schoolMap = new Map((schoolsQ.data ?? []).map(s => [s.id, s.name]));

  const admins = (data ?? []).filter(u => u.role === 'admin');

  const createMut = useMutation({
    mutationFn: (body: {
      username: string; password: string; nickname?: string;
      manage_all_schools: boolean; assigned_school_ids?: string[];
    }) => apiFetch('/api/admin/users/admin', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      message.success('管理员已创建');
      setCreateOpen(false);
    },
    onError: (e: Error) => message.error(e.message)
  });

  const updateMut = useMutation({
    mutationFn: (body: { id: string; is_active?: boolean; password?: string; manage_all_schools?: boolean }) => {
      const { id, ...payload } = body;
      return apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); message.success('已更新'); },
    onError: (e: Error) => message.error(e.message)
  });

  const assignMut = useMutation({
    mutationFn: (body: { userId: string; school_ids: string[] }) =>
      apiFetch(`/api/admin/users/${body.userId}/schools`, {
        method: 'PUT', body: JSON.stringify({ school_ids: body.school_ids })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      message.success('学校分配已更新');
      setAssignOpen(false);
    },
    onError: (e: Error) => message.error(e.message)
  });

  const resetPassword = (user: UserRow) => {
    const pwd = window.prompt(`为 ${user.username} 设置新密码（至少 6 位）`);
    if (!pwd) return;
    updateMut.mutate({ id: user.id, password: pwd });
  };

  const handleCreate = () => {
    const u = username.trim();
    if (!u || password.length < 6) { message.warning('用户名不能为空，密码至少 6 位'); return; }
    createMut.mutate({
      username: u, password, nickname: nickname.trim() || undefined,
      manage_all_schools: manageAll,
      assigned_school_ids: manageAll ? undefined : selectedSchools,
    });
  };

  const openAssign = (u: UserRow) => {
    setAssignTarget(u);
    setAssignSchools(u.assigned_school_ids ?? []);
    setAssignOpen(true);
  };

  const columns: ColumnsType<UserRow> = [
    { title: '用户名', dataIndex: 'username', width: 140, ellipsis: true },
    { title: '昵称', dataIndex: 'nickname', width: 100, ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '状态', dataIndex: 'is_active', width: 72, align: 'center',
      render: (v: boolean) => v ? <Badge status="success" text="启用" /> : <Badge status="error" text="停用" />
    },
    {
      title: '学校权限', key: 'schools', width: 280, ellipsis: true,
      render: (_: unknown, u: UserRow) => {
        if (u.manage_all_schools) return <Tag color="blue">全部学校</Tag>;
        const ids = u.assigned_school_ids ?? [];
        if (ids.length === 0) return <span style={{ color: '#9aa0a6' }}>未分配</span>;
        return (
          <span>
            {ids.slice(0, 3).map(sid => (
              <Tag key={sid}>{schoolMap.get(sid) ?? sid.slice(0, 8)}</Tag>
            ))}
            {ids.length > 3 && <Tag>+{ids.length - 3}</Tag>}
          </span>
        );
      }
    },
    {
      title: '操作', key: 'actions', width: 160, align: 'center',
      render: (_: unknown, u: UserRow) => (
        <Space size={4}>
          <Tooltip title="分配学校"><Button size="small" type="text" icon={<BankOutlined />} onClick={() => openAssign(u)} /></Tooltip>
          <Tooltip title="重置密码"><Button size="small" type="text" icon={<KeyOutlined />} onClick={() => resetPassword(u)} /></Tooltip>
          <Popconfirm title={`确认${u.is_active ? '停用' : '启用'}？`} onConfirm={() => updateMut.mutate({ id: u.id, is_active: !u.is_active })}>
            <Tooltip title={u.is_active ? '停用' : '启用'}>
              <Button size="small" type="text" icon={u.is_active ? <StopOutlined style={{ color: '#f9ab00' }} /> : <CheckCircleOutlined style={{ color: '#34a853' }} />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const Label = ({ text, required, children }: { text: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: '#202124', fontWeight: 500 }}>
        {text}{required && <span style={{ color: '#d93025', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );

  const schoolOptions = (schoolsQ.data ?? []).map(s => ({ label: s.name, value: s.id }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>成员管理</h2>
          <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 14 }}>
            管理后台管理员账号，分配可管理的学校范围。代写账号请在「代写账号」页面管理。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          setUsername(''); setPassword(''); setNickname('');
          setManageAll(false); setSelectedSchools([]);
          setCreateOpen(true);
        }}>
          新增管理员
        </Button>
      </div>

      <Table<UserRow>
        rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={admins}
        pagination={false} style={{ borderRadius: 8 }}
      />

      {/* Create admin */}
      <Modal
        title="新增管理员"
        open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)}
        okText="创建" cancelText="取消" confirmLoading={createMut.isPending}
        width={480} destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
          <Label text="用户名" required>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="登录用户名" autoComplete="off" />
          </Label>
          <Label text="密码" required>
            <Input.Password value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
          </Label>
          <Label text="昵称">
            <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="可选" />
          </Label>
          <div>
            <Checkbox checked={manageAll} onChange={e => setManageAll(e.target.checked)}>
              管理全部学校
            </Checkbox>
          </div>
          {!manageAll && (
            <Label text="分配学校">
              <Select
                mode="multiple" allowClear placeholder="选择可管理的学校"
                style={{ width: '100%' }} options={schoolOptions}
                value={selectedSchools} onChange={setSelectedSchools}
                filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                showSearch
              />
            </Label>
          )}
        </div>
      </Modal>

      {/* Assign schools */}
      <Modal
        title={`分配学校 — ${assignTarget?.nickname || assignTarget?.username || ''}`}
        open={assignOpen}
        onOk={() => assignTarget && assignMut.mutate({ userId: assignTarget.id, school_ids: assignSchools })}
        onCancel={() => setAssignOpen(false)}
        okText="保存" cancelText="取消" confirmLoading={assignMut.isPending}
        width={480} destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0 4px' }}>
          <div>
            <Switch
              checked={assignTarget?.manage_all_schools}
              onChange={v => {
                if (assignTarget) updateMut.mutate({ id: assignTarget.id, manage_all_schools: v });
              }}
            />{' '}
            <span style={{ fontSize: 13 }}>管理全部学校</span>
          </div>
          {!assignTarget?.manage_all_schools && (
            <Label text="选择可管理的学校">
              <Select
                mode="multiple" allowClear placeholder="搜索学校名称"
                style={{ width: '100%' }} options={schoolOptions}
                value={assignSchools} onChange={setAssignSchools}
                filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                showSearch
              />
            </Label>
          )}
        </div>
      </Modal>
    </div>
  );
}
