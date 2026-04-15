"""Unit tests for media_processor helper functions."""
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.media_processor import is_video, DownloadResult


class TestIsVideo:
    def test_mp4_is_video(self):
        assert is_video("clip.mp4") is True

    def test_mov_is_video(self):
        assert is_video("clip.mov") is True

    def test_webm_is_video(self):
        assert is_video("clip.webm") is True

    def test_avi_is_video(self):
        assert is_video("clip.avi") is True

    def test_mkv_is_video(self):
        assert is_video("clip.mkv") is True

    def test_jpg_is_not_video(self):
        assert is_video("photo.jpg") is False

    def test_jpeg_is_not_video(self):
        assert is_video("photo.jpeg") is False

    def test_png_is_not_video(self):
        assert is_video("photo.png") is False

    def test_webp_is_not_video(self):
        assert is_video("photo.webp") is False

    def test_uppercase_extension(self):
        assert is_video("clip.MP4") is True

    def test_path_with_directory(self):
        assert is_video("/tmp/abc/video.mp4") is True
        assert is_video("/tmp/abc/photo.jpg") is False


class TestDownloadResult:
    def test_download_result_defaults(self):
        result = DownloadResult()
        assert result.media_paths == []
        assert result.description == ""

    def test_download_result_with_data(self):
        result = DownloadResult(
            media_paths=["/tmp/video.mp4", "/tmp/thumb.jpg"],
            description="Leckeres Rezept",
        )
        assert len(result.media_paths) == 2
        assert result.description == "Leckeres Rezept"
