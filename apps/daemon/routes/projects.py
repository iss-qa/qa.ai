import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, Response, UploadFile

from android.element_scanner import load_element_map

router = APIRouter()
logger = logging.getLogger("projects")

# Path relative to this file: routes/ → daemon/ → data/visual_refs
_VISUAL_REFS_BASE = Path(__file__).parent.parent / "data" / "visual_refs"


@router.post("/api/projects/{project_id}/reference-screenshots")
async def upload_reference_screenshots(
    project_id: str,
    files: List[UploadFile] = File(...)
):
    """Upload reference screenshots for a project, persisted to disk."""
    save_dir = _VISUAL_REFS_BASE / project_id
    save_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for upload in files:
        safe_name = Path(upload.filename or "ref.jpg").name.replace("..", "_")
        dest = save_dir / safe_name
        if dest.exists():
            stem, suf = dest.stem, dest.suffix
            import time as _time
            dest = save_dir / f"{stem}-{int(_time.time() * 1000)}{suf}"
        data = await upload.read()
        dest.write_bytes(data)
        saved.append(dest.name)

    return {"saved": saved}


@router.get("/api/projects/{project_id}/reference-screenshots")
async def list_reference_screenshots(project_id: str):
    """List reference screenshots for a project."""
    save_dir = _VISUAL_REFS_BASE / project_id
    if not save_dir.exists():
        return {"images": []}
    images = []
    for f in sorted(save_dir.iterdir()):
        if f.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            images.append({
                "filename": f.name,
                "url": f"/api/projects/{project_id}/reference-screenshots/{f.name}",
            })
    return {"images": images}


@router.delete("/api/projects/{project_id}/reference-screenshots/{filename}")
async def delete_reference_screenshot(project_id: str, filename: str):
    """Delete a reference screenshot."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    save_dir = _VISUAL_REFS_BASE / project_id
    file_path = save_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_path.resolve().relative_to(save_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    file_path.unlink()
    return {"status": "deleted"}


@router.get("/api/projects/{project_id}/reference-screenshots/{filename}")
async def serve_reference_screenshot(project_id: str, filename: str):
    """Serve a reference screenshot file."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    save_dir = _VISUAL_REFS_BASE / project_id
    file_path = save_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_path.resolve().relative_to(save_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    mt = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return Response(
        content=file_path.read_bytes(),
        media_type=mt.get(file_path.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/api/projects/{project_id}/element-map")
async def get_element_map(project_id: str):
    """Get the saved element map for a project."""
    element_map = load_element_map(project_id)
    if not element_map:
        raise HTTPException(status_code=404, detail="Element map not found. Run 'Ler Aplicacao' first.")
    return element_map
