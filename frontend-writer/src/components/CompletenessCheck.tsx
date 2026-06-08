import React from 'react';
import { Card, Progress, Tag, List, Alert, Button, Collapse, Typography } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  UploadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';

const { Text, Paragraph, Title } = Typography;
const { Panel } = Collapse;

interface CompletenessDetail {
  type: 'missing' | 'suggestion' | 'required';
  title: string;
  items: string[];
}

interface CompletenessResult {
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'insufficient';
  score: number;
  can_proceed: boolean;
  title: string;
  icon: 'success' | 'warning' | 'error';
  color: string;
  message: string;
  details: CompletenessDetail[];
  required_supplements: string[];
}

interface CompletenessCheckProps {
  result: CompletenessResult;
  onUploadSupplement?: () => void;
  onProceed?: () => void;
}

const levelConfig = {
  excellent: {
    color: '#52c41a',
    icon: <CheckCircleOutlined />,
    label: '优秀',
    description: '模板非常详细，可以直接使用',
  },
  good: {
    color: '#52c41a',
    icon: <CheckCircleOutlined />,
    label: '良好',
    description: '模板基本完整，建议补充细节',
  },
  fair: {
    color: '#faad14',
    icon: <WarningOutlined />,
    label: '一般',
    description: '需要补充格式说明文档',
  },
  poor: {
    color: '#ff4d4f',
    icon: <ExclamationCircleOutlined />,
    label: '较差',
    description: '必须补充详细格式说明',
  },
  insufficient: {
    color: '#ff4d4f',
    icon: <CloseCircleOutlined />,
    label: '不足',
    description: '无法使用，需要完整规范文档',
  },
};

export const CompletenessCheck: React.FC<CompletenessCheckProps> = ({
  result,
  onUploadSupplement,
  onProceed,
}) => {
  const config = levelConfig[result.level];

  const getDetailIcon = (type: string) => {
    switch (type) {
      case 'missing':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'suggestion':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'required':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24, color: config.color }}>{config.icon}</span>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              模板完整性检查
            </Title>
            <Text type="secondary">{config.description}</Text>
          </div>
        </div>
      }
      style={{ marginBottom: 24 }}
    >
      {/* 评分展示 */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Progress
          type="dashboard"
          percent={result.score}
          format={(percent) => (
            <div>
              <div style={{ fontSize: 36, fontWeight: 'bold', color: config.color }}>
                {percent}分
              </div>
              <div style={{ fontSize: 14, color: '#666' }}>
                <Tag color={config.color}>{config.label}</Tag>
              </div>
            </div>
          )}
          strokeColor={config.color}
          size={160}
        />
        <Paragraph style={{ marginTop: 16, fontSize: 16 }}>{result.message}</Paragraph>
      </div>

      {/* 详细信息 */}
      {result.details.length > 0 && (
        <Collapse ghost style={{ marginBottom: 24 }}>
          {result.details.map((detail, index) => (
            <Panel
              key={index}
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {getDetailIcon(detail.type)}
                  <span>
                    {detail.title}
                    <Tag style={{ marginLeft: 8 }}>{detail.items.length}项</Tag>
                  </span>
                </div>
              }
            >
              <List
                size="small"
                dataSource={detail.items}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getDetailIcon(detail.type)}
                      <Text>{item}</Text>
                    </div>
                  </List.Item>
                )}
              />
            </Panel>
          ))}
        </Collapse>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
        {!result.can_proceed && (
          <Alert
            message="需要补充材料"
            description="您的模板信息不足，请上传补充材料后再继续。"
            type="warning"
            showIcon
            style={{ marginBottom: 16, width: '100%' }}
          />
        )}

        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={onUploadSupplement}
          size="large"
        >
          上传补充材料
        </Button>

        {result.can_proceed && (
          <Button
            type="default"
            icon={<FileTextOutlined />}
            onClick={onProceed}
            size="large"
          >
            继续使用当前规范
          </Button>
        )}
      </div>

      {/* 补充材料说明 */}
      {!result.can_proceed && (
        <Card
          type="inner"
          title="需要补充哪些材料？"
          style={{ marginTop: 16, background: '#fffbe6' }}
        >
          <List
            dataSource={result.required_supplements}
            renderItem={(item: string) => (
              <List.Item>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileTextOutlined style={{ color: '#faad14' }} />
                  <Text>{item}</Text>
                </div>
              </List.Item>
            )}
          />
          <Paragraph type="secondary" style={{ marginTop: 16 }}>
            提示：补充材料可以是 Word 文档、PDF 文件或文字说明。系统会自动提取格式信息。
          </Paragraph>
        </Card>
      )}
    </Card>
  );
};

// 示例数据
export const exampleCompletenessResult: CompletenessResult = {
  level: 'fair',
  score: 45,
  can_proceed: false,
  title: '模板需要补充',
  icon: 'warning',
  color: 'orange',
  message: '您的模板信息不够完整，建议补充格式说明文档以获得更准确的规范。',
  details: [
    {
      type: 'missing',
      title: '缺失的格式信息',
      items: [
        '正文字体 (fonts.body)',
        '一级标题字体 (fonts.heading_l1)',
        '行距 (spacing.line)',
        '引用格式类型 (citation.type)',
      ],
    },
    {
      type: 'suggestion',
      title: '补充建议',
      items: [
        '必须提供：正文使用的字体（如：宋体、仿宋）',
        '必须提供：一级标题使用的字体和字号',
        '必须提供：正文行距（如：1.5倍、1.25倍）',
        '必须提供：引用格式标准（如：GB/T 7714）',
      ],
    },
    {
      type: 'required',
      title: '必须提供的材料',
      items: [
        '毕业论文格式规范文档（必须）',
        '写作指南或排版要求（必须）',
        '参考文献格式要求（必须）',
        '字体字号要求说明（必须）',
        '段落间距要求说明（必须）',
      ],
    },
  ],
  required_supplements: [
    '毕业论文格式规范文档（必须）',
    '写作指南或排版要求（必须）',
    '参考文献格式要求（必须）',
    '字体字号要求说明（必须）',
    '段落间距要求说明（必须）',
  ],
};

export default CompletenessCheck;
