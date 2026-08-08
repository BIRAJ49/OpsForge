import shutil
import struct
import tempfile
import zipfile
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings


_EOCD_SIGNATURE = b"PK\x05\x06"
_EOCD = struct.Struct("<4s4H2LH")
_ZIP64_EOCD_SIGNATURE = b"PK\x06\x06"
_ZIP64_EOCD = struct.Struct("<4sQ2H2L4Q")
_ZIP64_LOCATOR_SIGNATURE = b"PK\x06\x07"
_ZIP64_LOCATOR = struct.Struct("<4sLQL")
_CENTRAL_DIRECTORY_SIGNATURE = b"PK\x01\x02"
_CENTRAL_DIRECTORY_ENTRY = struct.Struct("<4s6H3L5H2L")
_MAX_ZIP_COMMENT_BYTES = (1 << 16) - 1
_MAX_CENTRAL_DIRECTORY_BYTES = 32 * 1024 * 1024


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
        return extract_zip_archive(zip_path, temp_dir)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def extract_zip_archive(zip_path: Path, temp_dir: Path) -> tuple[Path, dict]:
    """Safely extract a ZIP already stored inside an isolated temporary directory."""
    try:
        _preflight_zip_archive(zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            members = archive.infolist()
            if not members:
                raise HTTPException(status_code=400, detail="Invalid ZIP file")
            if len(members) > settings.MAX_UPLOAD_FILE_COUNT:
                raise HTTPException(
                    status_code=413, detail="ZIP contains too many entries"
                )
            total_uncompressed = 0
            for member in members:
                _validate_zip_member(member)
                total_uncompressed += member.file_size
                if total_uncompressed > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(
                        status_code=413, detail="Uncompressed ZIP payload is too large"
                    )
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
                    raise HTTPException(
                        status_code=400, detail="ZIP path traversal is not allowed"
                    ) from exc
                if target.exists() and target.is_symlink():
                    raise HTTPException(
                        status_code=400, detail="ZIP path traversal is not allowed"
                    )
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, target.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
            return extract_dir, {
                "file_count": len(
                    [member for member in members if not member.is_dir()]
                ),
                "total_size": zip_path.stat().st_size,
            }
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid ZIP file") from exc


def _preflight_zip_archive(zip_path: Path) -> None:
    """Bound ZIP metadata before ``zipfile`` eagerly materializes every entry."""
    with zip_path.open("rb") as source:
        source.seek(0, 2)
        archive_size = source.tell()
        eocd_offset, eocd = _find_eocd(source, archive_size)

        (
            _signature,
            disk_number,
            directory_disk,
            entries_on_disk,
            entry_count,
            directory_size,
            directory_offset,
            _comment_length,
        ) = eocd
        sentinel_present = (
            entries_on_disk == 0xFFFF
            or entry_count == 0xFFFF
            or directory_size == 0xFFFFFFFF
            or directory_offset == 0xFFFFFFFF
        )
        zip64 = _read_zip64_eocd(source, eocd_offset, archive_size)
        if zip64 is not None:
            entry_count, directory_size, directory_offset, directory_end = zip64
        else:
            if sentinel_present:
                raise zipfile.BadZipFile("ZIP64 end record is missing")
            if disk_number != 0 or directory_disk != 0:
                raise zipfile.BadZipFile("Multi-disk ZIP files are not supported")
            if entries_on_disk != entry_count:
                raise zipfile.BadZipFile("Inconsistent ZIP entry count")
            directory_end = eocd_offset

        if entry_count > settings.MAX_UPLOAD_FILE_COUNT:
            raise HTTPException(status_code=413, detail="ZIP contains too many entries")
        if directory_size > _MAX_CENTRAL_DIRECTORY_BYTES:
            raise HTTPException(
                status_code=413, detail="ZIP central directory is too large"
            )
        if directory_offset > archive_size or directory_size > directory_end:
            raise zipfile.BadZipFile("Invalid central directory bounds")

        directory_start = directory_end - directory_size
        actual_count = _count_central_directory_entries(
            source, directory_start, directory_size
        )
        if actual_count != entry_count:
            raise zipfile.BadZipFile("Inconsistent ZIP entry count")


def _find_eocd(source, archive_size: int) -> tuple[int, tuple]:
    tail_size = min(archive_size, _EOCD.size + _MAX_ZIP_COMMENT_BYTES)
    source.seek(archive_size - tail_size)
    tail = source.read(tail_size)
    search_end = len(tail)
    while search_end >= _EOCD.size:
        index = tail.rfind(_EOCD_SIGNATURE, 0, search_end)
        if index < 0:
            break
        if index + _EOCD.size <= len(tail):
            values = _EOCD.unpack_from(tail, index)
            comment_length = values[-1]
            if index + _EOCD.size + comment_length == len(tail):
                return archive_size - tail_size + index, values
        search_end = index
    raise zipfile.BadZipFile("End of central directory record is missing")


def _read_zip64_eocd(
    source, eocd_offset: int, archive_size: int
) -> tuple[int, int, int, int] | None:
    locator_offset = eocd_offset - _ZIP64_LOCATOR.size
    if locator_offset < 0:
        return None
    source.seek(locator_offset)
    locator_data = source.read(_ZIP64_LOCATOR.size)
    if len(locator_data) != _ZIP64_LOCATOR.size:
        return None
    signature, record_disk, record_offset, disk_count = _ZIP64_LOCATOR.unpack(
        locator_data
    )
    if signature != _ZIP64_LOCATOR_SIGNATURE:
        return None
    if record_disk != 0 or disk_count != 1:
        raise zipfile.BadZipFile("Multi-disk ZIP files are not supported")

    candidates = [record_offset]
    adjacent_offset = locator_offset - _ZIP64_EOCD.size
    if adjacent_offset not in candidates:
        candidates.append(adjacent_offset)
    for candidate in candidates:
        if candidate < 0 or candidate + _ZIP64_EOCD.size > archive_size:
            continue
        source.seek(candidate)
        record_data = source.read(_ZIP64_EOCD.size)
        if len(record_data) != _ZIP64_EOCD.size:
            continue
        values = _ZIP64_EOCD.unpack(record_data)
        if values[0] != _ZIP64_EOCD_SIGNATURE:
            continue
        record_size = values[1]
        if record_size != _ZIP64_EOCD.size - 12:
            raise zipfile.BadZipFile("Unsupported ZIP64 extensible data")
        if candidate + 12 + record_size != locator_offset:
            continue
        disk_number, directory_disk = values[4:6]
        entries_on_disk, entry_count, directory_size, directory_offset = values[6:]
        if disk_number != 0 or directory_disk != 0:
            raise zipfile.BadZipFile("Multi-disk ZIP files are not supported")
        if entries_on_disk != entry_count:
            raise zipfile.BadZipFile("Inconsistent ZIP64 entry count")
        return entry_count, directory_size, directory_offset, candidate
    raise zipfile.BadZipFile("ZIP64 end record is invalid")


def _count_central_directory_entries(
    source, directory_start: int, directory_size: int
) -> int:
    source.seek(directory_start)
    remaining = directory_size
    count = 0
    while remaining:
        if remaining < _CENTRAL_DIRECTORY_ENTRY.size:
            raise zipfile.BadZipFile("Truncated central directory")
        header = source.read(_CENTRAL_DIRECTORY_ENTRY.size)
        if len(header) != _CENTRAL_DIRECTORY_ENTRY.size:
            raise zipfile.BadZipFile("Truncated central directory")
        values = _CENTRAL_DIRECTORY_ENTRY.unpack(header)
        if values[0] != _CENTRAL_DIRECTORY_SIGNATURE:
            raise zipfile.BadZipFile("Invalid central directory entry")
        filename_size, extra_size, comment_size = values[10:13]
        variable_size = filename_size + extra_size + comment_size
        record_size = _CENTRAL_DIRECTORY_ENTRY.size + variable_size
        if record_size > remaining:
            raise zipfile.BadZipFile("Truncated central directory entry")
        source.seek(variable_size, 1)
        remaining -= record_size
        count += 1
        if count > settings.MAX_UPLOAD_FILE_COUNT:
            raise HTTPException(status_code=413, detail="ZIP contains too many entries")
    return count


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
    parts = [part for part in name.split("/") if part]
    if (
        "\x00" in name
        or len(name.encode("utf-8")) > settings.MAX_UPLOAD_PATH_LENGTH
        or len(parts) > settings.MAX_UPLOAD_PATH_DEPTH
        or any(len(part.encode("utf-8")) > 255 for part in parts)
    ):
        raise HTTPException(status_code=400, detail="ZIP path is too complex")
    if name.startswith("/") or ".." in target.parts:
        raise HTTPException(status_code=400, detail="ZIP path traversal is not allowed")
    if Path(name).is_absolute() or member.is_dir() and not name.strip("/"):
        raise HTTPException(status_code=400, detail="Invalid ZIP path")
    if (member.external_attr >> 16) & 0o170000 == 0o120000:
        raise HTTPException(status_code=400, detail="ZIP symlinks are not allowed")
    if member.file_size > settings.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail="ZIP contains a file that is too large"
        )
