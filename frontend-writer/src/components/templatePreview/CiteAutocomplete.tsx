import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { CitationRef } from '../../types/templatePreview'

interface CiteAutocompleteProps {
  refs?: CitationRef[] | null
  onSelect: (ref: CitationRef) => void
}

export default function CiteAutocomplete({ refs, onSelect }: CiteAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [targetEl, setTargetEl] = useState<HTMLTextAreaElement | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!refs?.length) return []
    const q = query.toLowerCase()
    return q
      ? refs.filter((r) => (r.label || '').toLowerCase().includes(q) || (r.text || '').toLowerCase().includes(q))
      : refs
  }, [refs, query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  useEffect(() => {
    const handleInput = (e: Event) => {
      const el = e.target as HTMLTextAreaElement
      if (el.tagName !== 'TEXTAREA') return
      const val = el.value || ''
      const caret = el.selectionStart || 0
      const before = val.slice(0, caret)
      const match = before.match(/@cite\s*(\S*)$/i)
      if (match) {
        setQuery(match[1])
        setTargetEl(el)
        setActiveIdx(0)
        setOpen(true)
        const rect = el.getBoundingClientRect()
        setPos({ top: rect.bottom + 4, left: rect.left })
      } else {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' && filtered.length) { e.preventDefault(); pick(filtered[activeIdx]) }
      else if (e.key === 'Escape') { setOpen(false) }
    }
    document.addEventListener('input', handleInput, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('input', handleInput, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [open, filtered, activeIdx])

  const pick = (ref: CitationRef) => {
    if (!targetEl) return
    const el = targetEl
    const val = el.value
    const caret = el.selectionStart || 0
    const before = val.slice(0, caret)
    const after = val.slice(caret)
    const newBefore = before.replace(/@cite\s*\S*$/i, `{{cite:${ref.id}}}`)
    const newText = newBefore + after
    const newCaret = newBefore.length
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    nativeInputValueSetter.call(el, newText)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = newCaret; el.focus() })
    setOpen(false)
  }

  if (!open || !filtered.length) return null

  return (
    <div className="cite-popup" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, maxHeight: 220, overflow: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.15)', width: 340 }} ref={listRef}>
      {filtered.map((ref, i) => (
        <div
          key={ref.id}
          onClick={() => pick(ref)}
          style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, background: i === activeIdx ? '#eef4ff' : 'transparent', borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}
          onMouseEnter={() => setActiveIdx(i)}
        >
          <strong style={{ color: '#2563eb', marginRight: 6 }}>{ref.label}</strong>
          <span style={{ color: '#334155' }}>{ref.text?.slice(0, 60)}{ref.text && ref.text.length > 60 ? '…' : ''}</span>
        </div>
      ))}
    </div>
  )
}
