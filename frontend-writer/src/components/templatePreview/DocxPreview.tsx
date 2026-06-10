import React, { useEffect, useRef, useState, useCallback } from 'react'
import { renderAsync } from 'docx-preview'
import JSZip from 'jszip'
import CiteAutocomplete from './CiteAutocomplete'
import { bindPreviewNodes, applyPreviewMarkers, applyLockedPageMasks, checkBindingHealth } from '../../lib/templatePreview/previewBinding'
import type { Manifest, TplNode, Rule, FormatType, CitationRef } from '../../types/templatePreview'

interface MenuPos {
  top: number
  height: number
  paperLeft: number
}

interface DocxPreviewProps {
  blob: Blob | null
  version: number
  zoom: number
  manifest: Manifest | null
  activeRule: Rule | null
  selectedNodeId: string | null
  selectedNode: TplNode | null
  previewRef: React.RefObject<HTMLDivElement | null>
  restoreScrollTopRef: React.RefObject<number | null>
  formatTypes: FormatType[]
  selectedFormatId: string
  onPickNode: (nodeId: string) => void
  onInlineInsert: (text: string, formatType: FormatType, mode: string) => Promise<void>
  inserting: boolean
  citationRegistry: CitationRef[]
  setSelectedNodeId: (nodeId: string | null) => void
  onStartImageInsert: (mode: string) => void
  onStartTableInsert: (mode: string) => void
  onFitWidth: () => void
}

/** Apply zoom to the docx wrapper */
function applyZoom(container: HTMLElement | null, zoom: number): void {
  if (!container) return
  const wrapper = container.querySelector('.docx-render') as HTMLElement | null
  if (!wrapper) return
  wrapper.style.transform = `scale(${zoom})`
  wrapper.style.transformOrigin = 'top center'
  const wrapperHeight = wrapper.scrollHeight * zoom
  container.style.minHeight = `${wrapperHeight}px`
}

export default function DocxPreview({
  blob,
  version,
  zoom,
  manifest,
  activeRule,
  selectedNodeId,
  selectedNode,
  previewRef,
  restoreScrollTopRef,
  formatTypes,
  selectedFormatId,
  onPickNode,
  onInlineInsert,
  inserting,
  citationRegistry,
  setSelectedNodeId,
  onStartImageInsert,
  onStartTableInsert,
  onFitWidth,
}: DocxPreviewProps) {
  const localRef = useRef<HTMLDivElement | null>(null)
  const scrollTopRef = useRef(0)
  const renderDoneRef = useRef(false)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [inlineText, setInlineText] = useState('')
  const [insertFormatId, setInsertFormatId] = useState(selectedFormatId)
  const [menuMode, setMenuMode] = useState<'choose' | 'text'>('choose')
  const [bindingWarning, setBindingWarning] = useState<string | null>(null)

  const setRef = (node: HTMLDivElement | null) => {
    localRef.current = node
    if (previewRef) (previewRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }

  const updateMenuPos = useCallback(() => {
    const container = localRef.current
    if (!container || !selectedNodeId || !selectedNode?.acceptsGenerated) {
      setMenuPos(null)
      setMenuOpen(false)
      return
    }
    const selected = container.querySelector(`[data-node-id="${selectedNodeId}"]`) as HTMLElement | null
    if (!selected) {
      setMenuPos(null)
      setMenuOpen(false)
      return
    }
    const selectedRect = selected.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const relTop = selectedRect.top - containerRect.top + container.scrollTop
    const section = container.querySelector('section.docx-render') as HTMLElement | null
    const sectionLeft = section ? section.getBoundingClientRect().left - containerRect.left : 40
    setMenuPos({
      top: relTop,
      height: selectedRect.height,
      paperLeft: Math.max(4, sectionLeft - 36),
    })
  }, [selectedNodeId, selectedNode?.acceptsGenerated])

  // ─── Render DOCX ───
  useEffect(() => {
    if (!blob || !localRef.current) return
    const container = localRef.current
    const previousScrollTop = restoreScrollTopRef?.current || container.scrollTop || scrollTopRef.current
    container.innerHTML = ''
    renderDoneRef.current = false

    renderAsync(blob as any, container, null, {
      className: 'docx-render',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    }).then(async () => {
      // Hide stray list numbers on empty paragraphs
      container.querySelectorAll('p').forEach((p) => {
        if (!p.textContent?.trim() && p.classList.toString().includes('docx-render-num')) {
          p.style.display = 'none'
        }
      })

      // Bind nodes (with fallback for VML textboxes)
      const registry = bindPreviewNodes(container, manifest)
      const warning = checkBindingHealth(registry)
      setBindingWarning(warning)

      // Apply locked-page masks (overlay, not DOM replacement)
      applyLockedPageMasks(container, manifest)

      applyPreviewMarkers(container, manifest, activeRule, selectedNodeId || '')

      renderDoneRef.current = true
      applyZoom(container, zoom)

      container.scrollTop = previousScrollTop
      scrollTopRef.current = previousScrollTop
    }).catch(console.error)
  }, [blob, version, manifest])

  useEffect(() => {
    if (!renderDoneRef.current) return
    applyZoom(localRef.current, zoom)
  }, [zoom])

  useEffect(() => {
    const container = localRef.current
    if (!container) return
    applyPreviewMarkers(container, manifest, activeRule, selectedNodeId || '')

    if (selectedNodeId) {
      const selected = container.querySelector(`[data-node-id="${selectedNodeId}"]`) as HTMLElement | null
      if (selected) {
        selected.scrollIntoView({ block: 'center' })
        requestAnimationFrame(() => updateMenuPos())
      }
    } else {
      setMenuPos(null)
    }
  }, [activeRule, selectedNodeId, selectedNode?.acceptsGenerated, blob, version, updateMenuPos])

  useEffect(() => {
    setInsertFormatId(selectedFormatId)
  }, [selectedFormatId, selectedNodeId])

  const handleScroll = useCallback(() => {
    scrollTopRef.current = localRef.current?.scrollTop || 0
    if (menuOpen) updateMenuPos()
  }, [menuOpen, updateMenuPos])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement

    // Ignore clicks on the locked-page mask
    if (target.classList.contains('locked-page-mask') || target.classList.contains('locked-page-label')) return

    // Citation link
    const citeLink = target.closest('a[href^="#ref"]') as HTMLAnchorElement | null
    if (citeLink) {
      event.preventDefault()
      const refId = citeLink.getAttribute('href')?.slice(1)
      if (refId) localRef.current?.querySelector(`#${CSS.escape(refId)}`)?.scrollIntoView({ block: 'center' })
      return
    }

    // Click inside a table: bubble up to the <table> node, not the cell paragraph
    const cellTag = target.tagName?.toLowerCase()
    if (cellTag === 'td' || cellTag === 'th' || target.closest('td, th')) {
      const table = target.closest('table[data-node-id]') as HTMLElement | null
      if (table) {
        const node = (manifest?.nodes || []).find((n) => n.nodeId === table.dataset.nodeId)
        if (node?.zone !== 'references') onPickNode?.(table.dataset.nodeId!)
        return
      }
    }

    // Click on image/svg that might overlap other nodes
    const tag = target.tagName?.toLowerCase()
    if (tag === 'img' || tag === 'image' || tag === 'svg') {
      const parentP = target.closest('[data-node-id]') as HTMLElement | null
      const container = localRef.current
      if (container && parentP) {
        for (const node of container.querySelectorAll('[data-node-id]') as NodeListOf<HTMLElement>) {
          if (node === parentP) continue
          const r = node.getBoundingClientRect()
          if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) {
            const clickNode = (manifest?.nodes || []).find((n) => n.nodeId === node.dataset.nodeId)
            if (clickNode?.zone !== 'references') onPickNode?.(node.dataset.nodeId!)
            return
          }
        }
      }
    }

    // Default: find nearest bound node
    const nearestTarget = (target.closest('[data-node-id]') as HTMLElement | null) || findNearestNodeElement(event)
    if (nearestTarget?.dataset?.nodeId) {
      const node = (manifest?.nodes || []).find((n) => n.nodeId === nearestTarget.dataset.nodeId)
      if (node?.zone !== 'references') onPickNode(nearestTarget.dataset.nodeId)
    }
  }

  const findNearestNodeElement = (event: React.MouseEvent<HTMLDivElement>): HTMLElement | null => {
    const container = localRef.current
    if (!container) return null
    const nodes = [...container.querySelectorAll('[data-node-id]')] as HTMLElement[]
    let exact: HTMLElement | null = null
    let exactDist = Infinity
    let best: HTMLElement | null = null
    let bestDist = Infinity

    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        const dist = Math.abs(event.clientY - (rect.top + rect.height / 2))
        if (dist < exactDist) { exact = node; exactDist = dist }
      }
      const expanded = { left: rect.left - 18, right: rect.right + 18, top: rect.top - 10, bottom: rect.bottom + 10 }
      if (event.clientX >= expanded.left && event.clientX <= expanded.right && event.clientY >= expanded.top && event.clientY <= expanded.bottom) {
        const dist = Math.abs(event.clientY - (rect.top + rect.height / 2))
        if (dist < bestDist) { best = node; bestDist = dist }
      }
    }
    return exact || best
  }

  const submitInlineInsert = async () => {
    const text = inlineText.trim()
    if (!text || inserting) return
    const formatType = formatTypes.find((item) => item.id === insertFormatId) || formatTypes[0]
    await onInlineInsert?.(text, formatType, 'insertAfter')
    setInlineText('')
    setMenuOpen(false)
    setMenuMode('choose')
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setMenuMode('choose')
    setInlineText('')
  }

  const menuTop = menuPos
    ? (menuPos.top > (localRef.current?.clientHeight || 600) - 260
        ? menuPos.top - 220
        : menuPos.top + menuPos.height + 4)
    : 0

  return (
    <div className="docx-preview-frame">
      <div ref={setRef} className="docx-preview" onClick={handleClick} onScroll={handleScroll} />

      {/* Binding warning badge */}
      {bindingWarning && (
        <div className="binding-warning" title={bindingWarning}>
          ⚠ {bindingWarning}
        </div>
      )}

      {/* Left-margin insert button */}
      {menuPos && selectedNode?.acceptsGenerated && (
        <button
          className="insert-gutter-btn"
          style={{ top: menuPos.top, left: menuPos.paperLeft }}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); setMenuMode('choose') }}
          title="插入内容"
        >+</button>
      )}

      {/* Insert menu */}
      {menuOpen && menuPos && (
        <div className="insert-menu" style={{ top: menuTop, left: (menuPos.paperLeft || 4) + 34 }} onClick={e => e.stopPropagation()}>
          {menuMode === 'choose' && (
            <>
              <div className="insert-menu-title">插入内容</div>
              <button className="insert-menu-item" onClick={() => setMenuMode('text')}>
                <span className="insert-menu-icon">¶</span>文本段落
              </button>
              <button className="insert-menu-item" onClick={() => { closeMenu(); onStartImageInsert?.('after') }}>
                <span className="insert-menu-icon">🖼</span>图片
              </button>
              <button className="insert-menu-item" onClick={() => { closeMenu(); onStartTableInsert?.('after') }}>
                <span className="insert-menu-icon">⊞</span>表格
              </button>
              <div className="insert-menu-divider" />
              {formatTypes.filter(f => !f.custom).slice(0, 4).map(f => (
                <button key={f.id} className="insert-menu-item insert-menu-format" onClick={async () => {
                  await onInlineInsert?.('新段落内容', f, 'insertAfter')
                  closeMenu()
                }}>{f.label}</button>
              ))}
            </>
          )}

          {menuMode === 'text' && (
            <>
              <div className="insert-menu-title">
                <button className="insert-menu-back" onClick={() => setMenuMode('choose')}>←</button>
                插入文本
              </div>
              <select className="insert-menu-select" value={insertFormatId} onChange={e => setInsertFormatId(e.target.value)}>
                {formatTypes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <textarea
                className="insert-menu-textarea"
                value={inlineText}
                onChange={e => setInlineText(e.target.value)}
                placeholder="输入段落内容，@cite 插入引用"
                rows={4}
                autoFocus
              />
              <CiteAutocomplete refs={citationRegistry} onSelect={(ref: CitationRef) => {
                const token = `{{cite:${ref.id}}}`
                setInlineText(cur => {
                  const ta = document.querySelector('.insert-menu-textarea') as HTMLTextAreaElement | null
                  if (ta) { const s = ta.selectionStart || 0; const e = ta.selectionEnd || 0; return cur.slice(0, s) + token + cur.slice(e) }
                  return cur + token
                })
              }} />
              <div className="insert-menu-actions">
                <button className="btn-secondary btn-sm" onClick={closeMenu}>取消</button>
                <button className="btn-primary btn-sm" disabled={inserting || !inlineText.trim()} onClick={submitInlineInsert}>
                  {inserting ? '写入中' : '插入'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
