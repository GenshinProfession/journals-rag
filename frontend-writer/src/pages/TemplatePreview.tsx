import { useTemplatePreview } from '../hooks/useTemplatePreview'
import SidebarTabs from '../components/templatePreview/SidebarTabs'
import ConfigPanel from '../components/templatePreview/ConfigPanel'
import DocxPreview from '../components/templatePreview/DocxPreview'
import InspectorPanel from '../components/templatePreview/InspectorPanel'

export function TemplatePreview() {
  const p = useTemplatePreview()

  const shellClass = `app-shell${p.leftCollapsed ? ' left-collapsed' : ''}${p.rightCollapsed ? ' right-collapsed' : ''}`

  return (
    <>
      <style>{templatePreviewStyles}</style>
      <div className={shellClass}>
        {/* Left panel */}
        <aside className={`left-panel${p.leftCollapsed ? ' collapsed' : ''}`}>
          <header className="left-header">
            <div className="left-header-top">
              <h1>文档编辑</h1>
              <button className="btn-icon btn-collapse" onClick={() => p.setLeftCollapsed(true)} title="收起侧栏">◀</button>
            </div>
            <div className="left-header-actions">
              <button className={`left-tab ${p.leftPanel === 'nav' ? 'active' : ''}`} onClick={() => p.setLeftPanel('nav')}>大纲</button>
              <button className={`left-tab ${p.leftPanel === 'config' ? 'active' : ''}`} onClick={() => p.setLeftPanel('config')}>规范</button>
            </div>
          </header>
          {p.leftPanel === 'nav' ? (
            <SidebarTabs manifest={p.manifest} selectedNodeId={p.selectedNodeId} pickNode={p.pickNode} />
          ) : (
            <ConfigPanel manifest={p.manifest} setManifest={p.setManifest} loadDocx={p.loadDocx} setStatus={p.setStatus} />
          )}
        </aside>

        {/* Center: document preview */}
        <main className="preview-pane">
          <div className="topbar">
            <div className="topbar-info">
              {p.leftCollapsed && (
                <button className="btn-icon" onClick={() => p.setLeftCollapsed(false)} title="展开大纲">▶</button>
              )}
              <strong>{p.manifest?.source || '测试模板'}</strong>
              <span className="topbar-status">{p.status}</span>
            </div>
            <div className="topbar-tools">
              <button className="btn-icon" onClick={() => p.setZoom(z => Math.max(0.35, z - 0.1))}>−</button>
              <span className="zoom-label">{Math.round(p.zoom * 100)}%</span>
              <button className="btn-icon" onClick={() => p.setZoom(z => Math.min(1.4, z + 0.1))}>+</button>
              <button className="btn-secondary btn-sm" onClick={p.fitWidth} title="适合宽度">适合</button>
              <button className="btn-secondary btn-sm" onClick={() => p.loadCase()}>重载</button>
              {p.rightCollapsed && (
                <button className="btn-icon" onClick={() => p.setRightCollapsed(false)} title="展开属性栏">◀</button>
              )}
            </div>
          </div>
          <DocxPreview
            blob={p.docxBlob}
            version={p.manifest?.version}
            zoom={p.zoom}
            manifest={p.manifest}
            activeRule={p.activeRule}
            selectedNodeId={p.selectedNodeId}
            selectedNode={p.selectedNode}
            previewRef={p.previewRef}
            restoreScrollTopRef={p.restoreScrollTopRef}
            formatTypes={p.formatTypes}
            selectedFormatId={p.selectedFormatId}
            onPickNode={p.pickNode}
            onInlineInsert={p.inlineInsertAfterSelected}
            inserting={p.nodeBusy}
            citationRegistry={p.manifest?.citationRegistry}
            setSelectedNodeId={p.setSelectedNodeId}
            onStartImageInsert={() => p.setInsertMode('image')}
            onStartTableInsert={() => p.setInsertMode('table')}
          />
        </main>

        {/* Right panel: inspector */}
        <InspectorPanel
          node={p.selectedNode}
          formatTypes={p.formatTypes}
          selectedFormatId={p.selectedFormatId}
          selectedRule={p.activeRule}
          manifest={p.manifest}
          onSave={p.saveCurrentNode}
          onDelete={p.deleteCurrentNode}
          onUpdateTable={p.updateTable}
          onInsertImage={p.insertImage}
          onInsertTable={p.insertTable}
          onRoleChange={p.changeNodeRole}
          onInsertModeChange={(mode) => p.setInsertMode(mode || 'image')}
          insertMode={p.insertMode}
          setInsertMode={p.setInsertMode}
          loading={p.nodeBusy}
          citationRegistry={p.manifest?.citationRegistry}
          onCollapse={() => p.setRightCollapsed(true)}
          collapsed={p.rightCollapsed}
        />
      </div>
    </>
  )
}

const templatePreviewStyles = `
.app-shell {
  display: grid;
  grid-template-columns: 240px minmax(600px, 1fr) 320px;
  height: calc(100vh - 64px);
  overflow: hidden;
  background: #F5F6F8;
  font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #18212F;
}
.app-shell.left-collapsed { grid-template-columns: 0px minmax(600px, 1fr) 320px; }
.app-shell.right-collapsed { grid-template-columns: 240px minmax(600px, 1fr) 0px; }
.app-shell.left-collapsed.right-collapsed { grid-template-columns: 0px minmax(600px, 1fr) 0px; }

/* Left panel */
.left-panel { display: flex; flex-direction: column; background: #fff; border-right: 1px solid #E6E8EC; overflow: hidden; }
.left-panel.collapsed { overflow: hidden; border-right: none; }
.left-header { padding: 12px 14px; border-bottom: 1px solid #E6E8EC; flex-shrink: 0; }
.left-header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.left-header h1 { font-size: 14px; font-weight: 600; color: #18212F; }
.left-header-actions { display: flex; gap: 2px; background: #F9FAFB; border-radius: 6px; padding: 2px; }
.left-tab { flex: 1; padding: 5px 8px; border: none; background: transparent; border-radius: 4px; font-size: 12px; font-weight: 500; color: #667085; cursor: pointer; }
.left-tab.active { background: #fff; color: #18212F; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.btn-collapse { width: 20px; height: 20px; font-size: 10px; opacity: 0.4; border: none; background: none; cursor: pointer; }
.btn-collapse:hover { opacity: 1; }

/* Preview pane */
.preview-pane { display: flex; flex-direction: column; overflow: hidden; background: #F5F6F8; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #fff; border-bottom: 1px solid #E6E8EC; flex-shrink: 0; min-height: 44px; }
.topbar-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
.topbar-info strong { font-size: 13px; font-weight: 600; white-space: nowrap; }
.topbar-status { font-size: 12px; color: #667085; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topbar-tools { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.zoom-label { font-size: 11px; color: #667085; min-width: 36px; text-align: center; }

/* Buttons */
.btn-icon { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: #667085; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.btn-icon:hover { background: #F9FAFB; color: #18212F; }
.btn-primary { height: 36px; padding: 0 16px; border: none; border-radius: 6px; background: #2563EB; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.btn-primary:hover:not(:disabled) { background: #1D4ED8; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { height: 36px; padding: 0 16px; border: 1px solid #E6E8EC; border-radius: 6px; background: #fff; color: #18212F; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.btn-secondary:hover:not(:disabled) { background: #F9FAFB; }
.btn-danger { height: 36px; padding: 0 16px; border: 1px solid #DC2626; border-radius: 6px; background: #FEF2F2; color: #DC2626; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; }
.btn-sm { height: 28px; padding: 0 10px; font-size: 12px; }

/* Navigation */
.nav-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.nav-search { padding: 8px 14px; border-bottom: 1px solid #E6E8EC; flex-shrink: 0; }
.nav-search input { width: 100%; padding: 6px 10px; border: 1px solid #E6E8EC; border-radius: 6px; font-size: 12px; background: #F9FAFB; color: #18212F; outline: none; }
.nav-search input:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.08); }
.nav-tree { flex: 1; overflow-y: auto; padding: 6px 0; }
.nav-section-label { display: flex; align-items: center; gap: 4px; padding: 5px 14px; font-size: 11px; font-weight: 600; color: #667085; text-transform: uppercase; cursor: pointer; user-select: none; }
.nav-chevron { font-size: 10px; width: 12px; flex-shrink: 0; }
.nav-item { display: flex; align-items: center; padding: 4px 14px; cursor: pointer; min-height: 28px; position: relative; }
.nav-item:hover { background: #F9FAFB; }
.nav-item.selected { background: #EFF6FF; color: #2563EB; }
.nav-item.selected::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #2563EB; border-radius: 0 2px 2px 0; }
.nav-node-text { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-level-heading1 .nav-node-text { font-weight: 600; font-size: 13px; }
.nav-level-heading2 .nav-node-text { font-weight: 500; }
.nav-level-heading3 .nav-node-text { color: #667085; }
.nav-empty { padding: 20px 14px; text-align: center; color: #667085; font-size: 12px; }

/* Config panel */
.config-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.config-actions { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid #E6E8EC; flex-shrink: 0; }
.config-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.config-section-header { display: flex; align-items: center; gap: 4px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: #18212F; cursor: pointer; }
.config-section-header:hover { background: #F9FAFB; }
.config-item-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 14px 4px 28px; font-size: 12px; min-height: 28px; }
.config-item-label { color: #18212F; flex-shrink: 0; margin-right: 8px; }
.config-item-summary { color: #667085; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }

/* Inspector */
.inspector { display: flex; flex-direction: column; background: #fff; border-left: 1px solid #E6E8EC; overflow: hidden; }
.inspector.collapsed { overflow: hidden; border-left: none; }
.inspector-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #E6E8EC; flex-shrink: 0; }
.inspector-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.inspector-node-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.inspector-node-id { font-size: 12px; font-weight: 600; color: #2563EB; font-family: Consolas, monospace; }
.inspector-node-role { font-size: 12px; color: #667085; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge-writable { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; background: #ECFDF5; color: #15803D; }
.badge-locked { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; background: #FFFBEB; color: #D97706; }
.inspector-text-preview { padding: 10px 16px; font-size: 13px; color: #475467; line-height: 1.6; border-bottom: 1px solid #E6E8EC; max-height: 80px; overflow: hidden; flex-shrink: 0; }
.inspector-tabs { display: flex; border-bottom: 1px solid #E6E8EC; flex-shrink: 0; }
.inspector-tabs button { flex: 1; padding: 8px 12px; border: none; background: none; font-size: 12px; font-weight: 500; color: #667085; cursor: pointer; border-bottom: 2px solid transparent; }
.inspector-tabs button.active { color: #2563EB; border-bottom-color: #2563EB; }
.inspector-tab-body { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
.inspector-field { display: flex; flex-direction: column; gap: 4px; }
.inspector-field label { font-size: 11px; font-weight: 600; color: #667085; text-transform: uppercase; }
.inspector-field select, .inspector-field input[type="number"] { height: 36px; padding: 0 10px; border: 1px solid #E6E8EC; border-radius: 6px; font-size: 13px; background: #F9FAFB; color: #18212F; outline: none; }
.inspector-field select:focus, .inspector-field input:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.08); }
.inspector-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.inspector-textarea { width: 100%; padding: 10px; border: 1px solid #E6E8EC; border-radius: 6px; font-size: 13px; background: #F9FAFB; color: #18212F; resize: vertical; outline: none; line-height: 1.6; min-height: 120px; }
.inspector-textarea:focus { border-color: #2563EB; }
.inspector-actions { display: flex; gap: 8px; padding-top: 4px; }
.inspector-hint { font-size: 12px; color: #667085; }
.inspector-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #667085; }
.inspector-empty-icon { font-size: 32px; opacity: 0.5; }
.inspector-locked-note { padding: 12px; background: #FFFBEB; border-radius: 6px; border-left: 3px solid #D97706; }
.inspector-locked-note strong { display: block; font-size: 13px; color: #D97706; margin-bottom: 4px; }
.inspector-locked-note p { font-size: 12px; color: #475467; margin: 0; }
.format-detail-grid { display: flex; flex-direction: column; gap: 1px; background: #E6E8EC; border-radius: 6px; overflow: hidden; }
.format-detail-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #fff; font-size: 12px; }
.format-detail-row span { color: #667085; flex-shrink: 0; }
.format-detail-row strong { color: #18212F; font-weight: 500; text-align: right; }
.format-detail-row code { font-size: 11px; font-family: Consolas, monospace; color: #475467; background: #F9FAFB; padding: 1px 4px; border-radius: 3px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inspector-tech-info summary { font-size: 11px; color: #667085; cursor: pointer; padding: 4px 0; }
.image-preview-box { border: 1px solid #E6E8EC; border-radius: 6px; overflow: hidden; max-height: 160px; display: flex; align-items: center; justify-content: center; background: #F9FAFB; }
.image-preview-box img { max-width: 100%; max-height: 150px; object-fit: contain; }
.table-editor-compact { overflow: auto; max-height: 200px; border: 1px solid #E6E8EC; border-radius: 6px; }
.table-editor-compact table { width: 100%; border-collapse: collapse; }
.table-editor-compact td { padding: 0; border: 1px solid #E6E8EC; }
.table-editor-compact input { width: 100%; border: none; padding: 4px 6px; font-size: 11px; background: transparent; color: #18212F; outline: none; }
.table-editor-compact input:focus { background: #EFF6FF; }
.stepper { display: flex; align-items: center; border: 1px solid #E6E8EC; border-radius: 6px; overflow: hidden; height: 36px; }
.stepper button { width: 32px; height: 100%; border: none; background: #F9FAFB; color: #475467; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.stepper button:hover { background: #E6E8EC; }
.stepper span { flex: 1; text-align: center; font-size: 13px; font-weight: 500; }
.inspector-action-list { display: flex; flex-direction: column; gap: 6px; }
.inspector-danger-zone { margin-top: auto; padding-top: 12px; border-top: 1px solid #E6E8EC; }
.inspector-image-section, .inspector-table-section { display: flex; flex-direction: column; gap: 10px; }

/* Docx preview */
.docx-preview-frame { flex: 1; position: relative; overflow: hidden; }
.docx-preview { width: 100%; height: 100%; overflow: auto; background: #F5F6F8; }
.docx-preview .docx-render { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.insert-gutter-btn { position: absolute; left: 4px; width: 28px; height: 28px; border-radius: 50%; border: 1.5px solid #E6E8EC; background: #fff; color: #667085; font-size: 16px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.5; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.insert-gutter-btn:hover { opacity: 1; border-color: #2563EB; color: #2563EB; background: #EFF6FF; }
.insert-menu { position: absolute; left: 40px; width: 220px; background: #fff; border: 1px solid #E6E8EC; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 20; padding: 6px 0; }
.insert-menu-title { display: flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 11px; font-weight: 600; color: #667085; text-transform: uppercase; }
.insert-menu-back { border: none; background: none; color: #667085; cursor: pointer; font-size: 14px; padding: 0 2px; }
.insert-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 12px; border: none; background: none; font-size: 13px; color: #18212F; cursor: pointer; text-align: left; }
.insert-menu-item:hover { background: #F9FAFB; }
.insert-menu-icon { width: 18px; text-align: center; font-size: 14px; }
.insert-menu-format { font-size: 12px; color: #475467; }
.insert-menu-divider { height: 1px; background: #E6E8EC; margin: 4px 0; }
.insert-menu-select { width: calc(100% - 24px); margin: 0 12px 6px; padding: 4px 8px; border: 1px solid #E6E8EC; border-radius: 6px; font-size: 12px; background: #F9FAFB; height: 30px; }
.insert-menu-textarea { width: calc(100% - 24px); margin: 0 12px 6px; padding: 6px 8px; border: 1px solid #E6E8EC; border-radius: 6px; font-size: 12px; background: #F9FAFB; resize: vertical; outline: none; }
.insert-menu-textarea:focus { border-color: #2563EB; }
.insert-menu-actions { display: flex; justify-content: flex-end; gap: 6px; padding: 6px 12px; border-top: 1px solid #E6E8EC; }
.bound-writable { cursor: pointer; }
.bound-writable:hover { outline: 1px solid rgba(37,99,235,0.3); outline-offset: 2px; }
.bound-selected { outline: 2px solid #2563EB; outline-offset: 2px; background: rgba(37,99,235,0.04); }
.bound-hit { outline: 1px dashed rgba(37,99,235,0.25); outline-offset: 1px; }
.bound-locked { cursor: default; }
.locked-page-mask { position: absolute; inset: 0; background: rgba(255,255,255,0.55); backdrop-filter: blur(1px); z-index: 5; display: flex; align-items: flex-start; justify-content: flex-end; padding: 8px; pointer-events: none; }
.locked-page-label { background: rgba(0,0,0,0.55); color: #fff; font-size: 11px; padding: 3px 10px; border-radius: 4px; pointer-events: none; }
.binding-warning { position: absolute; bottom: 12px; right: 12px; background: #FFFBEB; color: #D97706; font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(217,119,6,0.2); z-index: 10; cursor: help; }

/* Responsive */
@media (max-width: 1200px) {
  .app-shell { grid-template-columns: 200px minmax(0, 1fr) 280px; }
}
`
