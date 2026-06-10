import type { Manifest, MutationResponse, FormatOverride } from '../types/templatePreview'

// Use relative paths — vite proxy or nginx handles routing to backend.
// For standalone preview-react dev, proxy /api → http://localhost:8000 in vite.config.
const BASE = '/api/template-binding'

async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${response.status}`)
  }
  return response.json()
}

/** Normalize mutation response to always include manifest wrapper */
function normalizeResponse(data: any): MutationResponse {
  if (data && typeof data === 'object' && data.manifest && data.operation) {
    return data
  }
  return { manifest: data, affectedNodeId: null, operation: null }
}

// ─── Template loading ───

export async function loadCase(): Promise<Manifest> {
  return apiRequest('/case/load', { method: 'POST' })
}

export async function loadDocx(caseId: string, version: number): Promise<Blob> {
  const response = await fetch(`${BASE}/${caseId}/file?v=${version || Date.now()}`)
  if (!response.ok) throw new Error('无法读取工作 DOCX')
  return response.blob()
}

// ─── Rule operations ───

export async function applyRule(caseId: string, ruleId: string, format: FormatOverride): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/rule/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ format }),
  })
  return normalizeResponse(data)
}

// ─── Node operations ───

export interface InsertTextPayload {
  text: string
  zone: string
  role: string
  mode: string
  anchorNodeId: string
  customFormat?: FormatOverride | null
}

export async function insertText(caseId: string, payload: InsertTextPayload): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/node`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return normalizeResponse(data)
}

export interface ReplaceTextPayload {
  text: string
  formatRuleId?: string
  formatOverride?: FormatOverride | null
  preserveFormat?: boolean
}

export async function replaceText(caseId: string, nodeId: string, payload: ReplaceTextPayload): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/node/${nodeId}/content`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return normalizeResponse(data)
}

export async function deleteNode(caseId: string, nodeId: string): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/node/${nodeId}`, {
    method: 'DELETE',
  })
  return normalizeResponse(data)
}

export async function updateNodeRole(caseId: string, nodeId: string, payload: { zone: string; role: string }): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/node/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return normalizeResponse(data)
}

// ─── Image operations ───

export async function insertImage(caseId: string, file: File, options: { anchorNodeId?: string; widthPx?: number; mode?: string } = {}): Promise<MutationResponse> {
  const { anchorNodeId = '', widthPx = 400, mode = 'insertAfter' } = options
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(
    `${BASE}/${caseId}/image?anchor=${anchorNodeId}&width=${widthPx}&mode=${mode}`,
    { method: 'POST', body: form }
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || '图片上传失败')
  }
  return normalizeResponse(await response.json())
}

export async function replaceImage(caseId: string, nodeId: string, file: File, options: { widthPx?: number } = {}): Promise<MutationResponse> {
  const { widthPx = 400 } = options
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(
    `${BASE}/${caseId}/image/${nodeId}?width=${widthPx}`,
    { method: 'PATCH', body: form }
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || '图片替换失败')
  }
  return normalizeResponse(await response.json())
}

// ─── Table operations ───

export async function insertTable(caseId: string, payload: { rows: number; cols: number; anchorNodeId?: string; cellTexts?: string[]; mode?: string }): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/table`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return normalizeResponse(data)
}

export async function updateTable(caseId: string, nodeId: string, payload: { rows: number; cols: number; cellTexts?: string[] }): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/table/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return normalizeResponse(data)
}

// ─── Batch operations ───

export interface BatchOperation {
  type: 'insert' | 'replace' | 'delete'
  text?: string
  zone?: string
  role?: string
  mode?: string
  anchorNodeId?: string
  customFormat?: FormatOverride | null
  nodeId?: string
  formatRuleId?: string
  formatOverride?: FormatOverride | null
  preserveFormat?: boolean
}

export async function batchOperations(caseId: string, operations: BatchOperation[]): Promise<MutationResponse> {
  const data = await apiRequest(`/case/${caseId}/batch`, {
    method: 'POST',
    body: JSON.stringify({ operations }),
  })
  return normalizeResponse(data)
}

// ─── Config operations ───

export async function loadConfig(): Promise<any> {
  return apiRequest('/config')
}

export async function saveConfig(caseId: string, config: any): Promise<any> {
  return apiRequest(`/case/${caseId}/config`, {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function generateConfig(caseId: string): Promise<any> {
  return apiRequest(`/case/${caseId}/generate-config`, { method: 'POST' })
}
