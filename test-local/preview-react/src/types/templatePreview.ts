/** Format override for a single node or rule */
export interface FormatOverride {
  font?: string
  sizePt?: number
  bold?: boolean
  alignment?: 'left' | 'center' | 'right' | 'both'
  lineSpacing?: number
  firstLineIndentChars?: number | null
  clearIndent?: boolean
  spaceBefore?: number
  spaceAfter?: number
  letterSpacing?: number
  color?: string
}

/** A selectable format type (template-derived or custom) */
export interface FormatType {
  id: string
  label: string
  zone: string
  role: string
  ruleId: string
  custom: boolean
  format?: FormatOverride
}

/** A document node (paragraph, image, or table) */
export interface TplNode {
  nodeId: string
  kind: 'paragraph' | 'image' | 'table'
  zone: string
  role: string
  xpath: string
  text: string
  displayText?: string
  paraId?: string
  styleId?: string
  outlineLevel?: number
  hasNumbering?: boolean
  numberLabel?: string
  acceptsGenerated?: boolean
  generated?: boolean
  sectionLabel?: string
  lockedReason?: string
  formatOverride?: FormatOverride
  formatRuleId?: string
  citations?: string[]
  previewAnchor?: string
  // image fields
  width?: number
  height?: number
  embedId?: string
  mediaPath?: string
  contentType?: string
  // table fields
  rows?: number
  cols?: number
  cellTexts?: string[]
}

/** A formatting rule that targets nodes by zone/role */
export interface Rule {
  ruleId: string
  label: string
  selector: { zone: string; role: string }
  sectionKey: string
  sectionLabel: string
  format: FormatOverride
  targetNodeIds: string[]
  targetCount: number
}

/** A citation reference in the registry */
export interface CitationRef {
  id: string
  index: number
  label: string
  nodeId: string
  text: string
  bookmark: string
}

/** The full document manifest returned by the backend */
export interface Manifest {
  source: string
  caseId: string
  version: number
  nodeCount: number
  nodes: TplNode[]
  rules: Rule[]
  citationRegistry: CitationRef[]
  writableNodeIds: string[]
  lockedNodeIds: string[]
  productMode: string
  lockedPreview?: { pages: number[]; autoSections?: string[] }
  cleaningSummary?: {
    totalNodes: number
    writableNodes: number
    lockedNodes: number
  }
  cleaningPlan?: Array<{ key: string; label: string; count: number; nodeIds?: string[] }>
}

/** Normalized mutation response from backend */
export interface MutationResponse {
  manifest: Manifest
  affectedNodeId?: string | null
  operation?: string
  results?: Array<{ type: string; nodeId?: string; error?: string }>
}

/** Role option for node type selection */
export interface RoleOption {
  label: string
  zone: string
  role: string
  ruleId: string
}

/** Size option for font size selectors */
export interface SizeOption {
  label: string
  value: number
}

/** Alignment option */
export interface AlignOption {
  label: string
  value: 'left' | 'center' | 'right' | 'both'
}
