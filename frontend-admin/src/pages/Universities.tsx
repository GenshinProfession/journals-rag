import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Empty, Input, message, Modal, Pagination, Popconfirm,
  Select, Space, Table, Tag, Tooltip, Typography, Form, Switch,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, EditOutlined,
  CloudDownloadOutlined, GlobalOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiFetch } from '../api/client';

/* ── types ──────────────────────────────────────────────────────────── */

type University = {
  id: string;
  name: string;
  country: string | null;
  alpha_two_code: string | null;
  state_province: string | null;
  domains: string[] | null;
  web_pages: string[] | null;
  enabled: boolean;
};

type UniPage = {
  items: University[];
  total: number;
  page: number;
  page_size: number;
};

/* ── country options (most common) ─────────────────────────────────── */

const COUNTRY_OPTIONS = [
  { value: '', label: '全部国家' },
  { value: 'CN', label: '🇨🇳 中国' },
  { value: 'US', label: '🇺🇸 美国' },
  { value: 'GB', label: '🇬🇧 英国' },
  { value: 'JP', label: '🇯🇵 日本' },
  { value: 'KR', label: '🇰🇷 韩国' },
  { value: 'DE', label: '🇩🇪 德国' },
  { value: 'FR', label: '🇫🇷 法国' },
  { value: 'AU', label: '🇦🇺 澳大利亚' },
  { value: 'CA', label: '🇨🇦 加拿大' },
  { value: 'RU', label: '🇷🇺 俄罗斯' },
  { value: 'IN', label: '🇮🇳 印度' },
  { value: 'SG', label: '🇸🇬 新加坡' },
  { value: 'HK', label: '🇭🇰 中国香港' },
  { value: 'TW', label: '🇹🇼 中国台湾' },
];

/* ── component ─────────────────────────────────────────────────────── */

export function Universities() {
  const qc = useQueryClient();
  const [msgApi, ctx] = message.useMessage();
  const ok = (t: string) => msgApi.success(t);

  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Edit / Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<University | null>(null);
  const [form] = Form.useForm();

  /* ── query ──────────────────────────────────────────────────────── */

  const uniQ = useQuery({
    queryKey: ['admin', 'universities', search, country, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (country) params.set('country', country);
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      return apiFetch(`/api/admin/universities?${params}`) as Promise<UniPage>;
    },
  });

  const data = uniQ.data;

  /* ── mutations ──────────────────────────────────────────────────── */

  const seedMut = useMutation({
    mutationFn: () => apiFetch('/api/admin/universities/seed', { method: 'POST' }) as Promise<{ created: number; total: number }>,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'universities'] });
      ok(`导入完成：新增 ${res.created} 所，总计 ${res.total} 所`);
    },
    onError: () => msgApi.error('导入失败'),
  });

  const createMut = useMutation({
    mutationFn: (body: object) => apiFetch('/api/admin/universities', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'universities'] }); ok('新增成功'); setModalOpen(false); },
    onError: () => msgApi.error('新增失败'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; [k: string]: unknown }) =>
      apiFetch(`/api/admin/universities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'universities'] }); ok('已更新'); setModalOpen(false); },
    onError: () => msgApi.error('更新失败'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/universities/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'universities'] }); ok('已删除'); },
    onError: () => msgApi.error('删除失败'),
  });

  /* ── modal helpers ──────────────────────────────────────────────── */

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalOpen(true);
  }

  function openEdit(u: University) {
    setEditing(u);
    form.setFieldsValue({
      name: u.name,
      country: u.country,
      alpha_two_code: u.alpha_two_code,
      state_province: u.state_province,
      domains: u.domains?.join(', ') ?? '',
      web_pages: u.web_pages?.join(', ') ?? '',
      enabled: u.enabled,
    });
    setModalOpen(true);
  }

  function handleSubmit() {
    form.validateFields().then((vals) => {
      const body = {
        ...vals,
        domains: vals.domains ? vals.domains.split(/[,，]\s*/).filter(Boolean) : null,
        web_pages: vals.web_pages ? vals.web_pages.split(/[,，]\s*/).filter(Boolean) : null,
      };
      if (editing) {
        updateMut.mutate({ id: editing.id, ...body });
      } else {
        createMut.mutate(body);
      }
    });
  }

  /* ── table columns ─────────────────────────────────────────────── */

  const columns: ColumnsType<University> = [
    {
      title: '学校名称', dataIndex: 'name', key: 'name', width: 320, ellipsis: true,
      render: (v: string, r: University) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {!r.enabled && <Tag color="red">已禁用</Tag>}
        </Space>
      ),
    },
    {
      title: '国家', dataIndex: 'country', key: 'country', width: 140,
      render: (v: string | null, r: University) => <>{r.alpha_two_code ? <Tag>{r.alpha_two_code}</Tag> : null} {v || '-'}</>,
    },
    {
      title: '省/州', dataIndex: 'state_province', key: 'state_province', width: 150,
      render: (v: string | null) => v || '-',
    },
    {
      title: '域名', dataIndex: 'domains', key: 'domains', width: 220, ellipsis: true,
      render: (v: string[] | null) => v?.join(', ') || '-',
    },
    {
      title: '网站', dataIndex: 'web_pages', key: 'web_pages', width: 200, ellipsis: true,
      render: (v: string[] | null) => v?.length ? (
        <a href={v[0]} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{v[0]}</a>
      ) : '-',
    },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right',
      render: (_: unknown, r: University) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => deleteMut.mutate(r.id)} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '24px 0' }}>
      {ctx}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <GlobalOutlined style={{ marginRight: 8, color: '#1a73e8' }} />
          全球高校目录
        </Typography.Title>
        <Space>
          <Tooltip title="从 JSON 数据文件导入全球高校（增量，不会重复）">
            <Button icon={<CloudDownloadOutlined />} loading={seedMut.isPending} onClick={() => seedMut.mutate()}>
              导入基础数据
            </Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增高校
          </Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索学校名称…"
            prefix={<SearchOutlined style={{ color: '#9aa0a6' }} />}
            style={{ width: 280 }}
            allowClear
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          <Select
            style={{ width: 160 }}
            value={country}
            onChange={v => { setCountry(v); setPage(1); }}
            options={COUNTRY_OPTIONS}
          />
          <span style={{ color: '#9aa0a6', fontSize: 13 }}>
            共 {data?.total ?? 0} 条记录
          </span>
        </Space>
      </Card>

      {!data?.total && !uniQ.isLoading ? (
        <Empty
          description="暂无数据，请先点击「导入基础数据」"
          style={{ marginTop: 80 }}
        />
      ) : (
        <>
          <Table
            rowKey="id"
            dataSource={data?.items ?? []}
            columns={columns}
            pagination={false}
            loading={uniQ.isLoading}
            size="small"
            scroll={{ x: 1100 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={data?.total ?? 0}
              showSizeChanger
              pageSizeOptions={['20', '50', '100']}
              onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
              showTotal={(total) => `共 ${total} 条`}
            />
          </div>
        </>
      )}

      {/* ── Create / Edit Modal ──────────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={editing ? '编辑高校' : '新增高校'}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={createMut.isPending || updateMut.isPending}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        destroyOnClose
        width={540}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="学校名称" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="如：北京大学 / Peking University" maxLength={300} />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="country" label="国家" style={{ flex: 1 }}>
              <Input placeholder="如：China" maxLength={120} />
            </Form.Item>
            <Form.Item name="alpha_two_code" label="国家代码" style={{ width: 100 }}>
              <Input placeholder="CN" maxLength={4} />
            </Form.Item>
          </Space>
          <Form.Item name="state_province" label="省 / 州">
            <Input placeholder="如：Beijing" maxLength={200} />
          </Form.Item>
          <Form.Item name="domains" label="域名（逗号分隔）">
            <Input placeholder="pku.edu.cn, mail.pku.edu.cn" />
          </Form.Item>
          <Form.Item name="web_pages" label="网站（逗号分隔）">
            <Input placeholder="https://www.pku.edu.cn/" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
