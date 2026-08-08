import io
import struct
import zipfile
from pathlib import Path
from urllib.parse import quote

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services.github_repo_analyzer_service import clone_github_repo
from app.services.upload_service import cleanup_upload_path


def _archive_bytes(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return buffer.getvalue()


def _zip64_archive_with_declared_entries(entry_count: int) -> bytes:
    zip64_eocd = struct.pack(
        "<4sQ2H2L4Q",
        b"PK\x06\x06",
        44,
        45,
        45,
        0,
        0,
        entry_count,
        entry_count,
        0,
        0,
    )
    locator = struct.pack("<4sLQL", b"PK\x06\x07", 0, 0, 1)
    eocd = struct.pack(
        "<4s4H2LH",
        b"PK\x05\x06",
        0,
        0,
        0xFFFF,
        0xFFFF,
        0xFFFFFFFF,
        0xFFFFFFFF,
        0,
    )
    return zip64_eocd + locator + eocd


def _replace_declared_entry_count(body: bytes, entry_count: int) -> bytes:
    modified = bytearray(body)
    eocd_offset = modified.rfind(b"PK\x05\x06")
    assert eocd_offset >= 0
    struct.pack_into("<HH", modified, eocd_offset + 8, entry_count, entry_count)
    return bytes(modified)


class _ArchiveResponse:
    def __init__(self, body: bytes = b"", status_code: int = 200):
        self.body = body
        self.status_code = status_code
        self.headers = {"content-length": str(len(body))}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def iter_bytes(self, _chunk_size: int):
        yield self.body


def test_github_archive_is_downloaded_and_safely_extracted(tmp_path: Path, monkeypatch):
    body = _archive_bytes({"octo-repo-a1b2c3/app.py": "print('safe')\n"})
    calls = []

    def fake_stream(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return _ArchiveResponse(body)

    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(httpx, "stream", fake_stream)

    root = clone_github_repo(
        "https://github.com/octo/repo.git",
        "feature/secure-import",
        "github-token",
    )
    try:
        assert (root / "app.py").read_text() == "print('safe')\n"
        assert calls[0][0] == "GET"
        assert calls[0][1].endswith("/repos/octo/repo/zipball/feature%2Fsecure-import")
        assert calls[0][2]["headers"]["Authorization"] == "Bearer github-token"
        assert calls[0][2]["follow_redirects"] is True
    finally:
        cleanup_upload_path(root)


@pytest.mark.parametrize(
    "branch",
    [
        "--upload-pack=malicious",
        "../main",
        "release//candidate",
        ".hidden",
        "main\n",
    ],
)
def test_unsafe_github_branch_is_rejected_before_download(
    tmp_path: Path, monkeypatch, branch: str
):
    def unexpected_stream(*_args, **_kwargs):
        raise AssertionError("invalid branch must not trigger an HTTP request")

    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(httpx, "stream", unexpected_stream)

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo("https://github.com/octo/repo", branch)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "GitHub branch name is invalid"
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize(
    "branch", ["feature+api", "release@2026", "cash$money", "feature;safe-now"]
)
def test_valid_git_branch_characters_are_encoded(
    tmp_path: Path, monkeypatch, branch: str
):
    body = _archive_bytes({"octo-repo-ref/README.md": "safe\n"})
    urls = []

    def fake_stream(_method, url, **_kwargs):
        urls.append(url)
        return _ArchiveResponse(body)

    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(httpx, "stream", fake_stream)

    root = clone_github_repo("https://github.com/octo/repo", branch)
    try:
        assert urls == [
            f"https://api.github.com/repos/octo/repo/zipball/{quote(branch, safe='')}"
        ]
    finally:
        cleanup_upload_path(root)


@pytest.mark.parametrize(
    "repo_url",
    [
        "https://example.com/octo/repo",
        "https://github.com/../repo",
        "https://github.com/octo/..",
        "https://github.com/octo/repo\n",
    ],
)
def test_invalid_repository_url_is_rejected_before_download(
    tmp_path: Path, monkeypatch, repo_url: str
):
    def unexpected_stream(*_args, **_kwargs):
        raise AssertionError("invalid repository must not trigger an HTTP request")

    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(httpx, "stream", unexpected_stream)

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo(repo_url)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "GitHub repo URL is invalid"
    assert not list(tmp_path.iterdir())


def test_missing_branch_falls_back_to_default_branch(tmp_path: Path, monkeypatch):
    body = _archive_bytes({"octo-repo-default/README.md": "default\n"})
    responses = iter([_ArchiveResponse(status_code=404), _ArchiveResponse(body)])
    urls = []

    def fake_stream(_method, url, **_kwargs):
        urls.append(url)
        return next(responses)

    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(httpx, "stream", fake_stream)

    root = clone_github_repo("https://github.com/octo/repo", "missing")
    try:
        assert (root / "README.md").read_text() == "default\n"
        assert urls == [
            "https://api.github.com/repos/octo/repo/zipball/missing",
            "https://api.github.com/repos/octo/repo/zipball",
        ]
    finally:
        cleanup_upload_path(root)


def test_oversized_github_archive_is_rejected_and_cleaned_up(
    tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 0)
    monkeypatch.setattr(
        httpx, "stream", lambda *_args, **_kwargs: _ArchiveResponse(b"too large")
    )

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo("https://github.com/octo/repo")

    assert exc_info.value.status_code == 413
    assert not list(tmp_path.iterdir())


def test_archive_with_too_many_entries_is_rejected_and_cleaned_up(
    tmp_path: Path, monkeypatch
):
    body = _archive_bytes(
        {
            "octo-repo/file-one.txt": "",
            "octo-repo/file-two.txt": "",
        }
    )
    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_UPLOAD_FILE_COUNT", 1)
    monkeypatch.setattr(
        zipfile,
        "ZipFile",
        lambda *_args, **_kwargs: pytest.fail(
            "ZipFile must not be constructed for an over-limit archive"
        ),
    )
    monkeypatch.setattr(
        httpx, "stream", lambda *_args, **_kwargs: _ArchiveResponse(body)
    )

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo("https://github.com/octo/repo")

    assert exc_info.value.status_code == 413
    assert exc_info.value.detail == "ZIP contains too many entries"
    assert not list(tmp_path.iterdir())


def test_actual_entry_count_is_bounded_before_zipfile_construction(
    tmp_path: Path, monkeypatch
):
    body = _replace_declared_entry_count(
        _archive_bytes(
            {
                "octo-repo/file-one.txt": "",
                "octo-repo/file-two.txt": "",
            }
        ),
        1,
    )
    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_UPLOAD_FILE_COUNT", 1)
    monkeypatch.setattr(
        zipfile,
        "ZipFile",
        lambda *_args, **_kwargs: pytest.fail(
            "ZipFile must not be constructed before the real entry count is bounded"
        ),
    )
    monkeypatch.setattr(
        httpx, "stream", lambda *_args, **_kwargs: _ArchiveResponse(body)
    )

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo("https://github.com/octo/repo")

    assert exc_info.value.status_code == 413
    assert exc_info.value.detail == "ZIP contains too many entries"
    assert not list(tmp_path.iterdir())


def test_zip64_declared_entry_count_is_bounded_before_zipfile_construction(
    tmp_path: Path, monkeypatch
):
    body = _zip64_archive_with_declared_entries(2)
    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_UPLOAD_FILE_COUNT", 1)
    monkeypatch.setattr(
        zipfile,
        "ZipFile",
        lambda *_args, **_kwargs: pytest.fail(
            "ZipFile must not be constructed for an over-limit ZIP64 archive"
        ),
    )
    monkeypatch.setattr(
        httpx, "stream", lambda *_args, **_kwargs: _ArchiveResponse(body)
    )

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo("https://github.com/octo/repo")

    assert exc_info.value.status_code == 413
    assert exc_info.value.detail == "ZIP contains too many entries"
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize(
    "member_name,setting_name,setting_value",
    [
        ("octo-repo/deep/path/file.txt", "MAX_UPLOAD_PATH_DEPTH", 2),
        ("octo-repo/long-name.txt", "MAX_UPLOAD_PATH_LENGTH", 10),
    ],
)
def test_archive_with_complex_paths_is_rejected_and_cleaned_up(
    tmp_path: Path,
    monkeypatch,
    member_name: str,
    setting_name: str,
    setting_value: int,
):
    body = _archive_bytes({member_name: "safe\n"})
    monkeypatch.setattr(settings, "UPLOAD_TEMP_DIR", str(tmp_path))
    monkeypatch.setattr(settings, setting_name, setting_value)
    monkeypatch.setattr(
        httpx, "stream", lambda *_args, **_kwargs: _ArchiveResponse(body)
    )

    with pytest.raises(HTTPException) as exc_info:
        clone_github_repo("https://github.com/octo/repo")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "ZIP path is too complex"
    assert not list(tmp_path.iterdir())
