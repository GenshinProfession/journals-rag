"""
Template binding API — FastAPI router wrapping the DOCX binding logic.

Provides endpoints for loading templates, manipulating nodes, images, tables,
and applying formatting rules to DOCX documents.
"""

import json
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

# Add test-local to path so we can import the binding logic
_BINDING_DIR = Path(__file__).resolve().parent.parent.parent.parent / "test-local"
if str(_BINDING_DIR) not in sys.path:
    sys.path.insert(0, str(_BINDING_DIR))

from binding_case_api import (
    CASE_DIR,
    create_case,
    add_generated_node,
    replace_node_content,
    delete_node,
    update_node_role,
    insert_image,
    replace_image,
    insert_table,
    update_table,
    apply_rule,
    apply_config_to_case,
    batch_operations,
    _document_xml,
    _write_document_xml,
    _materialize_heading_numbers,
    _materialize_reference_numbers,
)

import time

router = APIRouter(tags=["template-binding"])


# ─── Request models ───

class LoadRequest(BaseModel):
    pass

class InsertTextRequest(BaseModel):
    text: str
    zone: str = "body"
    role: str = "paragraph"
    mode: str = "append"
    anchorNodeId: str = ""
    customFormat: Optional[dict] = None

class ReplaceTextRequest(BaseModel):
    text: str
    formatRuleId: Optional[str] = None
    formatOverride: Optional[dict] = None
    preserveFormat: bool = True

class UpdateNodeRoleRequest(BaseModel):
    zone: str
    role: str

class InsertTableRequest(BaseModel):
    rows: int = 3
    cols: int = 3
    anchorNodeId: str = ""
    cellTexts: list[str] = []
    mode: str = "insertAfter"

class UpdateTableRequest(BaseModel):
    rows: int
    cols: int
    cellTexts: list[str] = []

class ApplyRuleRequest(BaseModel):
    format: dict

class BatchRequest(BaseModel):
    operations: list[dict]


# ─── Endpoints ───

@router.post("/load")
def load_template():
    """Load (or reload) the default test template and return its manifest."""
    try:
        manifest = create_case()
        return manifest
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{case_id}/file")
def get_docx_file(case_id: str, v: int = Query(default=0)):
    """Return the working DOCX file for preview."""
    path = CASE_DIR / case_id / "work.docx"
    if not path.exists():
        raise HTTPException(status_code=404, detail="case not found")
    data = path.read_bytes()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.post("/{case_id}/node")
def insert_node(case_id: str, req: InsertTextRequest):
    """Insert a new text node (append/insertAfter/insertBefore/replace)."""
    try:
        manifest = add_generated_node(
            case_id, req.text, req.zone, req.role,
            req.mode, req.anchorNodeId, req.customFormat,
        )
        return manifest
    except (KeyError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{case_id}/node/{node_id}/content")
def replace_text(case_id: str, node_id: str, req: ReplaceTextRequest):
    """Replace the text content of an existing node."""
    try:
        result = replace_node_content(
            case_id, node_id, req.text,
            req.formatRuleId, req.formatOverride, req.preserveFormat,
        )
        return result
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{case_id}/node/{node_id}")
def update_role(case_id: str, node_id: str, req: UpdateNodeRoleRequest):
    """Update a node's zone/role."""
    try:
        manifest = update_node_role(case_id, node_id, req.zone, req.role)
        return manifest
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{case_id}/node/{node_id}")
def remove_node(case_id: str, node_id: str):
    """Delete a node from the document."""
    try:
        manifest = delete_node(case_id, node_id)
        return manifest
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{case_id}/image")
async def insert_img(case_id: str, file: UploadFile = File(...), anchor: str = "", width: int = 400, mode: str = "insertAfter"):
    """Insert an image into the document."""
    body = await file.read()
    filename = file.filename or "image.png"
    try:
        manifest = insert_image(case_id, body, filename, anchor, width, mode)
        return manifest
    except (KeyError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{case_id}/image/{node_id}")
async def replace_img(case_id: str, node_id: str, file: UploadFile = File(...), width: int = 400):
    """Replace an existing image in-place."""
    body = await file.read()
    filename = file.filename or "image.png"
    try:
        manifest = replace_image(case_id, node_id, body, filename, width)
        return manifest
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{case_id}/table")
def insert_tbl(case_id: str, req: InsertTableRequest):
    """Insert a new table."""
    try:
        manifest = insert_table(case_id, req.rows, req.cols, req.anchorNodeId, req.cellTexts, req.mode)
        return manifest
    except (KeyError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{case_id}/table/{node_id}")
def update_tbl(case_id: str, node_id: str, req: UpdateTableRequest):
    """Update an existing table's dimensions and content."""
    try:
        manifest = update_table(case_id, node_id, req.rows, req.cols, req.cellTexts)
        return manifest
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{case_id}/rule/{rule_id}")
def apply_fmt_rule(case_id: str, rule_id: str, req: ApplyRuleRequest):
    """Apply a formatting rule to all matching nodes."""
    try:
        manifest = apply_rule(case_id, rule_id, req.format)
        return manifest
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{case_id}/batch")
def batch_ops(case_id: str, req: BatchRequest):
    """Execute multiple operations in a single DOCX write cycle."""
    try:
        result = batch_operations(case_id, req.operations)
        return result
    except (KeyError, ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{case_id}/compile")
def compile_docx(case_id: str):
    """Re-compile the DOCX from the current manifest."""
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="case not found")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = _document_xml(work_docx)
    _materialize_heading_numbers(root, manifest)
    _materialize_reference_numbers(root, manifest)
    _write_document_xml(work_docx, root, manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "compiled", "version": manifest["version"]}


@router.post("/{case_id}/config")
def save_config(case_id: str, config: dict):
    """Save config and update DOCX."""
    try:
        manifest = apply_config_to_case(case_id, config)
        return manifest
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
def get_config():
    """Load the paper structure config."""
    from binding_case_api import _load_paper_config
    return _load_paper_config()


@router.post("/{case_id}/generate-config")
def gen_config(case_id: str):
    """Generate config from case analysis."""
    from binding_case_api import generate_config_from_case
    try:
        config = generate_config_from_case(case_id)
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


