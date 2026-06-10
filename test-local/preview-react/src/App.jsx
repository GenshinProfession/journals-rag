import React from 'react'
import './App.css'
import SidebarTabs from './sidebar/SidebarTabs'
import ConfigPanel from './sidebar/ConfigPanel'
import InspectorPanel from './inspector/InspectorPanel'
import DocxPreview from './preview/DocxPreview'
import { useTemplatePreview } from './hooks/useTemplatePreview.ts'

function App() {
  const p = useTemplatePreview()

  const shellClass = `app-shell${p.leftCollapsed ? ' left-collapsed' : ''}${p.rightCollapsed ? ' right-collapsed' : ''}`

  return (
    <div className={shellClass}>
      {/* Left panel: navigation */}
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
  )
}

export default App
