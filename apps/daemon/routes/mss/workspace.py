import asyncio
import logging
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("mss.workspace")


class _MSSFileCreate(BaseModel):
    path: str           # absolute path
    content: str = ""


class _MSSFileSave(BaseModel):
    path: str
    content: str


class _MSSFileDelete(BaseModel):
    path: str


class _MSSFileRename(BaseModel):
    oldPath: str
    newPath: str


@router.post("/api/maestro-studio/file/create")
async def mss_file_create(req: _MSSFileCreate):
    try:
        p = Path(req.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        logger.info(f"MSS file created: {req.path}")
        return {"success": True, "path": req.path}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/api/maestro-studio/file/save")
async def mss_file_save(req: _MSSFileSave):
    try:
        p = Path(req.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/api/maestro-studio/file/read")
async def mss_file_read(path: str):
    try:
        content = Path(path).read_text(encoding="utf-8")
        return {"success": True, "content": content}
    except Exception as e:
        return {"success": False, "content": "", "error": str(e)}


@router.get("/api/maestro-studio/file/list")
async def mss_file_list(path: str):
    """Recursively list files/folders in workspace directory."""
    try:
        root = Path(path)
        if not root.exists():
            return {"success": True, "files": []}

        def build_tree(p: Path, depth: int = 0) -> dict:
            if depth > 8:
                return None
            if p.is_file():
                return {"path": str(p), "name": p.name, "type": "file"}
            children = []
            try:
                for child in sorted(p.iterdir()):
                    if child.name.startswith(".") or child.name == "node_modules":
                        continue
                    node = build_tree(child, depth + 1)
                    if node:
                        children.append(node)
            except PermissionError:
                pass
            return {"path": str(p), "name": p.name, "type": "directory", "children": children}

        tree = build_tree(root)
        return {"success": True, "tree": tree}
    except Exception as e:
        return {"success": False, "files": [], "error": str(e)}


@router.post("/api/maestro-studio/file/delete")
async def mss_file_delete(req: _MSSFileDelete):
    import shutil as _shutil
    try:
        p = Path(req.path)
        if p.is_dir():
            _shutil.rmtree(p)
        else:
            p.unlink()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/api/maestro-studio/file/rename")
async def mss_file_rename(req: _MSSFileRename):
    try:
        Path(req.oldPath).rename(req.newPath)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/api/maestro-studio/pick-directory")
async def pick_directory():
    """Open the OS native folder picker and return the selected path.

    macOS: uses AppleScript `choose folder`.
    Returns {"path": "/absolute/path"} or {"path": null} if cancelled.
    """
    import shutil
    try:
        # macOS — AppleScript native folder dialog
        if shutil.which("osascript"):
            result = subprocess.run(
                ["osascript", "-e",
                 'POSIX path of (choose folder with prompt "Selecione o workspace do Maestro")'],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                path = result.stdout.strip().rstrip("/")
                return {"path": path}
            return {"path": None}  # user cancelled

        # Linux fallback — zenity
        if shutil.which("zenity"):
            result = subprocess.run(
                ["zenity", "--file-selection", "--directory",
                 "--title=Selecione o workspace do Maestro"],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                return {"path": result.stdout.strip()}
            return {"path": None}

        raise HTTPException(status_code=501, detail="No native dialog available on this OS")
    except asyncio.TimeoutError:
        return {"path": None, "error": "timeout"}
