import { Button, Card, Space } from 'antd';
import { FileTextOutlined, DatabaseOutlined, WalletOutlined } from '@ant-design/icons';
import { useWriterAuth } from '../auth/WriterAuthContext';

export function Landing() {
  const { openLoginModal } = useWriterAuth();

  return (
    <div style={{ maxWidth: 600, margin: '80px auto 0', textAlign: 'center' }}>
      <h1 style={{ fontSize: 28, fontWeight: 400, color: '#202124', marginBottom: 8 }}>
        论文工作台
      </h1>
      <p style={{ fontSize: 15, color: '#5f6368', marginBottom: 32, lineHeight: 1.6 }}>
        管理课题与参考文献，完成 RAG 入库、大纲与章节生成。<br />
        登录后创建项目并进入论文向导。
      </p>
      <Button type="primary" size="large" onClick={() => openLoginModal()} style={{ marginBottom: 48 }}>
        登录
      </Button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'left' }}>
        <Card style={{ borderColor: '#e8eaed' }}>
          <FileTextOutlined style={{ fontSize: 24, color: '#1a73e8', marginBottom: 12 }} />
          <h3 style={{ fontSize: 14, fontWeight: 500, color: '#202124', marginBottom: 4 }}>项目与模板</h3>
          <p style={{ fontSize: 13, color: '#5f6368', margin: 0 }}>按学校模板与学科创建课题，统一管理标准参考文献。</p>
        </Card>
        <Card style={{ borderColor: '#e8eaed' }}>
          <DatabaseOutlined style={{ fontSize: 24, color: '#1a73e8', marginBottom: 12 }} />
          <h3 style={{ fontSize: 14, fontWeight: 500, color: '#202124', marginBottom: 4 }}>RAG 与生成</h3>
          <p style={{ fontSize: 13, color: '#5f6368', margin: 0 }}>确认切片与向量索引后，在课题范围内检索并生成章节。</p>
        </Card>
        <Card style={{ borderColor: '#e8eaed' }}>
          <WalletOutlined style={{ fontSize: 24, color: '#1a73e8', marginBottom: 12 }} />
          <h3 style={{ fontSize: 14, fontWeight: 500, color: '#202124', marginBottom: 4 }}>余额与导出</h3>
          <p style={{ fontSize: 13, color: '#5f6368', margin: 0 }}>查看钱包与调用记录，导出 Markdown、LaTeX 或 Word。</p>
        </Card>
      </div>

      <p style={{ marginTop: 32, fontSize: 13, color: '#9aa0a6' }}>
        账号由管理员在后台开通
      </p>
    </div>
  );
}
