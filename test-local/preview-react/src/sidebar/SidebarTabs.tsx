import React, { useState, useMemo } from 'react'
import type { Manifest, TplNode } from '../types/templatePreview'

interface HeadingNode {
  nodeId: string
  text: string
  level: number
  children: HeadingNode[]
}

interface Section {
  key: string
  label: string
  children: HeadingNode[]
}

interface SidebarTabsProps {
  manifest: Manifest | null
  selectedNodeId: string | null
  pickNode: (nodeId: string) => void
}

export default function SidebarTabs({ manifest, selectedNodeId, pickNode }: SidebarTabsProps) {
  const [search, setSearch] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['body']))
  const nodes: TplNode[] = manifest?.nodes || []

  // Build heading-only tree
  const documentTree = useMemo(() => {
    const sections: Section[] = []
    let currentSection: Section | null = null
    const headingStack: HeadingNode[] = []

    for (const node of nodes) {
      const zone = node.zone || 'unknown'
      const role = node.role || ''
      const text = (node.displayText || node.text || '').substring(0, 80)
      const isHeading = role.startsWith('heading')

      // Only include headings in the tree
      if (!isHeading) continue

      // Start new section when zone changes
      if (!currentSection || currentSection.key !== zone) {
        currentSection = { key: zone, label: zoneLabel(zone), children: [] }
        sections.push(currentSection)
        headingStack.length = 0
      }

      const level = parseInt(role.replace('heading', '')) || 1
      const headingNode: HeadingNode = { nodeId: node.nodeId, text, level, children: [] }

      // Pop headings of same or deeper level
      while (headingStack.length > 0) {
        if (headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop()
        } else break
      }

      if (headingStack.length > 0) {
        headingStack[headingStack.length - 1].children.push(headingNode)
      } else {
        currentSection.children.push(headingNode)
      }
      headingStack.push(headingNode)
    }

    return sections
  }, [nodes])

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filteredTree = search.trim()
    ? documentTree.map(section => ({
        ...section,
        children: filterTree(section.children, search.trim().toLowerCase()),
      })).filter(s => s.children.length > 0)
    : documentTree

  return (
    <div className="nav-panel">
      <div className="nav-search">
        <input
          type="text"
          placeholder="搜索章节..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="nav-tree">
        {filteredTree.map(section => (
          <div key={section.key} className="nav-section">
            <div className="nav-section-label" onClick={() => toggleSection(section.key)}>
              <span className="nav-chevron">{expandedSections.has(section.key) ? '▾' : '▸'}</span>
              <span>{section.label}</span>
            </div>
            {expandedSections.has(section.key) && (
              <div className="nav-section-items">
                {section.children.map(child => renderTreeNode(child, selectedNodeId, pickNode, 0))}
              </div>
            )}
          </div>
        ))}
        {filteredTree.length === 0 && (
          <div className="nav-empty">{search ? '无匹配章节' : '加载中...'}</div>
        )}
      </div>
    </div>
  )
}

function renderTreeNode(node: HeadingNode, selectedNodeId: string | null, pickNode: (nodeId: string) => void, depth: number): React.ReactNode {
  const isSelected = selectedNodeId === node.nodeId
  return (
    <div key={node.nodeId}>
      <div
        className={`nav-item ${isSelected ? 'selected' : ''} nav-level-${node.level}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => pickNode(node.nodeId)}
      >
        <span className="nav-node-text">{node.text || '(无标题)'}</span>
      </div>
      {node.children?.map(child => renderTreeNode(child, selectedNodeId, pickNode, depth + 1))}
    </div>
  )
}

function filterTree(children: HeadingNode[], query: string): HeadingNode[] {
  const result: HeadingNode[] = []
  for (const child of children) {
    const childMatches = filterTree(child.children || [], query)
    const selfMatch = (child.text || '').toLowerCase().includes(query)
    if (selfMatch || childMatches.length > 0) {
      result.push({ ...child, children: selfMatch ? (child.children || []) : childMatches })
    }
  }
  return result
}

const ZONE_LABELS: Record<string, string> = {
  abstract_cn: '中文摘要',
  abstract_en: '英文摘要',
  body: '正文',
  acknowledgement: '致谢',
  references: '参考文献',
  appendix: '附录',
  media: '图表',
}

function zoneLabel(zone: string): string {
  return ZONE_LABELS[zone] || zone.replace(/_/g, ' ')
}
