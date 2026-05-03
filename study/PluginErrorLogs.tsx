import { useEffect, useState } from 'react'
import { Table, Tag, Select, Space, Card, Statistic, Row, Col, Tooltip } from 'antd'
import { BugOutlined, WarningOutlined, ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { getPluginErrorLogs, getPluginErrorStats } from '@/api'
import dayjs from 'dayjs'

const PLUGIN_TYPES = [
  { label: '全部', value: '' },
  { label: 'SKU 采集器', value: 'SKU_COLLECTOR' },
  { label: 'SKU 解析器', value: 'SKU_PROCESSOR' },
  { label: '补充采集', value: 'WEIGHT_SCRAPER' },
  { label: 'SKU 同步', value: 'SKU_SYNC' },
]

const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'red', WARN: 'orange', FATAL: 'volcano', INFO: 'blue',
}

/** 从 detail JSON 提取可读的错误原因 */
function extractReason(detail: any): string {
  if (!detail || typeof detail !== 'object') return ''
  // last_error 是我们新增的关键字段
  if (detail.last_error) return detail.last_error
  // reason 字段（MAX_RESTART_EXCEEDED 用）
  if (detail.reason) return detail.reason
  return ''
}

/** 格式化 detail 为简洁的标签展示 */
function renderDetail(detail: any) {
  if (!detail || typeof detail !== 'object' || Object.keys(detail).length === 0) return '-'
  const reason = extractReason(detail)
  const tags: { label: string; value: string }[] = []

  if (detail.worker_id !== undefined) tags.push({ label: 'Worker', value: `#${detail.worker_id}` })
  if (detail.consecutive_errors) tags.push({ label: '连续失败', value: `${detail.consecutive_errors}次` })
  if (detail.restarts !== undefined) tags.push({ label: '重启', value: `${detail.restarts}次` })
  if (detail.batch_size) tags.push({ label: '批次', value: `${detail.batch_size}` })
  if (detail.failed) tags.push({ label: '失败', value: `${detail.failed}` })

  return (
    <div style={{ lineHeight: '22px' }}>
      {reason && (
        <div style={{ color: '#cf1322', fontWeight: 500, marginBottom: tags.length ? 4 : 0 }}>
          {reason}
        </div>
      )}
      {tags.length > 0 && (
        <Space size={4} wrap>
          {tags.map((t, i) => (
            <Tag key={i} style={{ margin: 0, fontSize: 11 }}>{t.label}: {t.value}</Tag>
          ))}
        </Space>
      )}
    </div>
  )
}

export default function PluginErrorLogs() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [pluginType, setPluginType] = useState('')
  const [stats, setStats] = useState<any[]>([])

  const loadLogs = (p = 0, pt = pluginType) => {
    setLoading(true)
    const params: any = { tenantId: 1, page: p, size: 50 }
    if (pt) params.pluginType = pt
    getPluginErrorLogs(params)
      .then((r: any) => {
        const d = r.data || {}
        setLogs(d.records || [])
        setTotal(d.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadStats = () => {
    getPluginErrorStats(1)
      .then((r: any) => setStats(r.data || []))
      .catch(() => {})
  }

  useEffect(() => { loadLogs(); loadStats() }, [])

  const totalErrors = stats.reduce((s: number, r: any) => s + (r.count || 0), 0)
  const fatalCount = stats.filter((r: any) =>
    (r.errorCode || '').includes('MAX_RESTART') || (r.errorCode || '').includes('FATAL')
  ).reduce((s: number, r: any) => s + (r.count || 0), 0)
  const error403 = stats.filter((r: any) =>
    (r.errorCode || '').includes('403')
  ).reduce((s: number, r: any) => s + (r.count || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>插件错误日志</h2>
        <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
          各插件运行时自动上报的错误记录，含 403 反爬、连续失败、浏览器崩溃等
        </p>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="近 7 天错误总数" value={totalErrors}
              prefix={<BugOutlined />} valueStyle={{ color: totalErrors > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="403 反爬拦截" value={error403}
              prefix={<WarningOutlined />} valueStyle={{ color: error403 > 0 ? '#fa8c16' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="致命错误 (人机验证)" value={fatalCount}
              prefix={<ThunderboltOutlined />} valueStyle={{ color: fatalCount > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      {stats.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }} title="近 7 天错误分布">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {stats.map((s: any, i: number) => (
              <Tag key={i} color={LEVEL_COLOR[(s.errorCode || '').includes('FATAL') ? 'FATAL' : 'ERROR']}>
                {s.pluginType} / {s.errorCode || '未知'}: {s.count} 次
              </Tag>
            ))}
          </div>
        </Card>
      )}

      <div style={{ marginBottom: 12 }}>
        <Space>
          <span style={{ fontSize: 13, color: '#606266' }}>插件类型：</span>
          <Select value={pluginType} onChange={v => { setPluginType(v); setPage(0); loadLogs(0, v) }}
            options={PLUGIN_TYPES} style={{ width: 160 }} />
        </Space>
      </div>

      <Table dataSource={logs} rowKey="id" loading={loading} size="middle"
        pagination={{
          current: page + 1, pageSize: 50, total,
          onChange: (p) => { setPage(p - 1); loadLogs(p - 1) },
          showTotal: (t) => `共 ${t} 条`,
        }}
        columns={[
          { title: '时间', dataIndex: 'createdAt', width: 170,
            render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
          { title: '级别', dataIndex: 'level', width: 80,
            render: (v: string) => <Tag color={LEVEL_COLOR[v] || 'default'}>{v}</Tag> },
          { title: '插件', dataIndex: 'pluginType', width: 110,
            render: (v: string) => {
              const m: Record<string, string> = {
                SKU_COLLECTOR: '采集器', SKU_PROCESSOR: '解析器',
                WEIGHT_SCRAPER: '补充采集', SKU_SYNC: '同步',
              }
              return <Tag>{m[v] || v}</Tag>
            } },
          { title: '错误码', dataIndex: 'errorCode', width: 160,
            render: (v: string) => v ? <Tag color="red">{v}</Tag> : '-' },
          { title: '消息', dataIndex: 'message', width: 280, ellipsis: true,
            render: (v: string) => (
              <Tooltip title={v}><span>{v || '-'}</span></Tooltip>
            ) },
          { title: '错误详情', dataIndex: 'detail', width: 300,
            render: (_: any, record: any) => {
              let detail = record.detail
              if (typeof detail === 'string') {
                try { detail = JSON.parse(detail) } catch { return <span style={{ color: '#999' }}>{detail || '-'}</span> }
              }
              return renderDetail(detail)
            } },
          { title: '机器', dataIndex: 'machineName', width: 100,
            render: (v: string) => v || '-' },
        ]}
      />
    </div>
  )
}
