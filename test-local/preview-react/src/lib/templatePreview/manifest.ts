import type { FormatType, Manifest, Rule, RoleOption, SizeOption, AlignOption } from '../../types/templatePreview'

/** Default format types (template-independent) */
export const DEFAULT_FORMAT_TYPES: FormatType[] = [
  { id: 'body.paragraph', label: '正文段落', zone: 'body', role: 'paragraph', ruleId: 'body.paragraph', custom: false },
  { id: 'body.heading1', label: '一级标题', zone: 'body', role: 'heading1', ruleId: 'body.heading1', custom: false },
  { id: 'body.heading2', label: '二级标题', zone: 'body', role: 'heading2', ruleId: 'body.heading2', custom: false },
  { id: 'body.heading3', label: '三级标题', zone: 'body', role: 'heading3', ruleId: 'body.heading3', custom: false },
  { id: 'custom.default', label: '独立格式', zone: 'body', role: 'custom', ruleId: '', custom: true, format: { font: '仿宋', sizePt: 12, bold: false, alignment: 'left', lineSpacing: 1.25 } },
]

/** Font options for selectors */
export const FONT_OPTIONS: string[] = ['宋体', '黑体', '楷体', '仿宋', 'Times New Roman']

/** Size options for selectors */
export const SIZE_OPTIONS: SizeOption[] = [
  { label: '五号 (10pt)', value: 10 },
  { label: '小五 (10.5pt)', value: 10.5 },
  { label: '小四 (12pt)', value: 12 },
  { label: '四号 (14pt)', value: 14 },
  { label: '小三 (15pt)', value: 15 },
  { label: '三号 (16pt)', value: 16 },
  { label: '小二 (18pt)', value: 18 },
  { label: '二号 (22pt)', value: 22 },
]

/** Alignment options for selectors */
export const ALIGN_OPTIONS: AlignOption[] = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
  { label: '两端对齐', value: 'both' },
]

/** Role options for node type selection */
export const ROLE_OPTIONS: RoleOption[] = [
  { label: '正文段落', zone: 'body', role: 'paragraph', ruleId: 'body.paragraph' },
  { label: '一级标题', zone: 'body', role: 'heading1', ruleId: 'body.heading1' },
  { label: '二级标题', zone: 'body', role: 'heading2', ruleId: 'body.heading2' },
  { label: '三级标题', zone: 'body', role: 'heading3', ruleId: 'body.heading3' },
  { label: '独立格式', zone: 'body', role: 'custom', ruleId: '' },
]

/** Build a role value string from zone and role */
export function roleValue(option: { zone: string; role: string }): string {
  return `${option.zone}.${option.role}`
}

/** Parse a role value string back into zone and role */
export function parseRoleValue(value: string): { zone: string; role: string } {
  const [zone, role] = value.split('.')
  return { zone, role }
}

/** Merge template-derived format types with custom types, deduplicating by id */
export function formatTypesFromManifest(manifest: Manifest | null, currentTypes: FormatType[] = DEFAULT_FORMAT_TYPES): FormatType[] {
  const templateTypes: FormatType[] = (manifest?.rules || [])
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
  const seen = new Set<string>()
  return [...templateTypes, ...customTypes].filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/** Build a ruleId → format map from manifest rules */
export function buildRuleFormats(manifest: Manifest | null): Record<string, import('../../types/templatePreview').FormatOverride> {
  return Object.fromEntries((manifest?.rules || []).map((r) => [r.ruleId, r.format]))
}

/** Normalize a mutation response to always have { manifest, affectedNodeId, operation } */
export function normalizeMutationResponse(response: any): { manifest: Manifest; affectedNodeId?: string | null; operation?: string } {
  if (response && typeof response === 'object' && response.manifest && response.operation) {
    return response
  }
  return { manifest: response, affectedNodeId: null, operation: null }
}

/** Get a short summary string for a format override */
export function formatSummary(fmt: import('../../types/templatePreview').FormatOverride | undefined | null): string {
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
