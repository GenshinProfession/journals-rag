import React, { useEffect, useRef, useState, useCallback } from 'react'
import { renderAsync } from 'docx-preview'
import JSZip from 'jszip'
import CiteAutocomplete from './CiteAutocomplete'
import { bindPreviewNodes, applyPreviewMarkers } from '../../lib/templatePreview/previewBinding'
import type { Manifest, TplNode, Rule, FormatType, CitationRef } from '../../types/templatePreview'

const PREVIEW_API = '/api/template-binding'

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

function applyLockedPreviewPages(container: HTMLElement, manifest: Manifest | null): void {
  const pages = manifest?.lockedPreview?.pages || []
  if (!pages.length) return
  const sections = container.querySelectorAll('section.docx-render')
  if (!sections.length) return

  const lockSection = (section: Element, pageNo: number, label = `锁定页 ${pageNo}`) => {
    const imageUrl = `${PREVIEW_API}/${manifest!.caseId}/preview/page/${pageNo}`
    const htmlSection = section as HTMLElement
    htmlSection.dataset.lockedPreviewPage = String(pageNo)
    htmlSection.style.position = 'relative'
    const height = htmlSection.getBoundingClientRect().height || 800
    htmlSection.style.height = `${height}px`
    htmlSection.innerHTML = `
      <div class="locked-preview-page">
        <div class="locked-preview-loading">正在生成锁定页预览...</div>
        <img draggable="false" alt="locked preview page ${pageNo}" src="${imageUrl}" />
        <div class="locked-preview-badge">${label}</div>
      </div>
    `
    const img = htmlSection.querySelector('img')!
    img.onload = () => htmlSection.classList.add('locked-preview-ready')
    img.onerror = () => htmlSection.classList.add('locked-preview-error')
  }

  for (const pageNo of pages) {
    const section = sections[pageNo - 1]
    if (!section) continue
    section.querySelectorAll('[data-node-id]').forEach(el => {
      const htmlEl = el as HTMLElement
      if (htmlEl.dataset.nodeId) {
        (window as any).__lockedNodeMap = (window as any).__lockedNodeMap || {}
        ;(window as any).__lockedNodeMap[htmlEl.dataset.nodeId] = section
      }
    })
    lockSection(section, pageNo)
  }

  if (manifest?.lockedPreview?.autoSections?.includes('toc')) {
    sections.forEach((section, index) => {
      const htmlSection = section as HTMLElement
      if (htmlSection.dataset.lockedPreviewPage) return
      const compact = (htmlSection.textContent || '').replace(/\s+/g, '')
      if (compact.includes('目录') && (compact.includes('1引言') || compact.includes('参考文献') || compact.includes('致谢'))) {
        lockSection(htmlSection, index + 1, `目录锁定页 ${index + 1}`)
      }
    })
  }
}

/** Apply zoom to the docx wrapper, adjusting container height to prevent overlap */
function applyZoom(container: HTMLElement | null, zoom: number): void {
  if (!container) return
  const wrapper = container.querySelector('.docx-render') as HTMLElement | null
  if (!wrapper) return
  wrapper.style.transform = `scale(${zoom})`
  wrapper.style.transformOrigin = 'top center'
  // Set container min-height based on scaled wrapper height
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

  const setRef = (node: HTMLDivElement | null) => {
    localRef.current = node
    if (previewRef) (previewRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }

  /** Calculate menu position relative to container, near the paper's left edge */
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
    // Find the paper section to get its left edge
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
      // docx-preview already reads pgMar from OOXML and applies margins to each section.
      // No manual margin application needed.

      container.querySelectorAll('p').forEach((p) => {
        if (!p.textContent?.trim() && p.classList.toString().includes('docx-render-num')) {
          p.style.display = 'none'
        }
      })

      bindPreviewNodes(container, manifest)
      applyLockedPreviewPages(container, manifest)
      applyPreviewMarkers(container, manifest, activeRule, selectedNodeId || '')

      // Apply zoom AFTER rendering is complete
      renderDoneRef.current = true
      applyZoom(container, zoom)

      container.scrollTop = previousScrollTop
      scrollTopRef.current = previousScrollTop
    }).catch(console.error)
  }, [blob, version, manifest])

  // ─── Apply zoom when it changes (only if render is done) ───
  useEffect(() => {
    if (!renderDoneRef.current) return
    applyZoom(localRef.current, zoom)
  }, [zoom])

  // ─── Update markers and menu position on selection change ───
  useEffect(() => {
    const container = localRef.current
    if (!container) return
    applyPreviewMarkers(container, manifest, activeRule, selectedNodeId || '')

    if (selectedNodeId) {
      const selected = container.querySelector(`[data-node-id="${selectedNodeId}"]`) as HTMLElement | null
      if (selected) {
        // Use instant scroll to avoid menu desync during smooth scroll
        selected.scrollIntoView({ block: 'center' })
        // Update menu position after scroll settles
        requestAnimationFrame(() => {
          updateMenuPos()
        })
      } else {
        const lockedMap = (window as any).__lockedNodeMap || {}
        lockedMap[selectedNodeId]?.scrollIntoView({ block: 'center' })
      }
    } else {
      setMenuPos(null)
    }
  }, [activeRule, selectedNodeId, selectedNode?.acceptsGenerated, blob, version, updateMenuPos])

  useEffect(() => {
    setInsertFormatId(selectedFormatId)
  }, [selectedFormatId, selectedNodeId])

  // ─── Scroll handler: keep menu position in sync ───
  const handleScroll = useCallback(() => {
    scrollTopRef.current = localRef.current?.scrollTop || 0
    if (menuOpen) {
      updateMenuPos()
    }
  }, [menuOpen, updateMenuPos])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const citeLink = target.closest('a[href^="#ref"]') as HTMLAnchorElement | null
    if (citeLink) {
      event.preventDefault()
      const refId = citeLink.getAttribute('href')?.slice(1)
      if (refId) {
        localRef.current?.querySelector(`#${CSS.escape(refId)}`)?.scrollIntoView({ block: 'center' })
      }
      return
    }

    const cellTag = target.tagName?.toLowerCase()
    if (cellTag === 'td' || cellTag === 'th') {
      const table = target.closest('table[data-node-id]') as HTMLElement | null
      if (table) {
        const node = (manifest?.nodes || []).find((n) => n.nodeId === table.dataset.nodeId)
        if (node?.zone === 'references') return
        onPickNode?.(table.dataset.nodeId!)
        return
      }
    }

    const tag = target.tagName?.toLowerCase()
    if (tag === 'img' || tag === 'image' || tag === 'svg' || tag === 'span') {
      const parentP = target.closest('[data-node-id]') as HTMLElement | null
      const container = localRef.current
      if (container && parentP) {
        for (const node of container.querySelectorAll('[data-node-id]') as NodeListOf<HTMLElement>) {
          if (node === parentP) continue
          const r = node.getBoundingClientRect()
          if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) {
            const clickNode = (manifest?.nodes || []).find((n) => n.nodeId === node.dataset.nodeId)
            if (clickNode?.zone === 'references') return
            onPickNode?.(node.dataset.nodeId!)
            return
          }
        }
      }
    }

    const nearestTarget = (target.closest('[data-node-id]') as HTMLElement | null) || findNearestNodeElement(event)
    if (nearestTarget?.dataset?.nodeId) {
      const node = (manifest?.nodes || []).find((n) => n.nodeId === nearestTarget.dataset.nodeId)
      if (node?.zone === 'references') return
      onPickNode(nearestTarget.dataset.nodeId)
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

  // Position menu: if near bottom, open upward
  const menuTop = menuPos
    ? (menuPos.top > (localRef.current?.clientHeight || 600) - 260
        ? menuPos.top - 220
        : menuPos.top + menuPos.height + 4)
    : 0

  return (
    <div className="docx-preview-frame">
      <div
        ref={setRef}
        className="docx-preview"
        onClick={handleClick}
        onScroll={handleScroll}
      />

      {/* Left-margin insert button, positioned near paper edge */}
      {menuPos && selectedNode?.acceptsGenerated && (
        <button
          className="insert-gutter-btn"
          style={{ top: menuPos.top, left: menuPos.paperLeft }}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen(o => !o)
            setMenuMode('choose')
          }}
          title="插入内容"
        >
          +
        </button>
      )}

      {/* Insert menu */}
      {menuOpen && menuPos && (
        <div
          className="insert-menu"
          style={{ top: menuTop, left: (menuPos.paperLeft || 4) + 34 }}
          onClick={e => e.stopPropagation()}
        >
          {menuMode === 'choose' && (
            <>
              <div className="insert-menu-title">插入内容</div>
              <button className="insert-menu-item" onClick={() => setMenuMode('text')}>
                <span className="insert-menu-icon">{'¶'}</span>文本段落
              </button>
              <button className="insert-menu-item" onClick={() => { closeMenu(); onStartImageInsert?.('after') }}>
                <span className="insert-menu-icon">{'🖼'}</span>图片
              </button>
              <button className="insert-menu-item" onClick={() => { closeMenu(); onStartTableInsert?.('after') }}>
                <span className="insert-menu-icon">{'⊞'}</span>表格
              </button>
              <div className="insert-menu-divider" />
              {formatTypes.filter(f => !f.custom).slice(0, 4).map(f => (
                <button key={f.id} className="insert-menu-item insert-menu-format" onClick={async () => {
                  await onInlineInsert?.('新段落内容', f, 'insertAfter')
                  closeMenu()
                }}>
                  {f.label}
                </button>
              ))}
            </>
          )}

          {menuMode === 'text' && (
            <>
              <div className="insert-menu-title">
                <button className="insert-menu-back" onClick={() => setMenuMode('choose')}>{'←'}</button>
                插入文本
              </div>
              <select
                className="insert-menu-select"
                value={insertFormatId}
                onChange={e => setInsertFormatId(e.target.value)}
              >
                {formatTypes.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
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
                  if (ta) {
                    const s = ta.selectionStart || 0
                    const e = ta.selectionEnd || 0
                    return cur.slice(0, s) + token + cur.slice(e)
                  }
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
