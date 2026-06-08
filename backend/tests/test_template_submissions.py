"""Tests for template submission system."""

import json
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.main import create_app
from app.models.template_submission import TemplateSubmission
from app.services.template_submission_service import (
    _parse_json_object,
    get_template_completeness,
)


# ── Route Registration Tests ─────────────────────────────────────────────


def test_template_submission_routes_registered() -> None:
    """Verify all template submission routes are registered."""
    app = create_app()
    routes = {getattr(route, "path", "") for route in app.routes}

    # Writer endpoints
    assert "/api/template-submissions" in routes
    assert "/api/template-submissions/mine" in routes
    assert "/api/template-submissions/{submission_id}" in routes

    # Admin endpoints
    assert "/api/admin/template-submissions" in routes
    assert "/api/admin/template-submissions/{submission_id}" in routes
    assert "/api/admin/template-submissions/{submission_id}/approve" in routes
    assert "/api/admin/template-submissions/{submission_id}/reject" in routes


def test_school_completeness_route_registered() -> None:
    """Verify the school template completeness route is registered."""
    app = create_app()
    routes = {getattr(route, "path", "") for route in app.routes}
    assert "/api/school-templates/{group_id}/completeness" in routes or "/api/school-templates/school-templates/{group_id}/completeness" in routes


# ── Model Tests ──────────────────────────────────────────────────────────


def test_template_submission_model_fields() -> None:
    """Verify TemplateSubmission model has all required fields."""
    fields = [c.name for c in TemplateSubmission.__table__.columns]

    required_fields = [
        "id",
        "user_id",
        "school_name",
        "degree_level",
        "discipline",
        "file_path",
        "file_name",
        "citation_style",
        "notes",
        "status",
        "parsed_structure",
        "parsed_format_rules",
        "parsed_citation_rules",
        "parsed_citation_text",
        "reviewer_id",
        "review_notes",
        "token_reward",
        "school_template_group_id",
        "created_at",
        "updated_at",
    ]

    for field in required_fields:
        assert field in fields, f"Missing field: {field}"


def test_template_submission_default_status() -> None:
    """Verify default status is 'pending'."""
    col = TemplateSubmission.__table__.columns["status"]
    assert col.default.arg == "pending"


# ── Service Tests ────────────────────────────────────────────────────────


def test_parse_json_object_valid() -> None:
    """Test parsing valid JSON object."""
    data = {"key": "value", "nested": {"a": 1}}
    result = _parse_json_object(json.dumps(data))
    assert result == data


def test_parse_json_object_with_markdown() -> None:
    """Test parsing JSON wrapped in markdown code block."""
    data = {"key": "value"}
    raw = f"```json\n{json.dumps(data)}\n```"
    result = _parse_json_object(raw)
    assert result == data


def test_parse_json_object_empty() -> None:
    """Test parsing empty string."""
    assert _parse_json_object("") == {}
    assert _parse_json_object(None) == {}


def test_parse_json_object_invalid() -> None:
    """Test parsing invalid JSON."""
    assert _parse_json_object("not json") == {}
    assert _parse_json_object("{invalid}") == {}


def test_parse_json_object_non_dict() -> None:
    """Test parsing JSON array (should return empty dict)."""
    assert _parse_json_object("[1, 2, 3]") == {}


def test_get_template_completeness_no_group() -> None:
    """Test completeness check with no group ID."""
    db = MagicMock()
    result = get_template_completeness(db, None)

    assert result["has_group"] is False
    assert result["structure"] is False
    assert result["format_rules"] is False
    assert result["citation_rules"] is False


def test_get_template_completeness_group_not_found() -> None:
    """Test completeness check with non-existent group."""
    db = MagicMock()
    db.get.return_value = None

    result = get_template_completeness(db, uuid4())

    assert result["has_group"] is False
    assert result["structure"] is False


def test_get_template_completeness_full_config() -> None:
    """Test completeness check with fully configured group."""
    db = MagicMock()

    # Mock group with all configurations
    group = MagicMock()
    group.structure = MagicMock()
    group.structure.structure_json = {"sections": [{"type": "intro"}, {"type": "body"}]}
    group.format_rules = MagicMock()
    group.format_rules.rules_json = {"fonts": {"title": {}, "body": {}}}
    group.citation_rules = MagicMock()
    group.citation_rules.citation_json = {"citationType": "GB/T 7714"}

    db.get.return_value = group

    result = get_template_completeness(db, uuid4())

    assert result["has_group"] is True
    assert result["structure"] is True
    assert result["format_rules"] is True
    assert result["citation_rules"] is True
    assert "2 个章节" in result["structure_detail"]
    assert "2 种字体规则" in result["format_detail"]
    assert "GB/T 7714" in result["citation_detail"]


def test_get_template_completeness_partial_config() -> None:
    """Test completeness check with partial configuration."""
    db = MagicMock()

    group = MagicMock()
    group.structure = MagicMock()
    group.structure.structure_json = {"sections": []}
    group.format_rules = None
    group.citation_rules = None

    db.get.return_value = group

    result = get_template_completeness(db, uuid4())

    assert result["has_group"] is True
    assert result["structure"] is True
    assert result["format_rules"] is False
    assert result["citation_rules"] is False


# ── Schema Tests ─────────────────────────────────────────────────────────


def test_template_submission_schema_imports() -> None:
    """Verify schema module imports correctly."""
    from app.schemas.template_submission import (
        TemplateSubmissionCreate,
        TemplateSubmissionResponse,
    )

    # Check response schema has required fields
    fields = TemplateSubmissionResponse.model_fields
    assert "id" in fields
    assert "school_name" in fields
    assert "degree_level" in fields
    assert "status" in fields


# ── Integration Test Runner ──────────────────────────────────────────────


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
