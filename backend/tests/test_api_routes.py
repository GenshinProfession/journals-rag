from app.main import create_app


def test_core_api_routes_are_registered() -> None:
    app = create_app()
    routes = {getattr(route, "path", "") for route in app.routes}

    assert "/health" in routes
    assert "/api/auth/login" in routes
    assert "/api/admin/overview" in routes
    assert "/api/admin/users" in routes
    assert "/api/admin/billing/wallets" in routes
    assert "/api/admin/billing/gateway-balance" in routes
    assert "/api/admin/billing/usage/reconcile" in routes
    assert "/api/admin/models" in routes
    assert "/api/admin/schools/schools" in routes
    assert "/api/school-templates/schools" in routes
    assert "/api/projects" in routes
    assert "/api/projects/{project_id}/reference/review" in routes
    assert "/api/projects/{project_id}/rag/search" in routes
    assert "/api/template-submissions" in routes
    assert "/api/admin/template-submissions" in routes
