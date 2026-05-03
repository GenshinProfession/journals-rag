from pathlib import Path

from app.models.rag import Literature


def resolve_literature_text(literature: Literature, upload_root: str) -> str:
    """Load full-ish text from uploaded file when possible; fall back to DB fields."""
    if literature.file_path:
        p = Path(literature.file_path)
        if not p.is_absolute():
            p = Path(upload_root) / p
        if p.is_file():
            suffix = p.suffix.lower()
            if suffix == ".pdf":
                try:
                    from pypdf import PdfReader  # type: ignore[import-not-found]
                except ImportError as err:  # pragma: no cover
                    raise RuntimeError("pypdf is required for PDF ingestion") from err
                reader = PdfReader(str(p))
                parts: list[str] = []
                for page in reader.pages:
                    parts.append(page.extract_text() or "")
                joined = "\n".join(parts).strip()
                if joined:
                    return joined
            else:
                raw = p.read_bytes()
                try:
                    return raw.decode("utf-8").strip()
                except UnicodeDecodeError:
                    return raw.decode("utf-8", errors="ignore").strip()

    parts: list[str] = []
    if literature.title:
        parts.append(literature.title)
    if literature.abstract:
        parts.append(literature.abstract)
    return "\n\n".join(parts).strip()
