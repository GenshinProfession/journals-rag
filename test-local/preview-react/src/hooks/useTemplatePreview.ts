import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { Manifest, TplNode, Rule, FormatType, FormatOverride } from '../types/templatePreview'
import * as API from '../api/templatePreview'
import { DEFAULT_FORMAT_TYPES, formatTypesFromManifest, buildRuleFormats, normalizeMutationResponse } from '../lib/templatePreview/manifest'

export interface UseTemplatePreviewReturn {
  // State
  manifest: Manifest | null
  docxBlob: Blob | null
  status: string
  nodeBusy: boolean
  zoom: number
  selectedNodeId: string
  insertMode: string | null
  formatTypes: FormatType[]
  leftPanel: 'nav' | 'config'
  leftCollapsed: boolean
  rightCollapsed: boolean

  // Derived
  nodeById: Record<string, TplNode>
  selectedNode: TplNode | null
  activeRule: Rule | null
  selectedFormatId: string

  // Refs
  previewRef: React.MutableRefObject<HTMLDivElement | null>
  restoreScrollTopRef: React.MutableRefObject<number>

  // Setters
  setZoom: React.Dispatch<React.SetStateAction<number>>
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string>>
  setInsertMode: React.Dispatch<React.SetStateAction<string | null>>
  setLeftPanel: React.Dispatch<React.SetStateAction<'nav' | 'config'>>
  setLeftCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  setRightCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  setManifest: React.Dispatch<React.SetStateAction<Manifest | null>>
  setStatus: React.Dispatch<React.SetStateAction<string>>

  // Actions
  pickNode: (nodeId: string) => void
  loadCase: () => Promise<void>
  addGeneratedNode: (text: string, zone: string, role: string, mode?: string, anchorNodeId?: string, customFormat?: FormatOverride | null) => Promise<void>
  saveCurrentNode: (node: TplNode, text: string, formatType: FormatType) => Promise<void>
  deleteCurrentNode: (node: TplNode) => Promise<void>
  changeNodeRole: (nodeId: string, zone: string, role: string) => Promise<void>
  insertImage: (file: File, widthPx?: number) => Promise<void>
  insertTable: (rows: number, cols: number, cellTexts?: string[]) => Promise<void>
  updateTable: (nodeId: string, rows: number, cols: number, cellTexts?: string[]) => Promise<void>
  inlineInsertAfterSelected: (text: string, formatType?: FormatType, mode?: string) => Promise<void>
  batchWrite: (operations: API.BatchOperation[]) => Promise<void>
  fitWidth: () => void
  loadDocx: (caseId: string, version: number) => Promise<void>
}

export function useTemplatePreview(): UseTemplatePreviewReturn {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)
  const [status, setStatus] = useState('等待加载测试模板')
  const [nodeBusy, setNodeBusy] = useState(false)
  const [zoom, setZoom] = useState(0.9)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [insertMode, setInsertMode] = useState<string | null>(null)
  const [formatTypes, setFormatTypes] = useState<FormatType[]>(DEFAULT_FORMAT_TYPES)
  const [leftPanel, setLeftPanel] = useState<'nav' | 'config'>('nav')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const restoreScrollTopRef = useRef(0)
  const docxReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const nodeById = useMemo(() => Object.fromEntries((manifest?.nodes || []).map((n) => [n.nodeId, n])), [manifest]) as Record<string, TplNode>
  const selectedNode = selectedNodeId ? nodeById[selectedNodeId] ?? null : null
  const activeRule: Rule | null = selectedNode
    ? manifest?.rules?.find((r) => r.selector?.zone === selectedNode.zone && r.selector?.role === selectedNode.role) ?? null
    : null
  const selectedFormatId = activeRule?.ruleId || DEFAULT_FORMAT_TYPES[0].id

  const pickNode = useCallback((nodeId: string) => setSelectedNodeId(nodeId), [])

  const loadDocx = useCallback(async (caseId: string, version: number) => {
    const blob = await API.loadDocx(caseId, version)
    setDocxBlob(blob)
  }, [])

  const refreshAfterMutation = useCallback(async (response: any, affectedNodeId?: string) => {
    const { manifest: nextManifest, affectedNodeId: respNodeId } = normalizeMutationResponse(response)
    const nodeId = affectedNodeId || respNodeId || ''
    setManifest(nextManifest)
    setFormatTypes((cur) => formatTypesFromManifest(nextManifest, cur))
    if (nodeId) setSelectedNodeId(nodeId)
    await loadDocx(nextManifest.caseId, nextManifest.version)
  }, [loadDocx])

  const scheduleDocxReload = useCallback((caseId: string, version: number) => {
    if (docxReloadTimer.current) clearTimeout(docxReloadTimer.current)
    docxReloadTimer.current = setTimeout(async () => {
      try { await loadDocx(caseId, version) } catch { /* ignore */ }
    }, 1500)
  }, [loadDocx])

  const loadCase = useCallback(async () => {
    setStatus('正在读取测试模板...')
    setSelectedNodeId('')
    try {
      const nextManifest = await API.loadCase()
      setManifest(nextManifest)
      setFormatTypes((cur) => formatTypesFromManifest(nextManifest, cur))
      await loadDocx(nextManifest.caseId, nextManifest.version)
      setStatus(`已加载 ${nextManifest.source}，${nextManifest.nodeCount} 个节点`)
    } catch (err: any) {
      setStatus(`加载失败：${err.message}`)
    }
  }, [loadDocx])

  const addGeneratedNode = useCallback(async (
    text: string, zone: string, role: string,
    mode = 'append', anchorNodeId = '', customFormat: FormatOverride | null = null
  ) => {
    if (!manifest?.caseId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus('正在写入文本...')
    try {
      const resp = await API.insertText(manifest.caseId, { text, zone, role, mode, anchorNodeId, customFormat })
      const { manifest: m, affectedNodeId: respNodeId } = normalizeMutationResponse(resp)
      const affectedId = respNodeId || (mode === 'replace' && anchorNodeId
        ? anchorNodeId
        : m.nodes?.filter((n) => n.generated).sort((a, b) => Number((b.nodeId || '').replace('p', '')) - Number((a.nodeId || '').replace('p', '')))[0]?.nodeId || '')
      await refreshAfterMutation(m, affectedId)
      setStatus(`已写入 ${affectedId || '节点'}`)
    } catch (err: any) {
      setStatus(`写入失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, refreshAfterMutation])

  const saveCurrentNode = useCallback(async (node: TplNode, text: string, formatType: FormatType) => {
    if (!node?.nodeId || !formatType || !manifest?.caseId) return
    const nodeId = node.nodeId
    const prevManifest = manifest
    setManifest(prev => {
      if (!prev) return prev
      return { ...prev, nodes: prev.nodes.map(n => n.nodeId === nodeId ? { ...n, text: text.slice(0, 90), displayText: text.slice(0, 90) } : n) }
    })
    setStatus('保存中...')
    try {
      const resp = await API.replaceText(manifest.caseId, nodeId, {
        text,
        formatRuleId: formatType.ruleId,
        formatOverride: formatType.custom ? formatType.format ?? null : null,
        preserveFormat: !formatType.custom,
      })
      const { manifest: nextManifest } = normalizeMutationResponse(resp)
      setManifest(nextManifest)
      setFormatTypes((cur) => formatTypesFromManifest(nextManifest, cur))
      scheduleDocxReload(nextManifest.caseId, nextManifest.version)
      setStatus(`已保存 ${nodeId}`)
    } catch (err: any) {
      setManifest(prevManifest)
      setStatus(`保存失败：${err.message}`)
    }
  }, [manifest, scheduleDocxReload])

  const deleteCurrentNode = useCallback(async (node: TplNode) => {
    if (!manifest?.caseId || !node?.nodeId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus(`正在删除 ${node.nodeId}...`)
    try {
      const resp = await API.deleteNode(manifest.caseId, node.nodeId)
      setSelectedNodeId('')
      await refreshAfterMutation(resp, '')
      setStatus(`已删除 ${node.nodeId}`)
    } catch (err: any) {
      setStatus(`删除失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, refreshAfterMutation])

  const changeNodeRole = useCallback(async (nodeId: string, zone: string, role: string) => {
    if (!manifest?.caseId || !nodeId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus('正在切换角色...')
    try {
      const resp = await API.updateNodeRole(manifest.caseId, nodeId, { zone, role })
      await refreshAfterMutation(resp, nodeId)
      setStatus(`已切换到 ${zone}.${role}`)
    } catch (err: any) {
      setStatus(`切换失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, refreshAfterMutation])

  const insertImage = useCallback(async (file: File, widthPx = 400) => {
    if (!manifest?.caseId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus(`正在上传图片 "${file.name}"...`)
    try {
      let resp: any
      if (selectedNode?.kind === 'image' || selectedNode?.role === 'image') {
        resp = await API.replaceImage(manifest.caseId, selectedNode.nodeId, file, { widthPx })
        setStatus(`图片 "${file.name}" 已替换`)
      } else {
        const anchorId = selectedNode?.acceptsGenerated ? selectedNode.nodeId : ''
        resp = await API.insertImage(manifest.caseId, file, { anchorNodeId: anchorId, widthPx, mode: 'insertAfter' })
        setStatus(`图片 "${file.name}" 已插入`)
      }
      setInsertMode(null)
      await refreshAfterMutation(resp, '')
    } catch (err: any) {
      setStatus(`图片操作失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, selectedNode, refreshAfterMutation])

  const insertTable = useCallback(async (rows: number, cols: number, cellTexts: string[] = []) => {
    if (!manifest?.caseId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus(`正在插入 ${rows}×${cols} 表格...`)
    try {
      const anchorId = selectedNode?.acceptsGenerated ? selectedNode.nodeId : ''
      const resp = await API.insertTable(manifest.caseId, { rows, cols, anchorNodeId: anchorId, cellTexts, mode: 'insertAfter' })
      setInsertMode(null)
      const { manifest: m } = normalizeMutationResponse(resp)
      const newTable = m.nodes.find(n => n.zone === 'media' && n.role === 'table' && n.generated)
      await refreshAfterMutation(m, newTable?.nodeId || '')
      setStatus('表格已插入')
    } catch (err: any) {
      setStatus(`表格插入失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, selectedNode, refreshAfterMutation])

  const updateTable = useCallback(async (nodeId: string, rows: number, cols: number, cellTexts: string[] = []) => {
    if (!manifest?.caseId) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus('正在更新表格...')
    try {
      const resp = await API.updateTable(manifest.caseId, nodeId, { rows, cols, cellTexts })
      await refreshAfterMutation(resp, nodeId)
      setStatus('表格已更新')
    } catch (err: any) {
      setStatus(`表格更新失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, refreshAfterMutation])

  const inlineInsertAfterSelected = useCallback(async (text: string, formatType?: FormatType, mode = 'insertAfter') => {
    if (!selectedNode?.acceptsGenerated) return
    const targetFormat = formatType || formatTypes.find((f) => f.id === selectedFormatId) || DEFAULT_FORMAT_TYPES[0]
    await addGeneratedNode(text, targetFormat.zone, targetFormat.role, mode, selectedNode.nodeId, targetFormat.custom ? targetFormat.format ?? null : null)
  }, [selectedNode, formatTypes, selectedFormatId, addGeneratedNode])

  const batchWrite = useCallback(async (operations: API.BatchOperation[]) => {
    if (!manifest?.caseId || !operations?.length) return
    restoreScrollTopRef.current = previewRef.current?.scrollTop || 0
    setNodeBusy(true)
    setStatus(`正在批量写入 ${operations.length} 个操作...`)
    try {
      const resp = await API.batchOperations(manifest.caseId, operations)
      const { manifest: m } = normalizeMutationResponse(resp)
      const results = resp.results || []
      const lastInsert = results.filter((r: any) => r.type === 'insert' && r.nodeId).pop()
      await refreshAfterMutation(m, lastInsert?.nodeId || '')
      const errors = results.filter((r: any) => r.error)
      setStatus(errors.length ? `批量写入完成，${errors.length} 个操作失败` : `批量写入 ${operations.length} 个操作完成`)
    } catch (err: any) {
      setStatus(`批量写入失败：${err.message}`)
    } finally {
      setNodeBusy(false)
    }
  }, [manifest?.caseId, refreshAfterMutation])

  const fitWidth = useCallback(() => {
    const container = previewRef.current
    if (!container) return
    const section = container.querySelector('section.docx-render') as HTMLElement | null
    if (!section) return
    const paperWidth = section.scrollWidth || 794
    const containerWidth = container.clientWidth - 40
    const newZoom = Math.min(1.2, Math.max(0.3, containerWidth / paperWidth))
    setZoom(Math.round(newZoom * 100) / 100)
  }, [])

  useEffect(() => { loadCase() }, [loadCase])

  return {
    manifest, docxBlob, status, nodeBusy, zoom, selectedNodeId, insertMode,
    formatTypes, leftPanel, leftCollapsed, rightCollapsed,
    nodeById, selectedNode, activeRule, selectedFormatId,
    previewRef, restoreScrollTopRef,
    setZoom, setSelectedNodeId, setInsertMode, setLeftPanel, setLeftCollapsed, setRightCollapsed, setManifest, setStatus,
    pickNode, loadCase, addGeneratedNode, saveCurrentNode, deleteCurrentNode,
    changeNodeRole, insertImage, insertTable, updateTable,
    inlineInsertAfterSelected, batchWrite, fitWidth, loadDocx,
  }
}
