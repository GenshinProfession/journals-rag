import type { Manifest, Rule, TplNode } from '../../types/templatePreview'

interface BindingRegistry {
  bound: number
  missing: string[]
}

/**
 * Bind manifest nodes to rendered DOM elements using bookmark anchors.
 * docx-preview renders Word bookmarks as <span id="bookmarkName">.
 */
export function bindPreviewNodes(container: HTMLElement, manifest: Manifest | null): BindingRegistry {
  const nodes = manifest?.nodes || []

  // Clear existing bindings
  container.querySelectorAll('[data-node-id]').forEach((el) => {
    delete (el as HTMLElement).dataset.nodeId
    delete (el as HTMLElement).dataset.zone
    delete (el as HTMLElement).dataset.role
  })

  const registry: BindingRegistry = { bound: 0, missing: [] }

  for (const node of nodes) {
    const anchorName = node.previewAnchor
    if (!anchorName) {
      registry.missing.push(node.nodeId)
      continue
    }

    const anchor = container.querySelector(`#${CSS.escape(anchorName)}`)
    if (!anchor) {
      registry.missing.push(node.nodeId)
      continue
    }

    let element: HTMLElement | null = null
    if (node.kind === 'table') {
      element = anchor.closest('table')
    } else {
      element = anchor.closest('p, h1, h2, h3')
    }

    if (element) {
      element.dataset.nodeId = node.nodeId
      element.dataset.zone = node.zone
      element.dataset.role = node.role
      registry.bound++
    } else {
      registry.missing.push(node.nodeId)
    }
  }

  return registry
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
    const node = nodeById[htmlEl.dataset.nodeId!]
    htmlEl.classList.toggle('bound-hit', targetIds.has(htmlEl.dataset.nodeId!))
    htmlEl.classList.toggle('bound-selected', !!selectedNodeId && htmlEl.dataset.nodeId === selectedNodeId)
    htmlEl.classList.toggle('bound-locked', !!node && !node.acceptsGenerated)
    htmlEl.classList.toggle('bound-writable', Boolean(node?.acceptsGenerated))
  })
}
