import type { Manifest, Rule, TplNode } from '../../types/templatePreview'

export interface BindingRegistry {
  bound: number
  missing: string[]
  total: number
}

/**
 * Bind manifest nodes to rendered DOM elements using bookmark anchors.
 * docx-preview renders Word bookmarks as <span id="bookmarkName">.
 *
 * Fallback: for nodes whose anchor is missing (VML textboxes, embedded graphics),
 * try paraId lookup or adjacent-node inference.
 */
export function bindPreviewNodes(container: HTMLElement, manifest: Manifest | null): BindingRegistry {
  const nodes = manifest?.nodes || []

  // Clear existing bindings
  container.querySelectorAll('[data-node-id]').forEach((el) => {
    delete (el as HTMLElement).dataset.nodeId
    delete (el as HTMLElement).dataset.zone
    delete (el as HTMLElement).dataset.role
    delete (el as HTMLElement).dataset.nodeKind
  })

  const registry: BindingRegistry = { bound: 0, missing: [], total: nodes.length }

  // Pass 1: bind nodes whose anchors exist in DOM
  for (const node of nodes) {
    const anchorName = node.previewAnchor
    if (!anchorName) continue

    const anchor = container.querySelector(`#${CSS.escape(anchorName)}`)
    if (!anchor) continue

    let element = resolveBlockElement(anchor, node)
    if (!element) continue

    // Collision: the resolved block is already claimed by another node.
    // Happens when several inline graphics render into one <p> (multiple VML
    // images share a paragraph). Give each image its own rendered graphic.
    const claimedBy = element.dataset.nodeId
    if (claimedBy && claimedBy !== node.nodeId) {
      if (node.kind === 'image') {
        const graphic = pickUnclaimedGraphic(element)
        if (!graphic) continue
        element = graphic
      } else {
        continue
      }
    }

    stampNode(element, node)
    registry.bound++
  }

  // Pass 2: fallback for missing nodes — try paraId lookup
  for (const node of nodes) {
    if (container.querySelector(`[data-node-id="${node.nodeId}"]`)) continue // already bound

    let element: HTMLElement | null = null

    // Try paraId: look for a <p> with matching w14:paraId in the rendered DOM
    if (node.paraId) {
      // docx-preview may render paraId as a data attribute or id
      element = container.querySelector(`p[data-para-id="${node.paraId}"]`) as HTMLElement | null
      if (!element) {
        // Try finding by the paraId value in any attribute
        const allPs = container.querySelectorAll('p')
        for (const p of allPs) {
          if ((p as HTMLElement).dataset.paraId === node.paraId) {
            element = p as HTMLElement
            break
          }
        }
      }
    }

    // Try adjacent-node inference: if previous sibling is bound, and this is a paragraph,
    // look for the next unbound <p> after it
    if (!element && node.kind === 'paragraph') {
      const prevNode = nodes[nodes.indexOf(node) - 1]
      if (prevNode) {
        const prevEl = container.querySelector(`[data-node-id="${prevNode.nodeId}"]`)
        if (prevEl) {
          let sibling = prevEl.nextElementSibling
          while (sibling) {
            if (sibling.tagName === 'P' || sibling.tagName === 'H1' || sibling.tagName === 'H2' || sibling.tagName === 'H3') {
              if (!(sibling as HTMLElement).dataset.nodeId) {
                element = sibling as HTMLElement
                break
              }
            }
            sibling = sibling.nextElementSibling
          }
        }
      }
    }

    if (element) {
      stampNode(element, node)
      registry.bound++
    } else {
      registry.missing.push(node.nodeId)
    }
  }

  return registry
}

/** For a block holding multiple graphics, return the next graphic wrapper not yet bound. */
function pickUnclaimedGraphic(block: HTMLElement): HTMLElement | null {
  const graphics = block.querySelectorAll('svg, img')
  for (const g of graphics) {
    const wrapper = (g.closest('span, div') as HTMLElement | null) || (g as HTMLElement)
    if (!wrapper.dataset.nodeId) return wrapper
  }
  return null
}

/** Resolve the block-level element from an anchor span */
function resolveBlockElement(anchor: Element, node: TplNode): HTMLElement | null {
  if (node.kind === 'table') {
    return anchor.closest('table') as HTMLElement | null
  }
  // For paragraphs, headings, images — find the closest block
  return anchor.closest('p, h1, h2, h3') as HTMLElement | null
}

/** Stamp node metadata onto a DOM element */
function stampNode(element: HTMLElement, node: TplNode): void {
  element.dataset.nodeId = node.nodeId
  element.dataset.zone = node.zone
  element.dataset.role = node.role
  element.dataset.nodeKind = node.kind
}

/**
 * Apply CSS highlight classes to bound nodes based on active rule and selection.
 */
export function applyPreviewMarkers(
  container: HTMLElement,
  manifest: Manifest | null,
  activeRule: Rule | null,
  selectedNodeId: string
): void {
  const targetIds = new Set(activeRule?.targetNodeIds || [])
  const nodeById = Object.fromEntries((manifest?.nodes || []).map((node) => [node.nodeId, node]))

  container.querySelectorAll('[data-node-id]').forEach((el) => {
    const htmlEl = el as HTMLElement
    const nodeId = htmlEl.dataset.nodeId!
    const node = nodeById[nodeId]
    htmlEl.classList.toggle('bound-hit', targetIds.has(nodeId))
    htmlEl.classList.toggle('bound-selected', !!selectedNodeId && nodeId === selectedNodeId)
    htmlEl.classList.toggle('bound-locked', !!node && !node.acceptsGenerated)
    htmlEl.classList.toggle('bound-writable', Boolean(node?.acceptsGenerated))
  })
}

/**
 * Apply locked-page overlay masks instead of replacing DOM.
 * This preserves bookmark anchors inside locked sections.
 */
export function applyLockedPageMasks(container: HTMLElement, manifest: Manifest | null): void {
  const pages = manifest?.lockedPreview?.pages || []
  if (!pages.length) return

  const sections = container.querySelectorAll('section.docx-render')
  if (!sections.length) return

  for (const pageNo of pages) {
    const section = sections[pageNo - 1] as HTMLElement | undefined
    if (!section || section.dataset.lockedMask) continue

    section.dataset.lockedMask = String(pageNo)
    section.style.position = 'relative'

    // Create overlay mask
    const mask = document.createElement('div')
    mask.className = 'locked-page-mask'
    mask.innerHTML = `<span class="locked-page-label">锁定页 ${pageNo}</span>`
    section.appendChild(mask)
  }

  // Auto-detect TOC sections
  if (manifest?.lockedPreview?.autoSections?.includes('toc')) {
    sections.forEach((section, index) => {
      const htmlSection = section as HTMLElement
      if (htmlSection.dataset.lockedMask) return
      const compact = (htmlSection.textContent || '').replace(/\s+/g, '')
      if (compact.includes('目录') && (compact.includes('1引言') || compact.includes('参考文献') || compact.includes('致谢'))) {
        htmlSection.dataset.lockedMask = String(index + 1)
        htmlSection.style.position = 'relative'
        const mask = document.createElement('div')
        mask.className = 'locked-page-mask'
        mask.innerHTML = `<span class="locked-page-label">目录锁定页 ${index + 1}</span>`
        htmlSection.appendChild(mask)
      }
    })
  }
}

/**
 * Self-check: compare expected anchor count vs actual bound count.
 * Returns a diagnostic message if there's a mismatch.
 */
export function checkBindingHealth(registry: BindingRegistry): string | null {
  if (registry.missing.length === 0) return null
  return `${registry.missing.length}/${registry.total} 个节点未绑定（锚点缺失）`
}
