import React, { useState, useEffect, useRef } from 'react'
import CiteAutocomplete from '../media/CiteAutocomplete'
import type { Manifest, TplNode, Rule, FormatType, FormatOverride, CitationRef } from '../types/templatePreview'

const FONT_OPTIONS = ['宋体', '黑体', '楷体', '仿宋', 'Times New Roman']
const SIZE_OPTIONS = [
  { label: '五号 (10pt)', value: 10 },
  { label: '小五 (10.5pt)', value: 10.5 },
  { label: '小四 (12pt)', value: 12 },
  { label: '四号 (14pt)', value: 14 },
  { label: '小三 (15pt)', value: 15 },
  { label: '三号 (16pt)', value: 16 },
  { label: '小二 (18pt)', value: 18 },
  { label: '二号 (22pt)', value: 22 },
]
const ALIGN_OPTIONS = [
  { label: '左对齐', value: 'left' as const },
  { label: '居中', value: 'center' as const },
  { label: '右对齐', value: 'right' as const },
  { label: '两端对齐', value: 'both' as const },
]
const ROLE_OPTIONS = [
  { label: '正文段落', zone: 'body', role: 'paragraph', ruleId: 'body.paragraph' },
  { label: '一级标题', zone: 'body', role: 'heading1', ruleId: 'body.heading1' },
  { label: '二级标题', zone: 'body', role: 'heading2', ruleId: 'body.heading2' },
  { label: '三级标题', zone: 'body', role: 'heading3', ruleId: 'body.heading3' },
  { label: '独立格式', zone: 'body', role: 'custom', ruleId: '' },
]

interface InspectorPanelProps {
  node: TplNode | null
  formatTypes: FormatType[]
  selectedFormatId: string
  selectedRule: Rule | null
  manifest: Manifest | null
  onSave: (node: TplNode, text: string, formatType: FormatType) => void
  onDelete: (node: TplNode) => void
  onUpdateTable: (nodeId: string, rows: number, cols: number, cellTexts: string[]) => void
  onInsertImage: (file: File, width: number) => void
  onInsertTable: (rows: number, cols: number, cellTexts: string[]) => void
  onRoleChange: (nodeId: string, zone: string, role: string) => void
  onInsertModeChange: (mode: string | null) => void
  insertMode: string | null
  setInsertMode: (mode: string | null) => void
  loading: boolean
  citationRegistry: CitationRef[]
  onCollapse: () => void
  collapsed: boolean
}

function formatSummary(fmt: FormatOverride | undefined): string {
  if (!fmt) return '沿用模板'
  const parts: string[] = []
  if (fmt.font) parts.push(fmt.font)
  if (fmt.sizePt) {
    const sizeName = SIZE_OPTIONS.find(s => s.value === fmt.sizePt)
    parts.push(sizeName ? sizeName.label.split(' ')[0] : `${fmt.sizePt}pt`)
  }
  if (fmt.alignment) {
    const alignName = ALIGN_OPTIONS.find(a => a.value === fmt.alignment)
    parts.push(alignName?.label || fmt.alignment)
  }
  if (fmt.lineSpacing) parts.push(`${fmt.lineSpacing}倍`)
  if (fmt.firstLineIndentChars) parts.push(`首行${fmt.firstLineIndentChars}字符`)
  if (fmt.bold) parts.push('加粗')
  return parts.join(' / ') || '沿用模板'
}

export default function InspectorPanel({
  node,
  formatTypes,
  selectedFormatId,
  selectedRule,
  manifest,
  onSave,
  onDelete,
  onUpdateTable,
  onInsertImage,
  onInsertTable,
  onRoleChange,
  onInsertModeChange,
  insertMode,
  setInsertMode,
  loading,
  citationRegistry,
  onCollapse,
  collapsed,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'format' | 'actions'>('content')
  const [draft, setDraft] = useState('')
  const [formatId, setFormatId] = useState(selectedFormatId)
  const [hasChanges, setHasChanges] = useState(false)

  // Table editing state
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [tableCells, setTableCells] = useState<string[][]>([[]])

  // Image editing state
  const [imageWidth, setImageWidth] = useState(400)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Sync state when node changes
  useEffect(() => {
    setDraft(node?.displayText || node?.text || '')
    setFormatId(selectedFormatId)
    setHasChanges(false)
    setActiveTab('content')

    if (node?.role === 'table') {
      const rows = node.rows || 3
      const cols = node.cols || 3
      setTableRows(rows)
      setTableCols(cols)
      const cells: string[][] = []
      for (let i = 0; i < rows; i++) {
        const row: string[] = []
        for (let j = 0; j < cols; j++) {
          row.push(node.cellTexts?.[i * cols + j] || '')
        }
        cells.push(row)
      }
      setTableCells(cells)
    }

    if (node?.role === 'image') {
      setImageWidth(node.width || 400)
      setSelectedFile(null)
      setImagePreview(null)
    }
  }, [node?.nodeId, selectedFormatId])

  const handleDraftChange = (value: string) => {
    setDraft(value)
    setHasChanges(true)
  }

  const handleSave = () => {
    if (!node || !draft.trim()) return
    const selectedFormat = formatTypes.find(f => f.id === formatId) || formatTypes[0]
    onSave(node, draft, selectedFormat)
    setHasChanges(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleImageUpload = () => {
    if (selectedFile) {
      onInsertImage?.(selectedFile, imageWidth)
      setSelectedFile(null)
      setImagePreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleTableApply = () => {
    const cellTexts = tableCells.flat()
    onUpdateTable?.(node!.nodeId, tableRows, tableCols, cellTexts)
  }

  const isImage = node?.role === 'image' || node?.kind === 'image'
  const isTable = node?.role === 'table' || node?.kind === 'table'
  const isMedia = isImage || isTable
  const ruleFormat = node?.formatOverride || selectedRule?.format || {}

  // Insert mode panels
  if (insertMode === 'image') {
    return (
      <aside className={`inspector${collapsed ? ' collapsed' : ''}`}>
        <div className="inspector-header">
          <h3>插入图片</h3>
          <div className="inspector-header-actions">
            <button className="btn-icon" onClick={() => { setInsertMode(null); setSelectedFile(null); setImagePreview(null) }}>✕</button>
            {onCollapse && <button className="btn-icon" onClick={onCollapse} title="收起属性栏">▶</button>}
          </div>
        </div>
        <div className="inspector-body">
          <div className="inspector-field">
            <label>图片宽度 (px)</label>
            <input type="number" value={imageWidth} onChange={e => setImageWidth(Number(e.target.value))} min={100} max={1000} />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
            {selectedFile ? '重新选择' : '选择图片'}
          </button>
          {selectedFile && <div className="inspector-hint">已选择: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</div>}
          {imagePreview && <div className="image-preview-box"><img src={imagePreview} alt="预览" /></div>}
          <div className="inspector-actions">
            <button className="btn-secondary" onClick={() => { setInsertMode(null); setSelectedFile(null); setImagePreview(null) }}>取消</button>
            <button className="btn-primary" onClick={handleImageUpload} disabled={loading || !selectedFile}>
              {loading ? '上传中...' : '确认上传'}
            </button>
          </div>
        </div>
      </aside>
    )
  }

  if (insertMode === 'table') {
    return (
      <aside className={`inspector${collapsed ? ' collapsed' : ''}`}>
        <div className="inspector-header">
          <h3>插入表格</h3>
          <div className="inspector-header-actions">
            <button className="btn-icon" onClick={() => setInsertMode(null)}>✕</button>
            {onCollapse && <button className="btn-icon" onClick={onCollapse} title="收起属性栏">▶</button>}
          </div>
        </div>
        <div className="inspector-body">
          <div className="inspector-row">
            <div className="inspector-field">
              <label>行数</label>
              <input type="number" value={tableRows} onChange={e => {
                const r = Number(e.target.value); setTableRows(r)
                setTableCells(Array.from({ length: r }, (_, i) => Array.from({ length: tableCols }, (_, j) => tableCells[i]?.[j] || '')))
              }} min={1} max={20} />
            </div>
            <div className="inspector-field">
              <label>列数</label>
              <input type="number" value={tableCols} onChange={e => {
                const c = Number(e.target.value); setTableCols(c)
                setTableCells(Array.from({ length: tableRows }, (_, i) => Array.from({ length: c }, (_, j) => tableCells[i]?.[j] || '')))
              }} min={1} max={10} />
            </div>
          </div>
          <div className="table-editor-compact">
            <table>
              <tbody>
                {Array.from({ length: tableRows }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: tableCols }, (_, j) => (
                      <td key={j}>
                        <input type="text" value={tableCells[i]?.[j] || ''} onChange={e => {
                          const nc = [...tableCells]; nc[i] = [...nc[i]]; nc[i][j] = e.target.value; setTableCells(nc)
                        }} placeholder={`${i + 1},${j + 1}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inspector-actions">
            <button className="btn-secondary" onClick={() => setInsertMode(null)}>取消</button>
            <button className="btn-primary" onClick={() => {
              onInsertTable?.(tableRows, tableCols, tableCells.flat())
              setInsertMode(null)
            }} disabled={loading}>
              {loading ? '插入中...' : '插入表格'}
            </button>
          </div>
        </div>
      </aside>
    )
  }

  // No node selected
  if (!node) {
    return (
      <aside className={`inspector${collapsed ? ' collapsed' : ''}`}>
        <div className="inspector-header">
          <span className="inspector-node-role">属性检查器</span>
          {onCollapse && <button className="btn-icon" onClick={onCollapse} title="收起属性栏">▶</button>}
        </div>
        <div className="inspector-empty">
          <div className="inspector-empty-icon">📄</div>
          <p>点击文档中的段落查看属性</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className={`inspector${collapsed ? ' collapsed' : ''}`}>
      {/* Header */}
      <div className="inspector-header">
        <div className="inspector-node-info">
          <span className="inspector-node-id">{node.nodeId}</span>
          <span className="inspector-node-role">
            {selectedRule?.label || node.role}
            {node.sectionLabel ? ` · ${node.sectionLabel}` : ''}
          </span>
        </div>
        <div className="inspector-header-actions">
          {node.acceptsGenerated && <span className="badge-writable">可编辑</span>}
          {!node.acceptsGenerated && <span className="badge-locked">锁定</span>}
          {onCollapse && <button className="btn-icon" onClick={onCollapse} title="收起属性栏">▶</button>}
        </div>
      </div>

      {/* Node text preview - hidden when content tab is active to avoid duplication */}
      {activeTab !== 'content' && (
        <div className="inspector-text-preview">
          {node.displayText || node.text || '(空段落)'}
        </div>
      )}

      {/* Tabs */}
      <div className="inspector-tabs">
        <button className={activeTab === 'content' ? 'active' : ''} onClick={() => setActiveTab('content')}>内容</button>
        <button className={activeTab === 'format' ? 'active' : ''} onClick={() => setActiveTab('format')}>格式</button>
        <button className={activeTab === 'actions' ? 'active' : ''} onClick={() => setActiveTab('actions')}>操作</button>
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="inspector-tab-body">
          {isImage ? (
            <div className="inspector-image-section">
              <div className="inspector-field">
                <label>宽度 (px)</label>
                <input type="number" value={imageWidth} onChange={e => setImageWidth(Number(e.target.value))} min={100} max={1000} />
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                {selectedFile ? '重新选择' : '替换图片'}
              </button>
              {selectedFile && <div className="inspector-hint">已选择: {selectedFile.name}</div>}
              {imagePreview && <div className="image-preview-box"><img src={imagePreview} alt="预览" /></div>}
              {selectedFile && (
                <button className="btn-primary" onClick={handleImageUpload} disabled={loading}>
                  {loading ? '上传中...' : '确认替换'}
                </button>
              )}
            </div>
          ) : isTable ? (
            <div className="inspector-table-section">
              <div className="inspector-row">
                <div className="inspector-field">
                  <label>行数</label>
                  <div className="stepper">
                    <button onClick={() => {
                      const r = Math.max(1, tableRows - 1); setTableRows(r)
                      setTableCells(Array.from({ length: r }, (_, i) => Array.from({ length: tableCols }, (_, j) => tableCells[i]?.[j] || '')))
                    }}>-</button>
                    <span>{tableRows}</span>
                    <button onClick={() => {
                      const r = tableRows + 1; setTableRows(r)
                      setTableCells(Array.from({ length: r }, (_, i) => Array.from({ length: tableCols }, (_, j) => tableCells[i]?.[j] || '')))
                    }}>+</button>
                  </div>
                </div>
                <div className="inspector-field">
                  <label>列数</label>
                  <div className="stepper">
                    <button onClick={() => {
                      const c = Math.max(1, tableCols - 1); setTableCols(c)
                      setTableCells(Array.from({ length: tableRows }, (_, i) => Array.from({ length: c }, (_, j) => tableCells[i]?.[j] || '')))
                    }}>-</button>
                    <span>{tableCols}</span>
                    <button onClick={() => {
                      const c = tableCols + 1; setTableCols(c)
                      setTableCells(Array.from({ length: tableRows }, (_, i) => Array.from({ length: c }, (_, j) => tableCells[i]?.[j] || '')))
                    }}>+</button>
                  </div>
                </div>
              </div>
              {tableRows <= 4 && tableCols <= 4 ? (
                <div className="table-editor-compact">
                  <table>
                    <tbody>
                      {Array.from({ length: tableRows }, (_, i) => (
                        <tr key={i}>
                          {Array.from({ length: tableCols }, (_, j) => (
                            <td key={j}>
                              <input type="text" value={tableCells[i]?.[j] || ''} onChange={e => {
                                const nc = [...tableCells]; nc[i] = [...nc[i]]; nc[i][j] = e.target.value; setTableCells(nc)
                              }} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="inspector-hint">表格较大，点击下方按钮展开编辑</div>
              )}
              <button className="btn-primary" onClick={handleTableApply} disabled={loading}>
                {loading ? '更新中...' : '应用修改'}
              </button>
            </div>
          ) : (
            /* Text content */
            <>
              {node.acceptsGenerated ? (
                <>
                  <textarea
                    className="inspector-textarea"
                    value={draft}
                    onChange={e => handleDraftChange(e.target.value)}
                    rows={8}
                    placeholder="编辑段落内容..."
                  />
                  <CiteAutocomplete refs={citationRegistry} onSelect={(ref: CitationRef) => {
                    const token = `{{cite:${ref.id}}}`
                    setDraft(cur => {
                      const ta = document.querySelector('.inspector-textarea') as HTMLTextAreaElement | null
                      if (ta) {
                        const s = ta.selectionStart || 0
                        const e = ta.selectionEnd || 0
                        setHasChanges(true)
                        return cur.slice(0, s) + token + cur.slice(e)
                      }
                      setHasChanges(true)
                      return cur + token
                    })
                  }} />
                  <div className="inspector-actions">
                    <button className="btn-primary" onClick={handleSave} disabled={loading || !draft.trim() || !hasChanges}>
                      {loading ? '保存中...' : '保存修改'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="inspector-locked-note">
                  <strong>此区域不可编辑</strong>
                  <p>{node.lockedReason || '该区域由模板保留或专用模块处理。'}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Format Tab */}
      {activeTab === 'format' && (
        <div className="inspector-tab-body">
          {node.acceptsGenerated && (
            <div className="inspector-field">
              <label>套用规范</label>
              <select value={formatId} onChange={e => setFormatId(e.target.value)}>
                {formatTypes.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="format-detail-grid">
            <div className="format-detail-row">
              <span>区域</span>
              <strong>{node.sectionLabel || node.zone}</strong>
            </div>
            <div className="format-detail-row">
              <span>类型</span>
              <strong>{selectedRule?.label || node.role}</strong>
            </div>
            <div className="format-detail-row">
              <span>字体</span>
              <strong>{ruleFormat.font || '沿用模板'}</strong>
            </div>
            <div className="format-detail-row">
              <span>字号</span>
              <strong>{ruleFormat.sizePt ? `${ruleFormat.sizePt} pt` : '沿用模板'}</strong>
            </div>
            <div className="format-detail-row">
              <span>行距</span>
              <strong>{ruleFormat.lineSpacing || '沿用模板'}</strong>
            </div>
            <div className="format-detail-row">
              <span>对齐</span>
              <strong>{ruleFormat.alignment || '沿用模板'}</strong>
            </div>
            <div className="format-detail-row">
              <span>缩进</span>
              <strong>
                {ruleFormat.firstLineIndentChars != null
                  ? `${ruleFormat.firstLineIndentChars} 字符`
                  : ruleFormat.clearIndent ? '无' : '沿用模板'}
              </strong>
            </div>
          </div>

          {/* Technical info (collapsed) */}
          <details className="inspector-tech-info">
            <summary>技术信息</summary>
            <div className="format-detail-grid">
              {node.paraId && <div className="format-detail-row"><span>paraId</span><code>{node.paraId}</code></div>}
              {node.styleId && <div className="format-detail-row"><span>styleId</span><code>{node.styleId}</code></div>}
              {node.xpath && <div className="format-detail-row"><span>xpath</span><code className="break">{node.xpath}</code></div>}
              {node.previewAnchor && <div className="format-detail-row"><span>anchor</span><code>{node.previewAnchor}</code></div>}
            </div>
          </details>
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === 'actions' && (
        <div className="inspector-tab-body">
          {node.acceptsGenerated && (
            <div className="inspector-field">
              <label>修改节点类型</label>
              <select
                value={`${node.zone}.${node.role}`}
                disabled={loading}
                onChange={e => {
                  const [zone, role] = e.target.value.split('.')
                  onRoleChange?.(node.nodeId, zone, role)
                }}
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={`${opt.zone}.${opt.role}`} value={`${opt.zone}.${opt.role}`}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="inspector-action-list">
            <button className="btn-secondary" onClick={() => {
              onInsertModeChange?.('text')
            }}>
              在此段落后插入文本
            </button>
            <button className="btn-secondary" onClick={() => {
              setInsertMode('image')
            }}>
              插入图片
            </button>
            <button className="btn-secondary" onClick={() => {
              setInsertMode('table')
            }}>
              插入表格
            </button>
          </div>

          <div className="inspector-danger-zone">
            <button className="btn-danger" disabled={loading} onClick={() => onDelete?.(node)}>
              {loading ? '删除中...' : '删除当前节点'}
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
