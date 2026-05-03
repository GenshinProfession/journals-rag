import { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space, Radio,
  Popconfirm, message, Typography, InputNumber, Switch, Checkbox, Tooltip,
} from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { getProxies, createProxy, updateProxy, deleteProxy, testProxy, checkProxyTarget, getMembers } from '@/api'
import { useAuth } from '@/auth/AuthContext'

const { Text } = Typography

const PROXY_TYPES = [
  { label: 'HTTP', value: 'HTTP' },
  { label: 'HTTPS', value: 'HTTPS' },
  { label: 'SOCKS5', value: 'SOCKS5' },
]

const IP_CHECKERS = [
  { label: 'IP2Location', value: 'IP2Location' },
  { label: 'ipinfo.io', value: 'ipinfo' },
  { label: 'ip-api.com', value: 'ip-api' },
  { label: 'ipapi.co', value: 'ipapi' },
]

const PROVIDERS = [
  { label: '通用', value: '通用' },
  { label: '快代理', value: '快代理' },
  { label: '芝麻代理', value: '芝麻代理' },
  { label: '品易代理', value: '品易代理' },
  { label: 'Luminati', value: 'Luminati' },
  { label: 'Smartproxy', value: 'Smartproxy' },
  { label: 'Decodo', value: 'Decodo' },
]

const EXTRACT_MODES = [
  { label: '每次打开浏览器窗口都提取新IP', value: 'PER_WINDOW' },
  { label: '定时自动提取', value: 'TIMED' },
]

export default function ProxyPool() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [proxies, setProxies] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [testing, setTesting] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [form] = Form.useForm()
  const [checkModalOpen, setCheckModalOpen] = useState(false)
  const [checkProxyId, setCheckProxyId] = useState<number | null>(null)
  const [checkUrl, setCheckUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<any>(null)
  const mode = Form.useWatch('mode', form) || 'CUSTOM'

  const load = () => {
    setLoading(true)
    getProxies().then((r: any) => setProxies(r.data || []))
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    if (isAdmin) getMembers().then((r: any) => setMembers((r.data || []).filter((m: any) => m.status === 'ACTIVE'))).catch(() => {})
  }, [])

  const openCreate = () => {
    setEditingId(null); form.resetFields()
    form.setFieldsValue({ mode: 'CUSTOM', proxyType: 'HTTPS', ipVersion: 'IPv4', ipChecker: 'IP2Location', provider: '通用', extractMode: 'PER_WINDOW', extractProtocol: 'SOCKS5', memberId: user?.memberId })
    setModalOpen(true)
  }
  const openEdit = (r: any) => { setEditingId(r.id); form.setFieldsValue(r); setModalOpen(true) }
  const memberLabel = (memberId?: number) => {
    const m = members.find((item: any) => item.id === memberId)
    return m ? `${m.name}${m.username ? ` (${m.username})` : ''}` : (memberId ? `成员 ${memberId}` : '-')
  }

  const handleSave = async () => {
    const v = await form.validateFields()
    try {
      if (editingId) { await updateProxy(editingId, v); message.success('已更新') }
      else { await createProxy(v); message.success('已创建') }
      setModalOpen(false); load()
    } catch { message.error('操作失败') }
  }

  const handleTest = async (id: number) => {
    setTesting(id)
    setTestResult(null)
    try {
      const res: any = await testProxy(id)
      const d = res.data || {}
      setTestResult(d)
      if (d.success) {
        message.success(`连通 — ${d.ip}`)
        load() // 刷新列表以更新 lastIp
      } else {
        message.error(`不通: ${d.message}`)
      }
    } catch { message.error('测试失败') }
    finally { setTesting(null) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>代理池</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            管理代理 IP，绑定到商户实现请求隔离
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加代理</Button>
      </div>

      <Table dataSource={proxies} rowKey="id" loading={loading} pagination={false} size="middle"
        columns={[
          { title: '名称', dataIndex: 'name', width: 140, render: (v: string) => v || '-' },
          { title: '方式', dataIndex: 'mode', width: 90,
            render: (v: string) => <Tag color={v === 'CUSTOM' ? 'blue' : 'purple'}>{v === 'CUSTOM' ? '自定义' : 'API提取'}</Tag> },
          { title: '类型', dataIndex: 'proxyType', width: 80, render: (v: string) => <Tag>{v}</Tag> },
          { title: '地址', width: 200,
            render: (_: any, r: any) => r.mode === 'CUSTOM'
              ? <Text code style={{ fontSize: 11 }}>{r.host}:{r.port}</Text>
              : <Text code style={{ fontSize: 11 }}>{(r.extractUrl || '').slice(0, 30)}...</Text> },
          { title: '认证', width: 100,
            render: (_: any, r: any) => r.username
              ? <Tag color="green">已配置</Tag>
              : <Tag color="default">无</Tag> },
          { title: '出口 IP', dataIndex: 'lastIp', width: 130,
            render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">未检测</Text> },
          ...(isAdmin ? [{ title: '归属成员', dataIndex: 'memberId', width: 140, render: (v: number) => memberLabel(v) }] : []),
          { title: '状态', dataIndex: 'status', width: 70,
            render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag> },
          { title: '操作', width: 160,
            render: (_: any, r: any) => (
              <Space size={4}>
                <Button size="small" type="link" loading={testing === r.id} onClick={() => handleTest(r.id)}>检测IP</Button>
                <Button size="small" type="link" onClick={() => { setCheckProxyId(r.id); setCheckUrl(''); setCheckResult(null); setCheckModalOpen(true) }}>检测目标</Button>
                <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                <Popconfirm title="确认删除？" onConfirm={async () => { try { await deleteProxy(r.id); message.success('已删除'); load() } catch { message.error('失败') } }}>
                  <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ) },
        ]}
      />

      {/* 代理检测结果 */}
      {testResult && testResult.success && (
        <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: '#16a34a', fontSize: 14 }}>IP: {testResult.ip}</span>
            <Tag color="green">检测通过 (HTTP {testResult.httpCode})</Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 24px', fontSize: 13, color: '#374151' }}>
            <span>国家/地区：{testResult.country || '-'}{testResult.countryCode ? ` (${testResult.countryCode})` : ''}</span>
            <span>州/省：{testResult.region || '-'}</span>
            <span>城市：{testResult.city || '-'}</span>
            <span>经度/纬度：{testResult.lat != null && testResult.lon != null ? `${testResult.lon}/${testResult.lat}` : '-'}</span>
            <span>时区：{testResult.timezone || '-'}</span>
            <span>邮编：{testResult.zip || '-'}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#a1a1aa' }}>
            查询渠道: {testResult.checker || '-'}
          </div>
          <Button size="small" type="link" onClick={() => setTestResult(null)} style={{ padding: 0, marginTop: 4, fontSize: 12 }}>关闭</Button>
        </div>
      )}

      <div style={{ marginTop: 12, background: '#f8f9fc', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#71717a' }}>
        <div style={{ fontWeight: 500, marginBottom: 4, color: '#606266' }}>IP 查询渠道说明</div>
        <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
          <li>不同的 IP 查询渠道，可能会存在一定的检测结果差异。若检测结果与实际信息不符，可调整 IP 查询渠道以确保准确性。</li>
          <li>若窗口的指纹设置中勾选了基于 IP 生成（语言、界面语言、时区、地理位置），请确保所选 IP 查询渠道的检测结果与实际信息相符，否则会导致自动生成产生误差。</li>
        </ul>
      </div>

      <Modal title={editingId ? '编辑代理' : '添加代理'} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleSave}
        okText={editingId ? '保存' : '创建'} cancelText="取消" width={560}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="备注名称">
            <Input placeholder="可选，方便识别" />
          </Form.Item>
          {isAdmin && (
            <Form.Item name="memberId" label="归属成员" rules={[{ required: true, message: '请选择' }]}>
              <Select placeholder="选择成员" showSearch optionFilterProp="label"
                options={members.map((m: any) => ({ label: `${m.name} (${m.username})`, value: m.id }))} />
            </Form.Item>
          )}
          <Form.Item name="mode" label="代理方式" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="CUSTOM">自定义代理</Radio.Button>
              <Radio.Button value="API_EXTRACT">使用代理IP平台API提取链接提取</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {mode === 'CUSTOM' && (
            <>
              <div style={{ display: 'flex', gap: 12 }}>
                <Form.Item name="ipChecker" label={<span>IP查询渠道 <Tooltip title="用于检测代理出口IP的地理位置"><InfoCircleOutlined style={{ color: '#a1a1aa' }} /></Tooltip></span>} style={{ flex: 1 }}>
                  <Select options={IP_CHECKERS} />
                </Form.Item>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Form.Item name="proxyType" label="代理类型" style={{ flex: 1 }} rules={[{ required: true }]}>
                  <Select options={PROXY_TYPES} />
                </Form.Item>
                <Form.Item name="ipVersion" label="IP协议" style={{ flex: 1 }}>
                  <Radio.Group>
                    <Radio value="IPv4">IPv4</Radio>
                    <Radio value="IPv6">IPv6</Radio>
                  </Radio.Group>
                </Form.Item>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Form.Item name="host" label="代理主机" style={{ flex: 2 }} rules={[{ required: true, message: '请输入' }]}>
                  <Input placeholder="dc.decodo.com" />
                </Form.Item>
                <Form.Item name="port" label="代理端口" style={{ flex: 1 }} rules={[{ required: true, message: '请输入' }]}>
                  <InputNumber placeholder="10026" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Form.Item name="username" label="代理账号" style={{ flex: 1 }}>
                  <Input placeholder="可选" />
                </Form.Item>
                <Form.Item name="password" label="代理密码" style={{ flex: 1 }}>
                  <Input.Password placeholder="可选" visibilityToggle />
                </Form.Item>
              </div>
              <Form.Item name="refreshUrl" label="刷新URL" extra="部分代理支持通过 URL 刷新 IP">
                <Input placeholder="可选" />
              </Form.Item>
              <Form.Item name="udpEnabled" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Checkbox>UDP协议 <Tooltip title="启用 UDP 转发，部分代理支持"><InfoCircleOutlined style={{ color: '#a1a1aa' }} /></Tooltip></Checkbox>
              </Form.Item>
            </>
          )}

          {mode === 'API_EXTRACT' && (
            <>
              <div style={{ display: 'flex', gap: 12 }}>
                <Form.Item name="provider" label="服务商" style={{ flex: 1 }}>
                  <Select options={PROVIDERS} />
                </Form.Item>
                <Form.Item name="extractProtocol" label="代理协议" style={{ flex: 1 }}>
                  <Select options={PROXY_TYPES} />
                </Form.Item>
              </div>
              <Form.Item name="extractMode" label="提取方式">
                <Select options={EXTRACT_MODES} />
              </Form.Item>
              <Form.Item name="checkDuplicate" valuePropName="checked">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Switch size="small" checked={form.getFieldValue('checkDuplicate')} onChange={v => form.setFieldsValue({ checkDuplicate: v })} />
                  <span style={{ fontSize: 13, color: '#606266' }}>
                    校验重复
                    <Tooltip title="打开窗口时，将检测提取的IP是否在本系统中被使用过，如果检测到IP在本系统中使用过，则尝试重新提取IP，最多重新提取5次。">
                      <InfoCircleOutlined style={{ color: '#a1a1aa', marginLeft: 4 }} />
                    </Tooltip>
                  </span>
                </div>
              </Form.Item>
              <Form.Item name="extractUrl" label="提取链接" rules={[{ required: true, message: '请输入提取链接地址' }]}>
                <Input placeholder="请输入提取链接地址" />
              </Form.Item>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c2410c' }}>
                注意：大部分代理IP平台，需要将本地设备的IP加入其白名单，方可正常访问提取链接，如若出现异常请自行添加白名单！
              </div>
            </>
          )}
        </Form>
      </Modal>

      {/* 检测目标弹窗 */}
      <Modal title="检测代理目标可达性" open={checkModalOpen}
        onCancel={() => setCheckModalOpen(false)} footer={null} width={520}>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: '#606266', marginBottom: 12 }}>
            通过代理访问指定 URL，验证能否正常到达目标服务器。
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'Yandex Market API', url: 'https://api.partner.market.yandex.ru' },
              { label: 'Ozon', url: 'https://www.ozon.ru' },
              { label: 'Google', url: 'https://www.google.com' },
              { label: 'Yandex 首页', url: 'https://market.yandex.ru' },
            ].map(t => (
              <Button key={t.url} size="small"
                type={checkUrl === t.url ? 'primary' : 'default'}
                onClick={() => setCheckUrl(t.url)}>{t.label}</Button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input value={checkUrl} onChange={e => setCheckUrl(e.target.value)}
              placeholder="输入目标 URL，如 https://api.partner.market.yandex.ru"
              onPressEnter={async () => {
                if (!checkUrl || !checkProxyId) return
                setChecking(true); setCheckResult(null)
                try {
                  const res: any = await checkProxyTarget(checkProxyId, checkUrl)
                  setCheckResult(res.data)
                } catch { setCheckResult({ success: false, message: '请求失败' }) }
                finally { setChecking(false) }
              }} />
            <Button type="primary" loading={checking} disabled={!checkUrl}
              onClick={async () => {
                if (!checkUrl || !checkProxyId) return
                setChecking(true); setCheckResult(null)
                try {
                  const res: any = await checkProxyTarget(checkProxyId, checkUrl)
                  setCheckResult(res.data)
                } catch { setCheckResult({ success: false, message: '请求失败' }) }
                finally { setChecking(false) }
              }}>检测</Button>
          </div>
          {checkResult && (
            <div style={{
              padding: 14, borderRadius: 10,
              background: checkResult.success ? '#f0fdf4' : '#fef2f2',
              border: checkResult.success ? '1px solid #bbf7d0' : '1px solid #fecaca',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{checkResult.success ? '✅' : '❌'}</span>
                <span style={{ fontWeight: 600, color: checkResult.success ? '#16a34a' : '#dc2626' }}>
                  {checkResult.success ? '可达' : '不可达'}
                </span>
                {checkResult.httpCode && <Tag>{`HTTP ${checkResult.httpCode}`}</Tag>}
                {checkResult.latency != null && <Tag color="blue">{checkResult.latency}ms</Tag>}
              </div>
              <div style={{ fontSize: 12, color: '#606266' }}>
                {checkResult.targetUrl && <div>目标: {checkResult.targetUrl}</div>}
                <div>{checkResult.message}</div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
