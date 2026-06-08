from fastapi import APIRouter

from app.api import (
    admin_billing,
    admin_models,
    admin_overview,
    admin_schools,
    admin_template_submissions,
    admin_universities,
    admin_users,
    auth,
    jobs,
    literature,
    models,
    projects,
    rag,
    schools,
    template_submissions,
    wallet,
)

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(admin_overview.router, prefix="/admin/overview", tags=["admin-overview"])
router.include_router(admin_users.router, prefix="/admin/users", tags=["admin-users"])
router.include_router(admin_billing.router, prefix="/admin/billing", tags=["admin-billing"])
router.include_router(admin_models.router, prefix="/admin/models", tags=["admin-models"])
router.include_router(admin_schools.router, prefix="/admin/schools", tags=["admin-schools"])
router.include_router(admin_universities.router, prefix="/admin/universities", tags=["admin-universities"])
router.include_router(admin_template_submissions.router, prefix="/admin/template-submissions", tags=["admin-template-submissions"])
router.include_router(wallet.router, prefix="/wallet", tags=["wallet"])
router.include_router(models.router, prefix="/models", tags=["models"])
router.include_router(schools.router, prefix="/school-templates", tags=["school-templates"])
router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
router.include_router(projects.router, prefix="/projects", tags=["projects"])
router.include_router(literature.router, prefix="/projects/{project_id}/literature", tags=["literature"])
router.include_router(rag.router, prefix="/projects/{project_id}/rag", tags=["rag"])
router.include_router(template_submissions.router, prefix="/template-submissions", tags=["template-submissions"])
