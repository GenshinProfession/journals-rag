import { useEffect, useState } from 'react'
import { Avatar, Card, Form, Input, Button, message, Spin, Tag, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { getProfile, updateProfile } from '@/api'
import { useAuth } from '@/auth/AuthContext'

const { Text } = Typography

export default function ProfilePage() {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const avatarUrl = Form.useWatch('avatarUrl', form)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await getProfile()
        const data = res.data?.data || res.data || {}
        form.setFieldsValue({
          name: data.name || '',
          username: data.username || '',
          roleName: data.sysRole?.name || data.role || '',
          avatarUrl: data.avatarUrl || '',
          phone: data.phone || '',
          email: data.email || '',
          feishuUserId: data.feishuUserId || '',
          feishuOpenId: data.feishuOpenId || '',
        })
      } catch {
        message.error('加载个人信息失败')
      }
      setLoading(false)
    })()
  }, [form])

  const handleSave = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      await updateProfile({
        phone: values.phone || '',
        email: values.email || '',
        feishuUserId: values.feishuUserId || '',
        feishuOpenId: values.feishuOpenId || '',
        avatarUrl: values.avatarUrl || '',
      })
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          <UserOutlined style={{ marginRight: 8 }} />个人空间
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9ca3af' }}>
          管理个人信息，配置通知接收方式
        </p>
      </div>

      <Card style={{ maxWidth: 720 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <Form form={form} layout="vertical">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
              <Avatar size={72} src={avatarUrl || undefined} icon={<UserOutlined />} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{form.getFieldValue('name') || user?.name}</div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">@{form.getFieldValue('username') || user?.username}</Text>
                  <Tag color="blue" style={{ marginLeft: 8 }}>{form.getFieldValue('roleName') || user?.roleName}</Tag>
                </div>
                <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                  授权密钥只能由管理员在成员管理中刷新，个人详情不提供自助刷新。
                </Text>
              </div>
            </div>
            <Form.Item name="name" label="姓名">
              <Input disabled />
            </Form.Item>
            <Form.Item name="avatarUrl" label="头像 URL">
              <Input placeholder="请输入头像图片 URL" />
            </Form.Item>
            <Form.Item name="phone" label="手机号">
              <Input placeholder="请输入手机号" />
            </Form.Item>
            <Form.Item name="email" label="邮箱">
              <Input placeholder="请输入邮箱" />
            </Form.Item>
            <Form.Item name="feishuUserId" label="飞书 User ID">
              <Input placeholder="请输入飞书 User ID" />
            </Form.Item>
            <Form.Item name="feishuOpenId" label="飞书 Open ID">
              <Input placeholder="请输入飞书 Open ID" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSave} loading={saving}>
                保存
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  )
}
