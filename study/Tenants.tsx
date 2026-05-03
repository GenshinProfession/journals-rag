import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Modal, Input, Transfer, Tag, Space, message, Popconfirm,
  Tabs, InputNumber, Switch, Card, Tooltip, Typography, Badge, Alert,
} from 'antd'
import {
  PlusOutlined, MenuOutlined, SettingOutlined, SafetyCertificateOutlined,
  ThunderboltOutlined, CloudServerOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import {
  getTenants, createTenant, updateTenant, deleteTenant,
  assignTenantMenus, getMenus, getTenantLimit, updateTenantLimit, getPluginReleases,
} from '@/api'

const { Text } = Typography

interface MenuOption { id: number; key: string; name: string }
interface Tenant {
  id: number; code: string; name: string; status: string
  menus: MenuOption[]
}

interface PluginInfo {
  pluginName: string
  displayName: string
}

/* ── 限制策略定义 ─────────────────────────────────── */

interface LimitField {
  key: string
  label: string
  type: 'number' | 'switch'
  tip: string
  min?: number
  max?: number
  suffix?: string
  defaultValue: any
}

interface LimitCategory {
  key: string
  label: string
  icon: React.ReactNode
  color: string
  description: string
  fields: LimitField[]
}

const LIMIT_CATEGORIES: LimitCategory[] = [
  {
    key: 'processor',
    label: 'SKU 处理器',
    icon: <ThunderboltOutlined />,
    color: '#1677ff',
    description: '控制 SKU Processor 插件的并发和速率',
    fields: [
      { key: 'maxWorkers', label: '最大 Worker 数', type: 'number', tip: '启动时直接拉满的 Worker 数量（1-10）', min: 1, max: 10, suffix: '个', defaultValue: 10 },
      { key: 'claimBatchSize', label: '每次下发条数', type: 'number', tip: '每次 claim-next 下发的 SKU 数量', min: 1, max: 500, suffix: '条/次', defaultValue: 50 },
      { key: 'claimIntervalMs', label: '下发间隔', type: 'number', tip: '两次领取 API 调用之间的最小间隔', min: 0, max: 60000, suffix: 'ms', defaultValue: 0 },
      { key: 'workerDelayMs', label: 'Worker 批次间隔', type: 'number', tip: '每个 Worker 处理完一批 SKU 后的强制等待时间，直接控制处理速度。例如 5000 = 每批处理后等 5 秒', min: 0, max: 60000, suffix: 'ms', defaultValue: 0 },
    ],
  },
  {
    key: 'collector',
    label: 'SKU 采集器',
    icon: <CloudServerOutlined />,
    color: '#52c41a',
    description: '控制 SKU Collector 插件的并发和采集限制',
    fields: [
      { key: 'maxWorkers', label: '最大浏览器数', type: 'number', tip: '该租户下采集器最大同时打开的浏览器数', min: 1, max: 50, suffix: '个', defaultValue: 3 },
      { key: 'claimIntervalMs', label: '下发间隔', type: 'number', tip: '两次领取之间的最小间隔（毫秒）', min: 0, max: 60000, suffix: 'ms', defaultValue: 0 },
      { key: 'workerDelayMs', label: 'Worker 批次间隔', type: 'number', tip: '每个浏览器处理完一批后的强制等待时间，直接控制采集速度', min: 0, max: 60000, suffix: 'ms', defaultValue: 0 },
      { key: 'maxPagesPerJob', label: '单任务页数上限', type: 'number', tip: '单个采集任务最大翻页数，0 表示不限', min: 0, max: 10000, suffix: '页', defaultValue: 0 },
      { key: 'autoScaleEnabled', label: '自动扩容', type: 'switch', tip: '是否允许采集器自动增加浏览器实例', defaultValue: false },
    ],
  },
]

/* ── 限制配置弹窗 ─────────────────────────────────── */

function LimitsModal({ tenant, open, onClose, onSaved }: {
  tenant: Tenant | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [limitsData, setLimitsData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState(LIMIT_CATEGORIES[0].key)
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [allowedPlugins, setAllowedPlugins] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || !tenant) return
    setLoading(true)

    const loadLimits = getTenantLimit(tenant.id)
      .then((res: any) => res?.data || {})
      .catch(() => ({}))

    const loadPlugins = getPluginReleases()
      .then((res: any) => (res?.data || []).map((p: any) => ({
        pluginName: p.pluginName,
        displayName: p.displayName || p.pluginName,
      })))
      .catch(() => [] as PluginInfo[])

    Promise.all([loadLimits, loadPlugins])
      .then(([nextLimits, pluginList]: [Record<string, any>, PluginInfo[]]) => {
        setLimitsData(nextLimits)
        setPlugins(pluginList)

        const allowed = nextLimits['plugins.allowed']
        const names = new Set<string>()
        if (Array.isArray(allowed)) {
          allowed.forEach((n: any) => { if (n) names.add(String(n)) })
        } else if (allowed && typeof allowed === 'object') {
          Object.keys(allowed).forEach(k => names.add(k))
        }
        setAllowedPlugins(names)
      })
      .finally(() => setLoading(false))
  }, [open, tenant])

  const getValue = useCallback((categoryKey: string, fieldKey: string, defaultValue: any) => {
    const k = `${categoryKey}.${fieldKey}`
    return limitsData[k] !== undefined ? limitsData[k] : defaultValue
  }, [limitsData])

  const setValue = useCallback((categoryKey: string, fieldKey: string, value: any) => {
    setLimitsData(prev => ({ ...prev, [`${categoryKey}.${fieldKey}`]: value }))
  }, [])

  const handleSave = async () => {
    if (!tenant) return
    const payload = { ...limitsData }
    const allowedArr = Array.from(allowedPlugins)
    if (allowedArr.length > 0) {
      payload['plugins.allowed'] = allowedArr
    } else {
      delete payload['plugins.allowed']
    }
    setSaving(true)
    try {
      await updateTenantLimit(tenant.id, payload)
      message.success('限制配置已保存')
      onSaved()
      onClose()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const renderField = (cat: LimitCategory, field: LimitField) => {
    const val = getValue(cat.key, field.key, field.defaultValue)
    return (
      <div key={field.key} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: 8, background: '#fafafa',
        marginBottom: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong>{field.label}</Text>
            <Tooltip title={field.tip}>
              <InfoCircleOutlined style={{ color: '#999', fontSize: 13 }} />
            </Tooltip>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>{field.tip}</Text>
        </div>
        <div style={{ marginLeft: 24, minWidth: 140, textAlign: 'right' }}>
          {field.type === 'number' ? (
            <InputNumber
              value={val}
              min={field.min}
              max={field.max}
              onChange={v => setValue(cat.key, field.key, v)}
              addonAfter={field.suffix}
              style={{ width: 140 }}
            />
          ) : (
            <Switch
              checked={!!val}
              onChange={v => setValue(cat.key, field.key, v)}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          )}
        </div>
      </div>
    )
  }

  const togglePlugin = (pluginName: string, checked: boolean) => {
    setAllowedPlugins(prev => {
      const next = new Set(prev)
      if (checked) next.add(pluginName)
      else next.delete(pluginName)
      return next
    })
  }

  const renderPluginLimitTab = () => (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="子租户插件白名单"
        description="开启的插件将对该租户可见，子租户始终只能下载最新版本。未开启的插件对该租户不可见。"
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {plugins.map(p => (
          <div key={p.pluginName} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderRadius: 8, background: '#fafafa',
          }}>
            <div>
              <Text strong>{p.displayName}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{p.pluginName}</Text></div>
            </div>
            <Switch
              checked={allowedPlugins.has(p.pluginName)}
              onChange={v => togglePlugin(p.pluginName, v)}
              checkedChildren="开放"
              unCheckedChildren="关闭"
            />
          </div>
        ))}
        {plugins.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无已发布的插件</div>
        )}
      </div>
    </div>
  )

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
          <span>限制配置 — {tenant?.name || ''}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      width={640}
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          ...LIMIT_CATEGORIES.map(cat => ({
            key: cat.key,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {cat.icon}
                {cat.label}
              </span>
            ),
            children: loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
            ) : (
              <div>
                <div style={{
                  padding: '8px 12px', borderRadius: 6, marginBottom: 12,
                  background: `${cat.color}08`, border: `1px solid ${cat.color}20`,
                }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>{cat.description}</Text>
                </div>
                {cat.fields.map(f => renderField(cat, f))}
              </div>
            ),
          })),
          {
            key: 'plugins',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudServerOutlined />
                插件白名单
              </span>
            ),
            children: loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
            ) : renderPluginLimitTab(),
          },
        ]}
      />
    </Modal>
  )
}

/* ── 主页面 ─────────────────────────────────── */

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [allMenus, setAllMenus] = useState<MenuOption[]>([])
  const [loading, setLoading] = useState(false)

  // create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  // menu assign modal
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([])

  // limits modal
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [limitsTenant, setLimitsTenant] = useState<Tenant | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [tr, mr] = await Promise.all([getTenants(), getMenus()])
      setTenants((tr as any).data || [])
      setAllMenus((mr as any).data || [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [])

  // 创建后显示的管理员凭证
  const [credentialInfo, setCredentialInfo] = useState<{ username: string; secretKey: string } | null>(null)

  const handleCreate = async () => {
    if (!newCode.trim() || !newName.trim()) return message.warning('编码和名称不能为空')
    try {
      const res: any = await createTenant({ code: newCode.trim(), name: newName.trim() })
      const data = res?.data
      if (data?.adminUsername && data?.adminSecretKey) {
        setCredentialInfo({ username: data.adminUsername, secretKey: data.adminSecretKey })
      } else {
        message.success('创建成功')
      }
      setCreateOpen(false); setNewCode(''); setNewName('')
      fetchAll()
    } catch { message.error('创建失败') }
  }

  const handleToggleStatus = async (t: Tenant) => {
    const next = t.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    await updateTenant(t.id, { status: next })
    message.success(next === 'ACTIVE' ? '已启用' : '已停用')
    fetchAll()
  }

  const openMenuAssign = (t: Tenant) => {
    setCurrentTenant(t)
    setSelectedMenuIds(t.menus.map((m) => String(m.id)))
    setMenuOpen(true)
  }

  const handleAssignMenus = async () => {
    if (!currentTenant) return
    await assignTenantMenus(currentTenant.id, selectedMenuIds.map(Number))
    message.success('菜单分配成功')
    setMenuOpen(false)
    fetchAll()
  }

  const openLimits = (t: Tenant) => {
    setLimitsTenant(t)
    setLimitsOpen(true)
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60, align: 'center' as const },
    { title: '编码', dataIndex: 'code', width: 140 },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center' as const,
      render: (s: string) => (
        <Badge status={s === 'ACTIVE' ? 'success' : 'error'} text={s === 'ACTIVE' ? '启用' : '停用'} />
      ),
    },
    {
      title: '已分配菜单', dataIndex: 'menus',
      render: (menus: MenuOption[]) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {menus?.map((m) => <Tag key={m.id} style={{ margin: 0 }}>{m.name}</Tag>)}
          {(!menus || menus.length === 0) && <Text type="secondary">未分配</Text>}
        </div>
      ),
    },
    {
      title: '操作', width: 280, align: 'center' as const,
      render: (_: any, t: Tenant) => (
        <Space size={4}>
          <Tooltip title="限制配置">
            <Button size="small" icon={<SettingOutlined />} onClick={() => openLimits(t)}>限制</Button>
          </Tooltip>
          <Tooltip title="分配菜单">
            <Button size="small" icon={<MenuOutlined />} onClick={() => openMenuAssign(t)}>菜单</Button>
          </Tooltip>
          <Button size="small" onClick={() => handleToggleStatus(t)}>
            {t.status === 'ACTIVE' ? '停用' : '启用'}
          </Button>
          {t.id !== 1 && (
            <Popconfirm title="确认删除该租户？" onConfirm={async () => { await deleteTenant(t.id); fetchAll() }}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>租户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建租户</Button>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tenants}
          loading={loading}
          pagination={false}
          size="middle"
          style={{ borderRadius: 8 }}
        />
      </Card>

      {/* 新建租户 */}
      <Modal title="新建租户" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)} destroyOnClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4 }}>租户编码</div>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="如 CompanyA" />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>租户名称</div>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如 A公司" />
          </div>
        </div>
      </Modal>

      {/* 菜单分配 */}
      <Modal title={`分配菜单 — ${currentTenant?.name || ''}`} open={menuOpen} onOk={handleAssignMenus} onCancel={() => setMenuOpen(false)} width={600} destroyOnClose>
        <Transfer
          dataSource={allMenus.map((m) => ({ key: String(m.id), title: m.name }))}
          titles={['可选菜单', '已分配菜单']}
          targetKeys={selectedMenuIds}
          onChange={(keys) => setSelectedMenuIds(keys as string[])}
          render={(item) => item.title || ''}
          listStyle={{ width: 240, height: 320 }}
        />
      </Modal>

      {/* 限制配置 */}
      <LimitsModal
        tenant={limitsTenant}
        open={limitsOpen}
        onClose={() => setLimitsOpen(false)}
        onSaved={fetchAll}
      />

      {/* 创建成功后显示管理员凭证 */}
      <Modal
        title="🎉 租户创建成功"
        open={!!credentialInfo}
        onOk={() => setCredentialInfo(null)}
        onCancel={() => setCredentialInfo(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="我已记录"
      >
        {credentialInfo && (
          <div>
            <Alert type="warning" showIcon style={{ marginBottom: 16 }}
              message="请立即保存以下凭证，密钥仅显示一次！" />
            <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary">管理员账号</Text>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace' }}>{credentialInfo.username}</div>
              </div>
              <div>
                <Text type="secondary">登录密钥</Text>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all',
                  background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', marginTop: 4 }}>
                  {credentialInfo.secretKey}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
