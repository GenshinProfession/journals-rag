import { Card, Steps, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

export function Guide() {
  const nav = useNavigate();

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 48 }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav(-1)} style={{ marginBottom: 16, color: '#5f6368' }}>
        返回
      </Button>
      <Typography.Title level={2} style={{ fontWeight: 600, color: '#202124' }}>
        ThesisLoom 代写工作台 · 使用教程
      </Typography.Title>
      <Typography.Paragraph style={{ color: '#5f6368', fontSize: 15, marginBottom: 32 }}>
        以下为推荐操作顺序。登录账号由管理员在后台开通；使用前请确认管理员已配置好<strong>模型目录</strong>与（建议）<strong>学校模板</strong>。
      </Typography.Paragraph>

      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: '1. 登录',
              description: '点击右上角或首页的「登录」，输入管理员提供的写作者账号与密钥（密码）。',
            },
            {
              title: '2. 创建论文项目',
              description:
                '在工作台点击侧栏「创建论文项目」或首页大按钮，进入全屏新建页：填写层次、学科/方向，建议勾选与课题匹配的学校模板（用于格式说明与大纲约束），可选填题目与主题说明。提交后会自动进入同一项目的写作流程。',
            },
            {
              title: '3. 标准参考论文',
              description:
                '在「标准参考论文」步骤填写或粘贴文献标题与正文（可先 PDF 转文本），亦可上传 PDF/文本文件。保存后再进行后续审核。',
            },
            {
              title: '4. 审核与 RAG 入库',
              description:
                '选择已保存文献 → 「AI 审核」→ 审核通过后「预切块」→ 在列表中勾选 chunk → 「确认入库」。未通过审核的文献不能进入向量库。',
            },
            {
              title: '5. 检索与大纲',
              description:
                '可在项目内做 RAG 检索；确认有可用向量后点击「生成大纲」，系统会生成章节结构。',
            },
            {
              title: '6. 章节写作与导出',
              description:
                '对每个章节可「生成正文」「审校」「降重改写」，并随时「保存本章」。最后可用 Markdown / LaTeX / Word 导出（导出中会附带学校模板的文字说明，便于在 Word/LaTeX 中继续排版）。',
            },
            {
              title: '7. 余额',
              description:
                '侧边栏进入「余额」查看可用余额与消费流水。余额不足时 AI 调用会失败，需联系管理员充值。',
            },
          ]}
        />
      </Card>

      <Typography.Title level={4} style={{ fontWeight: 600 }}>
        常见问题
      </Typography.Title>
      <ul style={{ color: '#5f6368', lineHeight: 1.8, paddingLeft: 20 }}>
        <li>
          <strong>「项目」和「向导」去哪了？</strong> 已合并为同一工作台：列表里的项目即论文课题，点「进入写作」就是在该课题下按步骤完成全流程。
        </li>
        <li>
          <strong>没有模型可用？</strong> 请管理员在后台「模型目录」中为各场景（如 reference_review、outline、chapter_write 等）启用模型。
        </li>
        <li>
          <strong>学校模板是否必选？</strong> 当前系统仍允许不选模板；若需严格对齐某校格式，请选择对应模板并在管理员端维护好「格式规则」等字段。
        </li>
      </ul>
    </div>
  );
}
