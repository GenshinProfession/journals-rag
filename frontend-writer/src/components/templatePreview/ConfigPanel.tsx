import React, { useState, useEffect } from 'react'
import { loadConfig, saveConfig, generateConfig } from '../../api/templatePreview'
import type { Manifest, FormatOverride } from '../../types/templatePreview'

const SIZE_LABELS: Record<number, string> = { 10: '五号', 10.5: '小五', 12: '小四', 14: '四号', 15: '小三', 16: '三号', 18: '小二', 22: '二号' }
const ALIGN_LABELS: Record<string, string> = { left: '左对齐', center: '居中', right: '右对齐', both: '两端对齐' }

interface ConfigPanelProps {
  manifest: Manifest | null
  setManifest: (manifest: Manifest) => void
  loadDocx: (caseId: string, version: number) => Promise<void>
  setStatus: (status: string) => void
}

interface SemanticLabelInfo {
  type: string
}

interface ConfigData {
  formatRules?: Record<string, FormatOverride>
  semanticLabels?: Record<string, SemanticLabelInfo>
}

function ruleSummary(rule: FormatOverride | undefined): string {
  if (!rule) return '未配置'
  const parts: string[] = []
  if (rule.font) parts.push(rule.font)
  if (rule.sizePt) parts.push(SIZE_LABELS[rule.sizePt] || `${rule.sizePt}pt`)
  if (rule.alignment) parts.push(ALIGN_LABELS[rule.alignment] || rule.alignment)
  if (rule.lineSpacing) parts.push(`${rule.lineSpacing}倍`)
  if (rule.firstLineIndentChars) parts.push(`首行${rule.firstLineIndentChars}字符`)
  return parts.join(' / ') || '未配置'
}

export default function ConfigPanel({ manifest, setManifest, loadDocx, setStatus }: ConfigPanelProps) {
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  useEffect(() => {
    loadConfig().then(setConfig).catch(console.error)
  }, [])

  const handleGenerate = async () => {
    if (!manifest?.caseId) return
    setLoading(true)
    setStatus('正在用 AI 分析论文结构...')
    try {
      const data = await generateConfig(manifest.caseId)
      setConfig(data)
      setStatus('配置生成成功')
    } catch (err: any) {
      setStatus(`配置生成失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config || !manifest?.caseId) return
    setLoading(true)
    setStatus('正在保存配置并更新文档...')
    try {
      const nextManifest = await saveConfig(manifest.caseId, config)
      setManifest(nextManifest)
      await loadDocx(nextManifest.caseId, nextManifest.version)
      setStatus('配置保存成功')
    } catch (err: any) {
      setStatus(`配置保存失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!config) return <div className="config-loading">加载中...</div>

  const formatRules = config.formatRules || {}
  const semanticLabels = config.semanticLabels || {}

  const sections = Object.entries(semanticLabels)
    .filter(([key, info]) => info.type === 'section' && key !== '封面' && key !== '目录')
    .map(([key, _info]) => {
      let items: string[] = []
      if (key === '中文摘要') items = ['摘要标题', '摘要正文', '关键词']
      else if (key === '英文摘要') items = ['英文标题', '英文正文', '英文关键词']
      else if (key === '正文') items = ['一级标题', '二级标题', '三级标题', '正文段落', '图片标注', '表格标注', '表格文本']
      else if (key === '致谢') items = ['致谢标题', '致谢正文']
      else if (key === '参考文献') items = ['参考文献标题', '参考文献条目']
      else if (key === '附录') items = ['附录标题', '附录正文']
      return { key, items }
    })
    .filter(s => s.items.length > 0)

  return (
    <div className="config-panel">
      <div className="config-actions">
        <button className="btn-primary btn-sm" onClick={handleGenerate} disabled={loading}>
          {loading ? '分析中...' : 'AI 识别规范'}
        </button>
        <button className="btn-secondary btn-sm" onClick={handleSave} disabled={loading}>
          保存全部更改
        </button>
      </div>

      <div className="config-list">
        {sections.map(section => (
          <div key={section.key} className="config-section">
            <div className="config-section-header" onClick={() => setExpandedSection(expandedSection === section.key ? null : section.key)}>
              <span className="nav-chevron">{expandedSection === section.key ? '▾' : '▸'}</span>
              <span>{section.key}</span>
            </div>
            {expandedSection === section.key && (
              <div className="config-items">
                {section.items.map(itemKey => {
                  const rule = formatRules[itemKey] || {}
                  return (
                    <div key={itemKey} className="config-item-row">
                      <span className="config-item-label">{itemKey}</span>
                      <span className="config-item-summary">{ruleSummary(rule)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
