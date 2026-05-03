import { useEffect, useState } from 'react'
import { Table, Button, Modal, Input, Tag, message, Popconfirm, Transfer, Typography } from 'antd'
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { getRoles, createRole, updateRole, deleteRole, assignRoleMenus, getMenus } from '@/api'

const { Text } = Typography

export default function Roles() {
  const [roles, setRoles] = useState<any[]>([])
  const [allMenus, setAllMenus] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // 创建角色
  const [createOpen, setCreateOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  // 分配菜单
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentRole, setCurrentRole] = useState<any>(null)
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [rolesRes, menusRes]: any[] = await Promise.all([getRoles(), getMenus()])
      setRoles(rolesRes.data || [])
      setAllMenus(menusRes.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newCode.trim()) return message.warning('请输入角色编码')
    if (!newName.trim()) return message.warning('请输入角色名称')
    try {
      await createRole({ code: newCode.trim().toUpperCase(), name: newName.trim(), description: newDesc.trim() })
      message.success('创建成功')
      setCreateOpen(false)
      setNewCode('')
      setNewName('')
      setNewDesc('')
      load()
    } catch { /* handled by interceptor */ }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteRole(id)
      message.success('已删除')
      load()
    } catch { /* handled */ }
  }

  const openMenuAssign = (role: any) => {
    setCurrentRole(role)
    setSelectedMenuIds((role.menus || []).map((m: any) => String(m.id)))
    setMenuOpen(true)
  }

  const handleAssign = async () => {
    if (!currentRole) return
    try {
      await assignRoleMenus(currentRole.id, selectedMenuIds.map(Number))
      message.success('菜单分配成功')
      setMenuOpen(false)
      load()
    } catch { /* handled */ }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '编码', dataIndex: 'code', width: 120,
      render: (v: string) => <Text code>{v}</Text>,
    },
    { title: '名称', dataIndex: 'name', width: 120 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '菜单数', width: 80,
      render: (_: any, r: any) => <Tag color="blue">{(r.menus || []).length}</Tag>,
    },
    {
      title: '操作', width: 200,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openMenuAssign(record)}>
            分配菜单
          </Button>
          {record.code !== 'ADMIN' && (
            <Popconfirm title="确定删除此角色？" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>角色管理</h2>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
            管理系统角色，为角色分配可访问的菜单
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建角色</Button>
        </div>
      </div>

      <Table dataSource={roles} columns={columns} rowKey="id" loading={loading} pagination={false} size="middle" />

      {/* 创建角色 */}
      <Modal
        title="新建角色"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>角色编码（英文大写）</div>
            <Input placeholder="例如：PURCHASER" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>角色名称</div>
            <Input placeholder="例如：采购" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>描述（可选）</div>
            <Input.TextArea placeholder="角色描述" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} />
          </div>
        </div>
      </Modal>

      {/* 分配菜单 */}
      <Modal
        title={`分配菜单 — ${currentRole?.name || ''}`}
        open={menuOpen}
        onCancel={() => setMenuOpen(false)}
        onOk={handleAssign}
        okText="保存"
        width={600}
      >
        <div style={{ padding: '12px 0' }}>
          <Transfer
            dataSource={allMenus.map((m: any) => ({
              key: String(m.id),
              title: `${m.name}（${m.key}）`,
            }))}
            titles={['可选菜单', '已分配']}
            targetKeys={selectedMenuIds}
            onChange={(keys) => setSelectedMenuIds(keys as string[])}
            render={(item) => item.title || ''}
            listStyle={{ width: 240, height: 300 }}
          />
        </div>
      </Modal>
    </div>
  )
}
