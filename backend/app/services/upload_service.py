import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings


def ensure_upload_allowed(file: UploadFile, size: int | None) -> None:
    if not settings.ALLOW_ZIP_UPLOAD:
        raise HTTPException(status_code=403, detail="ZIP upload is disabled")
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    if size and size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")


def extract_zip_upload(file: UploadFile) -> tuple[Path, dict]:
    ensure_upload_allowed(file, None)
    upload_root = Path(settings.UPLOAD_TEMP_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="analysis-", dir=upload_root))
    zip_path = temp_dir / "source.zip"
    total = 0
    with zip_path.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            total += len(chunk)
            if total > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                shutil.rmtree(temp_dir, ignore_errors=True)
                raise HTTPException(status_code=413, detail="File too large")
            out.write(chunk)
    try:
        with zipfile.ZipFile(zip_path) as archive:
            members = archive.infolist()
            if not members:
                raise HTTPException(status_code=400, detail="Invalid ZIP file")
            total_uncompressed = 0
            for member in members:
                _validate_zip_member(member)
                total_uncompressed += member.file_size
                if total_uncompressed > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Uncompressed ZIP payload is too large")
            extract_dir = temp_dir / "extracted"
            extract_dir.mkdir()
            extract_root = extract_dir.resolve()
            for member in members:
                if member.is_dir():
                    continue
                target = (extract_dir / member.filename).resolve()
                try:
                    target.relative_to(extract_root)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail="ZIP path traversal is not allowed") from exc
                if target.exists() and target.is_symlink():
                    raise HTTPException(status_code=400, detail="ZIP path traversal is not allowed")
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, target.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
            return extract_dir, {"file_count": len([m for m in members if not m.is_dir()]), "total_size": total}
    except zipfile.BadZipFile as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Invalid ZIP file") from exc


def cleanup_upload_path(path: Path) -> None:
    base = path
    while base.name != "" and base.name != "analysis-" and base.parent != base:
        if base.parent == Path(settings.UPLOAD_TEMP_DIR):
            shutil.rmtree(base, ignore_errors=True)
            return
        base = base.parent
    shutil.rmtree(path, ignore_errors=True)


def _validate_zip_member(member: zipfile.ZipInfo) -> None:
    name = member.filename.replace("\\", "/")
    target = Path(name)
    if name.startswith("/") or ".." in target.parts:
        raise HTTPException(status_code=400, detail="ZIP path traversal is not allowed")
    if Path(name).is_absolute() or member.is_dir() and not name.strip("/"):
        raise HTTPException(status_code=400, detail="Invalid ZIP path")
    if (member.external_attr >> 16) & 0o170000 == 0o120000:
        raise HTTPException(status_code=400, detail="ZIP symlinks are not allowed")
    if member.file_size > settings.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail="ZIP contains a file that is too large")
