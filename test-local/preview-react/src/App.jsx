import React, { useEffect, useMemo, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import './App.css'

const API = 'http://127.0.0.1:8899'

const FONT_OPTIONS = ['宋体', '黑体', '楷体', '仿宋', 'Times New Roman']
const ALIGN_OPTIONS = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
  { label: '两端对齐', value: 'both' },
]

const ROLE_OPTIONS = [
  { label: '正文段落', zone: 'body', role: 'paragraph', ruleId: 'body.paragraph' },
  { label: '一级标题', zone: 'body', role: 'heading1', ruleId: 'body.heading1' },
  { label: '二级标题', zone: 'body', role: 'heading2', ruleId: 'body.heading2' },
  { label: '三级标题', zone: 'body', role: 'heading3', ruleId: 'body.heading3' },
  { label: '独立格式', zone: 'body', role: 'custom', ruleId: '' },
]

const DEFAULT_FORMAT_TYPES = [
  { id: 'body.paragraph', label: '正文段落', zone: 'body', role: 'paragraph', ruleId: 'body.paragraph', custom: false },
  { id: 'body.heading1', label: '一级标题', zone: 'body', role: 'heading1', ruleId: 'body.heading1', custom: false },
  { id: 'body.heading2', label: '二级标题', zone: 'body', role: 'heading2', ruleId: 'body.heading2', custom: false },
  { id: 'body.heading3', label: '三级标题', zone: 'body', role: 'heading3', ruleId: 'body.heading3', custom: false },
  {
    id: 'custom.default',
    label: '独立格式',
    zone: 'body',
    role: 'custom',
    ruleId: '',
    custom: true,
    format: { font: '仿宋', sizePt: 12, bold: false, alignment: 'left', lineSpacing: 1.25 },
  },
]

function roleValue(option) {
  return `${option.zone}.${option.role}`
}

function parseRoleValue(value) {
  const [zone, role] = value.split('.')
  return { zone, role }
}

function formatTypesFromManifest(manifest, currentTypes = DEFAULT_FORMAT_TYPES) {
  const templateTypes = (manifest?.rules || [])
    .filter((rule) => rule.sectionKey === 'body' && rule.targetCount > 0 && rule.selector?.zone && rule.selector?.role)
    .map((rule) => ({
      id: rule.ruleId,
      label: rule.label,
      zone: rule.selector.zone,
      role: rule.selector.role,
      ruleId: rule.ruleId,
      custom: false,
      format: rule.format,
    }))
  const customTypes = currentTypes.filter((item) => item.custom)
  const seen = new Set()
  return [...templateTypes, ...customTypes].filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function normalizeText(text = '') {
  return text.replace(/\s+/g, '').slice(0, 80)
}

function stripNumberPrefix(text = '') {
  return normalizeText(text).replace(/^\d+(?:\.\d+)*[、.．]*/, '')
}

function blockMatchesNode(blockText, node) {
  if (!blockText || /^\d+$/.test(blockText)) return false
  const variants = [node.displayText, node.text]
    .map((value) => normalizeText(value || ''))
    .filter(Boolean)
  const expanded = [...new Set([...variants, ...variants.map(stripNumberPrefix).filter(Boolean)])]
  if (!expanded.length) return false

  if ((node.role || '').startsWith('heading')) {
    const comparableBlock = stripNumberPrefix(blockText)
    return expanded.some((text) => text === blockText || stripNumberPrefix(text) === comparableBlock)
  }

  return expanded.some((text) => {
    if (text.length <= 4 || blockText.length <= 4) return text === blockText
    return blockText.includes(text) || text.includes(blockText)
  })
}

function annotateRenderedNodes(container, manifest) {
  const nodes = manifest?.nodes || []
  container.querySelectorAll('.docx-render [data-node-id]').forEach((el) => {
    delete el.dataset.nodeId
    delete el.dataset.zone
    delete el.dataset.role
  })
  const blocks = [...container.querySelectorAll('.docx-render p, .docx-render h1, .docx-render h2, .docx-render h3')]
  let cursor = 0

  for (const block of blocks) {
    if (block.closest('table')) continue
    const text = normalizeText(block.textContent || '')
    if (!text || /^\d+$/.test(text)) continue

    let matchIndex = -1
    for (let i = cursor; i < Math.min(nodes.length, cursor + 80); i++) {
      if (blockMatchesNode(text, nodes[i])) {
        matchIndex = i
        break
      }
    }

    if (matchIndex >= 0) {
      const node = nodes[matchIndex]
      block.dataset.nodeId = node.nodeId
      block.dataset.zone = node.zone
      block.dataset.role = node.role
      cursor = matchIndex + 1
    }
  }
}

function applyPreviewMarkers(container, manifest, activeRule, selectedNodeId) {
  const targetIds = new Set(activeRule?.targetNodeIds || [])
  const nodeById = Object.fromEntries((manifest?.nodes || []).map((node) => [node.nodeId, node]))
  container.querySelectorAll('[data-node-id]').forEach((el) => {
    const node = nodeById[el.dataset.nodeId]
    el.classList.toggle('bound-hit', targetIds.has(el.dataset.nodeId))
    el.classList.toggle('bound-selected', selectedNodeId && el.dataset.nodeId === selectedNodeId)
    el.classList.toggle('bound-locked', node && !node.acceptsGenerated)
    el.classList.toggle('bound-writable', Boolean(node?.acceptsGenerated))
  })
}

function DocxPreview({ blob, version, zoom, manifest, activeRule, selectedNodeId, selectedNode, previewRef, restoreScrollTopRef, onPickNode, onQuickInsert }) {
  const localRef = useRef(null)
  const scrollTopRef = useRef(0)
  const [quickAddPos, setQuickAddPos] = useState(null)
  const setRef = (node) => {
    localRef.current = node
    if (previewRef) previewRef.current = node
  }

  const updateQuickAddPos = () => {
    const container = localRef.current
    if (!container || !selectedNodeId || !selectedNode?.acceptsGenerated) {
      setQuickAddPos(null)
      return
    }
    const selected = container.querySelector(`[data-node-id="${selectedNodeId}"]`)
    if (!selected) {
      setQuickAddPos(null)
      return
    }
    const selectedRect = selected.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setQuickAddPos({
      top: Math.max(12, selectedRect.bottom - containerRect.top + container.scrollTop + 8),
      left: Math.min(container.clientWidth - 56, selectedRect.right - containerRect.left + container.scrollLeft + 10),
    })
  }

  useEffect(() => {
    if (!blob || !localRef.current) return
    const container = localRef.current
    const previousScrollTop = restoreScrollTopRef?.current || container.scrollTop || scrollTopRef.current
    container.innerHTML = ''

    renderAsync(blob, container, null, {
      className: 'docx-render',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    }).then(() => {
      const restoreScroll = () => {
        container.scrollTop = previousScrollTop
        scrollTopRef.current = previousScrollTop
      }
      const markAndRestore = () => {
        annotateRenderedNodes(container, manifest)
        applyPreviewMarkers(container, manifest, activeRule, selectedNodeId)
        restoreScroll()
      }
      markAndRestore()
      requestAnimationFrame(markAndRestore)
      setTimeout(markAndRestore, 80)
      setTimeout(markAndRestore, 260)
      setTimeout(markAndRestore, 600)
    }).catch(console.error)
  }, [blob, version, manifest])

  useEffect(() => {
    const wrapper = localRef.current?.querySelector('.docx-render')
    if (!wrapper) return
    wrapper.style.transform = `scale(${zoom})`
    wrapper.style.transformOrigin = 'top center'
  }, [zoom, blob, version])

  useEffect(() => {
    const container = localRef.current
    if (!container) return
    applyPreviewMarkers(container, manifest, activeRule, selectedNodeId)

    if (selectedNodeId) {
      const selected = container.querySelector(`[data-node-id="${selectedNodeId}"]`)
      if (selected) {
        selected.scrollIntoView({ block: 'center', behavior: 'smooth' })
        requestAnimationFrame(updateQuickAddPos)
        setTimeout(updateQuickAddPos, 260)
      }
    } else {
      setQuickAddPos(null)
    }
  }, [activeRule, selectedNodeId, blob, version])

  const handleClick = (event) => {
    const target = event.target.closest('[data-node-id]')
    if (target?.dataset?.nodeId) {
      onPickNode?.(target.dataset.nodeId)
    }
  }

  return (
    <div className="docx-preview-frame">
      <div
        ref={setRef}
        className="docx-preview"
        onClick={handleClick}
        onScroll={(e) => {
          scrollTopRef.current = e.currentTarget.scrollTop
          updateQuickAddPos()
        }}
      />
      {quickAddPos && (
        <button
          className="preview-add-button"
          style={{ top: quickAddPos.top, left: quickAddPos.left }}
          onClick={onQuickInsert}
          title="在选中段落后插入正文"
        >
          +
        </button>
      )}
    </div>
  )
}

function RuleEditor({
  rule,
  value,
  targetNodes,
  expanded,
  active,
  onChange,
  onApply,
  onToggle,
  onActivate,
  onPickNode,
  applying,
}) {
  const fmt = value || {}
  const set = (key, nextValue) => onChange({ ...fmt, [key]: nextValue })
  const previewNodes = targetNodes.slice(0, 28)

  return (
    <section className={`rule-card ${active ? 'active' : ''}`} data-rule-id={rule.ruleId} onMouseEnter={onActivate}>
      <div className="rule-head">
        <div>
          <h3>{rule.label}</h3>
          <p>{rule.ruleId} · 命中 {rule.targetCount} 个节点</p>
        </div>
        <button className="primary" data-action="apply-rule" onClick={onApply} disabled={applying || rule.targetCount === 0}>
          {applying ? '应用中' : '应用到 DOCX'}
        </button>
      </div>

      <div className="selector-line">
        <span>selector</span>
        <code>zone={rule.selector?.zone}</code>
        <code>role={rule.selector?.role}</code>
      </div>

      <div className="field-grid">
        <label>
          字体
          <select value={fmt.font || ''} onChange={(e) => set('font', e.target.value)}>
            {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
        </label>
        <label>
          字号 pt
          <input type="number" min="6" max="42" step="0.5" value={fmt.sizePt || ''}
            onChange={(e) => set('sizePt', Number(e.target.value))} />
        </label>
        <label>
          对齐
          <select value={fmt.alignment || 'left'} onChange={(e) => set('alignment', e.target.value)}>
            {ALIGN_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
        <label>
          行距
          <input type="number" min="1" max="3" step="0.05" value={fmt.lineSpacing || ''}
            onChange={(e) => set('lineSpacing', Number(e.target.value))} />
        </label>
        <label>
          首行缩进字符
          <input type="number" min="0" max="4" step="0.5" value={fmt.firstLineIndentChars ?? ''}
            onChange={(e) => set('firstLineIndentChars', e.target.value === '' ? null : Number(e.target.value))} />
        </label>
        <label className="check-field">
          <input type="checkbox" checked={Boolean(fmt.bold)} onChange={(e) => set('bold', e.target.checked)} />
          加粗
        </label>
      </div>

      <button className="node-toggle" data-action="toggle-nodes" onClick={onToggle}>
        {expanded ? '收起命中节点' : '查看命中节点'}
      </button>

      {expanded && (
        <div className="node-list">
          {previewNodes.length === 0 && <div className="node-empty">当前规则没有命中节点，需要回到 manifest 识别逻辑修正。</div>}
          {previewNodes.map((node) => (
            <button key={node.nodeId} className="node-row" data-node-id={node.nodeId} onClick={() => onPickNode(node.nodeId)}>
              <span className="node-id">{node.nodeId}</span>
              <span className="node-text">{node.displayText || node.text || '(空段落)'}</span>
              <span className="node-path">
                {node.paraId && `paraId=${node.paraId} `}
                {node.styleId && `style=${node.styleId} `}
                {node.outlineLevel && `outline=${node.outlineLevel} `}
                {node.hasNumbering ? 'numbering=true ' : ''}
                {node.xpath}
              </span>
            </button>
          ))}
          {targetNodes.length > previewNodes.length && (
            <div className="node-more">还有 {targetNodes.length - previewNodes.length} 个节点未展开显示</div>
          )}
        </div>
      )}
    </section>
  )
}

function ManifestPanel({ manifest }) {
  const zoneStats = useMemo(() => {
    const stats = {}
    for (const node of manifest?.nodes || []) {
      const key = `${node.zone}.${node.role}`
      stats[key] = (stats[key] || 0) + 1
    }
    return Object.entries(stats)
  }, [manifest])

  return (
    <section className="manifest-card">
      <h3>结构绑定清单</h3>
      <p>这份清单来自 DOCX 的 `word/document.xml`。左侧每条规则不是说明文字，而是通过 selector 命中真实 OOXML 节点。</p>
      <p className="warning-note">当前样机还有中文边界词辅助识别；正式内核要改成样式、标题级别、书签、内容控件、w14:paraId、XPath 和分页锚点组合，不靠固定中文文案。</p>
      <div className="stat-grid">
        <span>节点总数</span><strong>{manifest?.nodeCount || 0}</strong>
        <span>规则数量</span><strong>{manifest?.rules?.length || 0}</strong>
      </div>
      <div className="zone-stats">
        {zoneStats.map(([key, count]) => (
          <span key={key}>{key}<b>{count}</b></span>
        ))}
      </div>
    </section>
  )
}

function ProductFlow({ manifest }) {
  const summary = manifest?.cleaningSummary || {}

  return (
    <section className="manifest-card">
      <h3>工作流骨架</h3>
      <div className="flow-steps">
        <span className="done">1 模板清洗</span>
        <span className="active">2 正文注册</span>
        <span>3 DOCX 导出</span>
      </div>
      <div className="stat-grid">
        <span>模板节点</span><strong>{summary.totalNodes || manifest?.nodeCount || 0}</strong>
        <span>正文可写节点</span><strong>{summary.writableNodes || 0}</strong>
        <span>锁定/待处理节点</span><strong>{summary.lockedNodes || 0}</strong>
      </div>
    </section>
  )
}

function TemplateCleaningPanel({ manifest, onPickNode }) {
  const groups = (manifest?.cleaningPlan || []).filter((group) => group.count > 0)

  return (
    <section className="manifest-card">
      <h3>模板清洗结果</h3>
      <div className="cleaning-list">
        {groups.map((group) => (
          <button
            key={group.key}
            className={`cleaning-row ${group.key === 'body_writer' ? 'primary-row' : ''}`}
            onClick={() => group.nodeIds?.[0] && onPickNode(group.nodeIds[0])}
            disabled={!group.count}
          >
            <span>
              <strong>{group.label}</strong>
            </span>
            <b>{group.count}</b>
          </button>
        ))}
      </div>
    </section>
  )
}

function GeneratedContentPanel({ selectedNode, onAdd, loading }) {
  const [text, setText] = useState('这是 AI 新生成的一段正文内容，默认进入正文段落规则。')
  const [role, setRole] = useState(roleValue(ROLE_OPTIONS[0]))
  const [mode, setMode] = useState('append')
  const [customFormat, setCustomFormat] = useState({
    font: '仿宋',
    sizePt: 12,
    bold: false,
    alignment: 'left',
    lineSpacing: 1.25,
  })
  const isCustom = role.endsWith('.custom')

  const submit = () => {
    const parsed = parseRoleValue(role)
    onAdd(text, parsed.zone, parsed.role, mode, selectedNode?.nodeId || '', isCustom ? customFormat : null)
  }

  return (
    <section className="workflow-card">
      <h3>新生成内容注册</h3>
      <p>新内容进入 DOCX 时必须先注册成节点；默认是正文段落，之后可以升级为标题。</p>
      <label>
        节点类型
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((option) => (
            <option key={roleValue(option)} value={roleValue(option)}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        放置方式
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="append">追加到正文末尾（参考文献前）</option>
          <option value="insertAfter" disabled={!selectedNode}>插入到选中段落后</option>
          <option value="replace" disabled={!selectedNode}>替换选中段落</option>
        </select>
      </label>
      <label>
        内容
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      </label>
      {isCustom && (
        <div className="custom-format-grid">
          <label>字体<input value={customFormat.font} onChange={(e) => setCustomFormat((cur) => ({ ...cur, font: e.target.value }))} /></label>
          <label>字号<input type="number" value={customFormat.sizePt} onChange={(e) => setCustomFormat((cur) => ({ ...cur, sizePt: Number(e.target.value) }))} /></label>
          <label>行距<input type="number" step="0.05" value={customFormat.lineSpacing} onChange={(e) => setCustomFormat((cur) => ({ ...cur, lineSpacing: Number(e.target.value) }))} /></label>
          <label className="check-field"><input type="checkbox" checked={customFormat.bold} onChange={(e) => setCustomFormat((cur) => ({ ...cur, bold: e.target.checked }))} />加粗</label>
        </div>
      )}
      {selectedNode && <p className="hint-text">当前选中：{selectedNode.nodeId}。可插入到它后面，或直接替换它。</p>}
      <button className="primary" onClick={submit} disabled={loading || !text.trim()}>
        {loading ? '写入中' : '写入 DOCX 并注册节点'}
      </button>
    </section>
  )
}

function BodyRegistrarPanel({ selectedNode, onAdd, loading }) {
  const [text, setText] = useState('这是 AI 新生成的一段正文内容，默认注册为正文段落。')
  const [role, setRole] = useState(roleValue(ROLE_OPTIONS[0]))
  const [mode, setMode] = useState('append')
  const [customFormat, setCustomFormat] = useState({
    font: '仿宋',
    sizePt: 12,
    bold: false,
    alignment: 'left',
    lineSpacing: 1.25,
  })
  const isCustom = role.endsWith('.custom')
  const canUseSelectedAnchor = Boolean(selectedNode?.acceptsGenerated)

  const submit = () => {
    const parsed = parseRoleValue(role)
    onAdd(text, parsed.zone, parsed.role, mode, selectedNode?.nodeId || '', isCustom ? customFormat : null)
  }

  return (
    <section className="workflow-card registrar-card">
      <h3>正文文本注册机</h3>
      <p>AI 生成文本先注册成正文节点，再决定继承正文规则、标题规则，或使用独立格式。封面、目录、参考文献不会从这里写入。</p>
      <label>
        注册类型
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          {ROLE_OPTIONS.map((option) => (
            <option key={roleValue(option)} value={roleValue(option)}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        放置方式
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="append">追加到正文末尾（参考文献前）</option>
          <option value="insertAfter" disabled={!canUseSelectedAnchor}>插入到选中正文节点后</option>
          <option value="replace" disabled={!canUseSelectedAnchor}>替换选中正文节点</option>
        </select>
      </label>
      <label>
        待注册文本
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} />
      </label>
      {isCustom && (
        <div className="custom-format-grid">
          <label>字体<input value={customFormat.font} onChange={(event) => setCustomFormat((cur) => ({ ...cur, font: event.target.value }))} /></label>
          <label>字号<input type="number" value={customFormat.sizePt} onChange={(event) => setCustomFormat((cur) => ({ ...cur, sizePt: Number(event.target.value) }))} /></label>
          <label>行距<input type="number" step="0.05" value={customFormat.lineSpacing} onChange={(event) => setCustomFormat((cur) => ({ ...cur, lineSpacing: Number(event.target.value) }))} /></label>
          <label className="check-field"><input type="checkbox" checked={customFormat.bold} onChange={(event) => setCustomFormat((cur) => ({ ...cur, bold: event.target.checked }))} />加粗</label>
        </div>
      )}
      {selectedNode && (
        <p className="hint-text">
          当前选中：{selectedNode.nodeId}。{canUseSelectedAnchor ? '可作为插入/替换锚点。' : `锁定区：${selectedNode.lockedReason || '不能写入正文。'}`}
        </p>
      )}
      <button className="primary" onClick={submit} disabled={loading || !text.trim()}>
        {loading ? '注册中' : '写入 DOCX 并注册正文节点'}
      </button>
    </section>
  )
}

function SelectedNodePanel({ node, onChangeRole, loading }) {
  if (!node) {
    return (
      <section className="workflow-card">
        <h3>选中节点角色</h3>
        <p>点击命中节点后，可以把新内容或误判内容切换到标题/正文规则。</p>
        <div className="empty-selection">尚未选中节点</div>
      </section>
    )
  }

  const current = `${node.zone}.${node.role}`
  const normalizedValue = ROLE_OPTIONS.some((option) => roleValue(option) === current)
    ? current
    : roleValue(ROLE_OPTIONS[0])

  return (
    <section className="workflow-card selected-node-card">
      <h3>选中节点角色</h3>
      <div className="selected-node-meta">
        <strong>{node.nodeId}</strong>
        <span>{node.generated ? '新生成节点' : '模板提取节点'}</span>
      </div>
      <p className="selected-node-text">{node.text || '(空段落)'}</p>
      <label>
        套用规则
        <select
          value={normalizedValue}
          disabled={loading}
          onChange={(e) => {
            const parsed = parseRoleValue(e.target.value)
            onChangeRole(node.nodeId, parsed.zone, parsed.role)
          }}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={roleValue(option)} value={roleValue(option)}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="hint-text">切换后会更新 manifest 的 zone/role，重新计算命中节点，并把对应规则格式写回 DOCX。</p>
    </section>
  )
}

function NodeStatusPanel({ node, onChangeRole, loading }) {
  if (!node) {
    return (
      <section className="workflow-card">
        <h3>节点状态</h3>
        <p>点击右侧文档中的段落，系统会判断它是正文可写节点，还是模板锁定节点。</p>
        <div className="empty-selection">尚未选中节点</div>
      </section>
    )
  }

  const current = `${node.zone}.${node.role}`
  const normalizedValue = ROLE_OPTIONS.some((option) => roleValue(option) === current)
    ? current
    : roleValue(ROLE_OPTIONS[0])

  return (
    <section className={`workflow-card selected-node-card ${node.acceptsGenerated ? '' : 'locked-node-card'}`}>
      <h3>节点状态</h3>
      <div className="selected-node-meta">
        <strong>{node.nodeId}</strong>
        <span>{node.acceptsGenerated ? '正文可写节点' : node.sectionLabel || '模板锁定节点'}</span>
      </div>
      <p className="selected-node-text">{node.text || '(空段落)'}</p>
      {!node.acceptsGenerated ? (
        <div className="lock-note">
          <strong>当前节点不参与正文注册</strong>
          <p>{node.lockedReason || '这个区域由模板保留或后续专用模块处理。'}</p>
        </div>
      ) : (
        <>
          <label>
            正文角色
            <select
              value={normalizedValue}
              disabled={loading}
              onChange={(event) => {
                const parsed = parseRoleValue(event.target.value)
                onChangeRole(node.nodeId, parsed.zone, parsed.role)
              }}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={roleValue(option)} value={roleValue(option)}>{option.label}</option>
              ))}
            </select>
          </label>
          <p className="hint-text">切换后会更新 manifest 的正文角色，并把对应格式规则写回同一份工作 DOCX。</p>
        </>
      )}
    </section>
  )
}

function WritingPanel({
  selectedNode,
  formatTypes,
  selectedFormatId,
  onSelectFormat,
  onOpenLibrary,
  citationRegistry,
  modeHint,
  onAdd,
  loading,
}) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('append')
  const textareaRef = useRef(null)
  const selectedFormat = formatTypes.find((item) => item.id === selectedFormatId) || formatTypes[0]
  const canUseSelectedAnchor = Boolean(selectedNode?.acceptsGenerated)

  useEffect(() => {
    if (modeHint) setMode(modeHint)
  }, [modeHint, selectedNode?.nodeId])

  const insertCitation = (ref) => {
    const token = `{{cite:${ref.id}}}`
    const textarea = textareaRef.current
    if (!textarea) {
      setText((current) => `${current}${token}`)
      return
    }
    const start = textarea.selectionStart || 0
    const end = textarea.selectionEnd || 0
    setText((current) => `${current.slice(0, start)}${token}${current.slice(end)}`)
    requestAnimationFrame(() => {
      textarea.focus()
      const nextPos = start + token.length
      textarea.setSelectionRange(nextPos, nextPos)
    })
  }

  const submit = () => {
    if (!selectedFormat || !text.trim()) return
    onAdd(
      text,
      selectedFormat.zone,
      selectedFormat.role,
      mode,
      selectedNode?.nodeId || '',
      selectedFormat.custom ? selectedFormat.format : null,
    )
    setText('')
  }

  return (
    <section className="workflow-card writing-card">
      <div className="card-title-row">
        <h3>写入正文</h3>
        <button onClick={onOpenLibrary}>格式规范</button>
      </div>
      <label>
        选择规范
        <select value={selectedFormatId} onChange={(event) => onSelectFormat(event.target.value)}>
          {formatTypes.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label>
        放置位置
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="append">追加到正文末尾</option>
          <option value="insertAfter" disabled={!canUseSelectedAnchor}>插入到选中段落后</option>
          <option value="replace" disabled={!canUseSelectedAnchor}>替换选中段落</option>
        </select>
      </label>
      <label>
        文本
        <textarea
          ref={textareaRef}
          value={text}
          placeholder="在这里输入正文，或让 AI 把生成结果放到这里"
          onChange={(event) => setText(event.target.value)}
          rows={5}
        />
      </label>
      {selectedNode && (
        <p className="hint-text">
          {selectedNode.acceptsGenerated
            ? `当前段落 ${selectedNode.nodeId} 可作为位置锚点`
            : `当前选中区域已锁定：${selectedNode.lockedReason || '不能写入正文'}`}
        </p>
      )}
      <button className="primary" onClick={submit} disabled={loading || !text.trim()}>
        {loading ? '写入中' : '写入正文'}
      </button>
    </section>
  )
}

function ParagraphFormatPanel({ node, formatTypes, selectedFormatId, selectedRule, onSave, loading }) {
  const [draft, setDraft] = useState('')
  const [formatId, setFormatId] = useState(selectedFormatId)

  useEffect(() => {
    setDraft(node?.displayText || node?.text || '')
    setFormatId(selectedFormatId)
  }, [node?.nodeId, selectedFormatId])

  if (!node) {
    return (
      <section className="workflow-card selected-node-card">
        <h3>段落格式</h3>
        <div className="empty-selection">点击右侧段落查看格式</div>
      </section>
    )
  }

  const selectedFormat = formatTypes.find((item) => item.id === formatId) || formatTypes[0]
  const ruleFormat = node.formatOverride || selectedRule?.format || selectedFormat?.format || {}
  const rows = [
    ['区域', node.sectionLabel || node.zone],
    ['类型', selectedRule?.label || node.role],
    ['字体', ruleFormat.font || '沿用模板'],
    ['字号', ruleFormat.sizePt ? `${ruleFormat.sizePt} pt` : '沿用模板'],
    ['行距', ruleFormat.lineSpacing || '沿用模板'],
    ['对齐', ruleFormat.alignment || '沿用模板'],
    ['缩进', ruleFormat.firstLineIndentChars != null ? `${ruleFormat.firstLineIndentChars} 字符` : (ruleFormat.clearIndent ? '无' : '沿用模板')],
  ]

  return (
    <section className={`workflow-card selected-node-card ${node.acceptsGenerated ? '' : 'locked-node-card'}`}>
      <h3>段落格式</h3>
      <p className="selected-node-text">{node.displayText || node.text || '(空段落)'}</p>
      <div className="format-details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {node.acceptsGenerated && (
        <>
          <label>
            段落内容
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
          </label>
          <label>
            套用规范
            <select value={formatId} onChange={(event) => setFormatId(event.target.value)}>
              {formatTypes.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={loading || !draft.trim()}
            onClick={() => onSave(node, draft, selectedFormat)}
          >
            {loading ? '保存中' : '替换当前段落'}
          </button>
        </>
      )}
    </section>
  )
}

function EditableNodePanel({ node, formatTypes, selectedFormatId, onSave, loading }) {
  const [draft, setDraft] = useState('')
  const [formatId, setFormatId] = useState(selectedFormatId)

  useEffect(() => {
    setDraft(node?.displayText || node?.text || '')
    setFormatId(selectedFormatId)
  }, [node?.nodeId, selectedFormatId])

  if (!node) {
    return (
      <section className="workflow-card">
        <h3>当前段落</h3>
        <p>点击右侧正文段落后，可以在这里直接修改内容和格式规范。</p>
        <div className="empty-selection">尚未选择正文段落</div>
      </section>
    )
  }

  if (!node.acceptsGenerated) {
    return (
      <section className="workflow-card selected-node-card locked-node-card">
        <h3>当前段落</h3>
        <div className="selected-node-meta">
          <strong>{node.nodeId}</strong>
          <span>{node.sectionLabel || '锁定区域'}</span>
        </div>
        <p className="selected-node-text">{node.displayText || node.text || '(空段落)'}</p>
        <div className="lock-note">
          <strong>这里不能作为正文编辑区</strong>
          <p>{node.lockedReason || '该区域由模板保留或专用模块处理。'}</p>
        </div>
      </section>
    )
  }

  const selectedFormat = formatTypes.find((item) => item.id === formatId) || formatTypes[0]

  return (
    <section className="workflow-card selected-node-card">
      <h3>当前段落</h3>
      <div className="selected-node-meta">
        <strong>{node.nodeId}</strong>
        <span>{node.numberLabel ? `编号 ${node.numberLabel}` : '正文可编辑'}</span>
      </div>
      <label>
        段落内容
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} />
      </label>
      <label>
        套用规范
        <select value={formatId} onChange={(event) => setFormatId(event.target.value)}>
          {formatTypes.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <button
        className="primary"
        disabled={loading || !draft.trim()}
        onClick={() => onSave(node, draft, selectedFormat)}
      >
        {loading ? '保存中' : '保存当前段落'}
      </button>
    </section>
  )
}

function FormatLibraryModal({ open, formatTypes, onClose, onAddFormat }) {
  const [label, setLabel] = useState('')
  const [format, setFormat] = useState({
    font: '仿宋',
    sizePt: 12,
    bold: false,
    alignment: 'left',
    lineSpacing: 1.25,
  })

  if (!open) return null

  const add = () => {
    if (!label.trim()) return
    onAddFormat({
      id: `custom.${Date.now()}`,
      label: label.trim(),
      zone: 'body',
      role: 'custom',
      ruleId: '',
      custom: true,
      format,
    })
    setLabel('')
  }

  return (
    <div className="modal-backdrop">
      <section className="format-modal">
        <div className="modal-head">
          <h3>格式规范库</h3>
          <button onClick={onClose}>关闭</button>
        </div>
        <div className="format-list">
          {formatTypes.map((item) => (
            <div key={item.id} className="format-item">
              <strong>{item.label}</strong>
              <span>{item.custom ? '用户自定义' : '模板识别'}</span>
            </div>
          ))}
        </div>
        <div className="format-form">
          <h4>新增自定义规范</h4>
          <label>名称<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：图表说明、算法伪代码、重点段落" /></label>
          <div className="custom-format-grid">
            <label>字体<input value={format.font} onChange={(event) => setFormat((cur) => ({ ...cur, font: event.target.value }))} /></label>
            <label>字号<input type="number" value={format.sizePt} onChange={(event) => setFormat((cur) => ({ ...cur, sizePt: Number(event.target.value) }))} /></label>
            <label>行距<input type="number" step="0.05" value={format.lineSpacing} onChange={(event) => setFormat((cur) => ({ ...cur, lineSpacing: Number(event.target.value) }))} /></label>
            <label className="check-field"><input type="checkbox" checked={format.bold} onChange={(event) => setFormat((cur) => ({ ...cur, bold: event.target.checked }))} />加粗</label>
          </div>
          <button className="primary" onClick={add} disabled={!label.trim()}>加入规范库</button>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [manifest, setManifest] = useState(null)
  const [ruleFormats, setRuleFormats] = useState({})
  const [docxBlob, setDocxBlob] = useState(null)
  const [status, setStatus] = useState('等待加载测试模板')
  const [applyingRule, setApplyingRule] = useState('')
  const [nodeBusy, setNodeBusy] = useState(false)
  const [zoom, setZoom] = useState(0.9)
  const [expandedRuleId, setExpandedRuleId] = useState('')
  const [activeRuleId, setActiveRuleId] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [formatTypes, setFormatTypes] = useState(DEFAULT_FORMAT_TYPES)
  const [selectedFormatId, setSelectedFormatId] = useState(DEFAULT_FORMAT_TYPES[0].id)
  const [formatModalOpen, setFormatModalOpen] = useState(false)
  const [writeModeHint, setWriteModeHint] = useState('append')
  const previewRef = useRef(null)
  const restoreScrollTopRef = useRef(0)

  const nodeById = useMemo(() => {
    return Object.fromEntries((manifest?.nodes || []).map((node) => [node.nodeId, node]))
  }, [manifest])

  const activeRule = useMemo(() => {
    return manifest?.rules?.find((rule) => rule.ruleId === activeRuleId) || null
  }, [manifest, activeRuleId])

  const selectedNode = useMemo(() => {
    return selectedNodeId ? nodeById[selectedNodeId] : null
  }, [nodeById, selectedNodeId])

  const selectedRule = useMemo(() => {
    if (!selectedNode) return null
    return manifest?.rules?.find((rule) => rule.selector?.zone === selectedNode.zone && rule.selector?.role === selectedNode.role) || null
  }, [manifest, selectedNode])

  const groupedRules = useMemo(() => {
    const groups = []
    const byKey = new Map()
    for (const rule of manifest?.rules || []) {
      if (rule.sectionKey !== 'body') continue
      const key = rule.sectionKey || 'other'
      if (!byKey.has(key)) {
        const group = {
          key,
          label: rule.sectionLabel || key,
          rules: [],
        }
        byKey.set(key, group)
        groups.push(group)
      }
      byKey.get(key).rules.push(rule)
    }
    return groups
  }, [manifest])

  const pickNode = (nodeId) => {
    const node = nodeById[nodeId]
    const rule = manifest?.rules?.find((item) => item.selector?.zone === node?.zone && item.selector?.role === node?.role)
    setSelectedNodeId(nodeId)
    setActiveRuleId(node?.acceptsGenerated ? (rule?.ruleId || '') : '')
    if (node?.acceptsGenerated) {
      const formatMatch = formatTypes.find((item) => item.zone === node.zone && item.role === node.role && (!item.custom || node.role === 'custom'))
      setSelectedFormatId(formatMatch?.id || DEFAULT_FORMAT_TYPES[0].id)
    }
    if (node?.acceptsGenerated && rule?.ruleId) {
      setExpandedRuleId(rule.ruleId)
    }
  }

  const quickInsertAfterSelected = () => {
    if (!selectedNode?.acceptsGenerated) return
    setWriteModeHint('insertAfter')
    setStatus('已选择在当前段落后插入正文')
  }

  const loadDocx = async (caseId, version) => {
    const response = await fetch(`${API}/case/${caseId}/file?v=${version || Date.now()}`)
    if (!response.ok) throw new Error('无法读取工作 DOCX')
    setDocxBlob(await response.blob())
  }

  const loadCase = async () => {
    setStatus('正在读取测试模板并生成节点绑定 manifest...')
    setSelectedNodeId('')
    const response = await fetch(`${API}/case/load`, { method: 'POST' })
    if (!response.ok) throw new Error('样机后端没有启动或模板读取失败')
    const nextManifest = await response.json()
    setManifest(nextManifest)
    setRuleFormats(Object.fromEntries(nextManifest.rules.map((rule) => [rule.ruleId, rule.format])))
    setFormatTypes((current) => formatTypesFromManifest(nextManifest, current))
    const firstBodyRule = nextManifest.rules.find((rule) => rule.sectionKey === 'body')
    setActiveRuleId(firstBodyRule?.ruleId || '')
    setExpandedRuleId(firstBodyRule?.ruleId || '')
    await loadDocx(nextManifest.caseId, nextManifest.version)
    setStatus(`已加载 ${nextManifest.source}，生成 ${nextManifest.nodeCount} 个节点绑定`)
  }

  const applyRule = async (rule) => {
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setApplyingRule(rule.ruleId)
    setActiveRuleId(rule.ruleId)
    setSelectedNodeId('')
    setStatus(`正在把「${rule.label}」写回 DOCX 节点...`)
    try {
      const response = await fetch(`${API}/case/${manifest.caseId}/rule/${rule.ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: ruleFormats[rule.ruleId] }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || '规则应用失败')
      }
      const nextManifest = await response.json()
      setManifest(nextManifest)
      await loadDocx(nextManifest.caseId, nextManifest.version)
      setStatus(`已应用「${rule.label}」，预览保留当前位置并重新渲染工作 DOCX`)
    } catch (error) {
      setStatus(`失败：${error.message}`)
    } finally {
      setApplyingRule('')
    }
  }

  const addGeneratedNode = async (text, zone, role, mode = 'append', anchorNodeId = '', customFormat = null) => {
    if (!manifest?.caseId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus('正在把新生成内容写入 DOCX 并注册 manifest 节点...')
    try {
      const response = await fetch(`${API}/case/${manifest.caseId}/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, zone, role, mode, anchorNodeId, customFormat }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || '新增节点失败')
      }
      const nextManifest = await response.json()
      setManifest(nextManifest)
      setRuleFormats(Object.fromEntries(nextManifest.rules.map((rule) => [rule.ruleId, rule.format])))
      setFormatTypes((current) => formatTypesFromManifest(nextManifest, current))
      const latestGeneratedNode = nextManifest.nodes
        .filter((node) => node.generated)
        .sort((a, b) => Number((b.nodeId || '').replace('p', '')) - Number((a.nodeId || '').replace('p', '')))[0]
      const selectedAfterWrite = mode === 'replace' && anchorNodeId
        ? nextManifest.nodes.find((node) => node.nodeId === anchorNodeId)
        : latestGeneratedNode
      const newRule = nextManifest.rules.find((rule) => rule.selector?.zone === zone && rule.selector?.role === role)
      setSelectedNodeId(selectedAfterWrite?.nodeId || '')
      setActiveRuleId(newRule?.ruleId || '')
      setExpandedRuleId(newRule?.ruleId || expandedRuleId)
      await loadDocx(nextManifest.caseId, nextManifest.version)
      setStatus(`已写入 ${selectedAfterWrite?.nodeId || '节点'}，放置模式 ${mode}，格式 ${newRule?.label || '独立格式'}`)
    } catch (error) {
      setStatus(`新增失败：${error.message}`)
    } finally {
      setNodeBusy(false)
    }
  }

  const addFormatType = (formatType) => {
    setFormatTypes((current) => [...current, formatType])
    setSelectedFormatId(formatType.id)
  }

  const saveCurrentNode = async (node, text, formatType) => {
    if (!node?.nodeId || !formatType) return
    await addGeneratedNode(
      text,
      formatType.zone,
      formatType.role,
      'replace',
      node.nodeId,
      formatType.custom ? formatType.format : null,
    )
  }

  const changeNodeRole = async (nodeId, zone, role) => {
    if (!manifest?.caseId || !nodeId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus(`正在把 ${nodeId} 切换为 ${zone}.${role}...`)
    try {
      const response = await fetch(`${API}/case/${manifest.caseId}/node/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, role }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || '节点角色更新失败')
      }
      const nextManifest = await response.json()
      setManifest(nextManifest)
      setRuleFormats(Object.fromEntries(nextManifest.rules.map((rule) => [rule.ruleId, rule.format])))
      setFormatTypes((current) => formatTypesFromManifest(nextManifest, current))
      const nextRule = nextManifest.rules.find((rule) => rule.selector?.zone === zone && rule.selector?.role === role)
      setSelectedNodeId(nodeId)
      setActiveRuleId(nextRule?.ruleId || '')
      setExpandedRuleId(nextRule?.ruleId || expandedRuleId)
      await loadDocx(nextManifest.caseId, nextManifest.version)
      setStatus(`已把 ${nodeId} 切换到「${nextRule?.sectionLabel || zone} / ${nextRule?.label || role}」并重算命中`)
    } catch (error) {
      setStatus(`角色更新失败：${error.message}`)
    } finally {
      setNodeBusy(false)
    }
  }

  useEffect(() => {
    loadCase().catch((error) => setStatus(`加载失败：${error.message}`))
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="side-header">
          <div className="product-header-copy">
            <h1>论文模板清洗与正文注册</h1>
          </div>
          <button onClick={() => loadCase().catch((error) => setStatus(`加载失败：${error.message}`))}>
            重新加载测试模板
          </button>
        </header>

        <WritingPanel
          selectedNode={selectedNode}
          formatTypes={formatTypes}
          selectedFormatId={selectedFormatId}
          onSelectFormat={setSelectedFormatId}
          onOpenLibrary={() => setFormatModalOpen(true)}
          citationRegistry={manifest?.citationRegistry || []}
          modeHint={writeModeHint}
          onAdd={addGeneratedNode}
          loading={nodeBusy}
        />
        <ParagraphFormatPanel
          node={selectedNode}
          formatTypes={formatTypes}
          selectedFormatId={selectedFormatId}
          selectedRule={selectedRule}
          onSave={saveCurrentNode}
          loading={nodeBusy}
        />

        <details className="rules rules-shell">
          <summary>正文格式批量调整</summary>
          {groupedRules.map((group) => (
            <section key={group.key} className="rule-group">
              <div className="rule-group-head">
                <h2>{group.label}</h2>
                <span>{group.rules.length} 条规则</span>
              </div>
              {group.rules.map((rule) => {
                const targetNodes = rule.targetNodeIds.map((id) => nodeById[id]).filter(Boolean)
                return (
                  <RuleEditor
                    key={rule.ruleId}
                    rule={rule}
                    value={ruleFormats[rule.ruleId]}
                    targetNodes={targetNodes}
                    expanded={expandedRuleId === rule.ruleId}
                    active={activeRuleId === rule.ruleId}
                    onChange={(nextFormat) => setRuleFormats((cur) => ({ ...cur, [rule.ruleId]: nextFormat }))}
                    onApply={() => applyRule(rule)}
                    onToggle={() => setExpandedRuleId((cur) => cur === rule.ruleId ? '' : rule.ruleId)}
                    onActivate={() => setActiveRuleId(rule.ruleId)}
                    onPickNode={pickNode}
                    applying={applyingRule === rule.ruleId}
                  />
                )
              })}
            </section>
          ))}
        </details>
      </aside>

      <main className="preview-pane">
        <div className="topbar">
          <div>
            <strong>{manifest?.source || '测试模板'}</strong>
            <span>{status}</span>
          </div>
          <div className="zoom-tools">
            <button onClick={() => setZoom((z) => Math.max(0.55, z - 0.1))}>-</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}>+</button>
          </div>
        </div>
        <DocxPreview
          blob={docxBlob}
          version={manifest?.version}
          zoom={zoom}
          manifest={manifest}
          activeRule={activeRule}
          selectedNodeId={selectedNodeId}
          selectedNode={selectedNode}
          previewRef={previewRef}
          restoreScrollTopRef={restoreScrollTopRef}
          onPickNode={pickNode}
          onQuickInsert={quickInsertAfterSelected}
        />
      </main>
      <FormatLibraryModal
        open={formatModalOpen}
        formatTypes={formatTypes}
        onClose={() => setFormatModalOpen(false)}
        onAddFormat={addFormatType}
      />
    </div>
  )
}

export default App
