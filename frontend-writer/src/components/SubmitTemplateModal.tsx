import { useState } from 'react';
import { Modal, Form, Input, Select, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

interface SubmitTemplateModalProps {
  open: boolean;
  onClose: () => void;
  schoolName?: string;
}

const DEGREE_LEVELS = [
  { value: 'bachelor', label: '学士' },
  { value: 'master', label: '硕士' },
  { value: 'doctor', label: '博士' },
];

const CITATION_STYLES = [
  { value: 'GB/T 7714', label: 'GB/T 7714' },
  { value: 'APA', label: 'APA' },
  { value: 'Harvard', label: 'Harvard' },
  { value: 'MLA', label: 'MLA' },
  { value: 'Chicago', label: 'Chicago' },
  { value: 'other', label: '其他' },
];

export function SubmitTemplateModal({ open, onClose, schoolName }: SubmitTemplateModalProps) {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const qc = useQueryClient();

  const submitMut = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      if (!fileList.length) {
        throw new Error('请上传模板文件');
      }

      const fd = new FormData();
      fd.append('school_name', values.school_name);
      fd.append('degree_level', values.degree_level);
      if (values.discipline) fd.append('discipline', values.discipline);
      if (values.citation_style) fd.append('citation_style', values.citation_style);
      if (values.notes) fd.append('notes', values.notes);
      fd.append('file', fileList[0].originFileObj);

      return apiFetch('/api/template-submissions', {
        method: 'POST',
        body: fd,
      });
    },
    onSuccess: () => {
      message.success('模板提交成功，等待管理员审核');
      qc.invalidateQueries({ queryKey: ['writer', 'template-submissions'] });
      form.resetFields();
      setFileList([]);
      onClose();
    },
    onError: (err: Error) => {
      message.error(err.message || '提交失败');
    },
  });

  const handleCancel = () => {
    form.resetFields();
    setFileList([]);
    onClose();
  };

  return (
    <Modal
      title="上传学校论文模板"
      open={open}
      onCancel={handleCancel}
      onOk={() => submitMut.mutate()}
      confirmLoading={submitMut.isPending}
      okText="提交"
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          school_name: schoolName || '',
          degree_level: undefined,
          citation_style: undefined,
        }}
      >
        <Form.Item
          name="school_name"
          label="学校名称"
          rules={[{ required: true, message: '请输入学校名称' }]}
        >
          <Input placeholder="例如：中央美术学院" />
        </Form.Item>

        <Form.Item
          name="degree_level"
          label="学位层次"
          rules={[{ required: true, message: '请选择学位层次' }]}
        >
          <Select placeholder="选择学位层次" options={DEGREE_LEVELS} />
        </Form.Item>

        <Form.Item name="discipline" label="学科（可选）">
          <Input placeholder="例如：美术学、设计学" />
        </Form.Item>

        <Form.Item name="citation_style" label="引用格式">
          <Select placeholder="选择引用格式" options={CITATION_STYLES} allowClear />
        </Form.Item>

        <Form.Item
          label="模板文件"
          required
          extra="支持 PDF、Word (.docx/.doc)、TXT、Markdown 格式"
        >
          <Upload
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: newList }) => setFileList(newList.slice(-1))}
            accept=".pdf,.docx,.doc,.txt,.md"
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
        </Form.Item>

        <Form.Item name="notes" label="备注（可选）">
          <Input.TextArea rows={3} placeholder="补充说明，如模板来源、特殊要求等" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
