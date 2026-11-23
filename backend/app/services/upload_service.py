"""Helpers for uploaded bill images: content validation and the stored image_path column."""
import json
import logging

from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp", "tiff"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "TIFF"}


def allowed_extension(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def is_valid_image(file_storage) -> bool:
    """True if the upload really is a decodable image in an allowed format.

    Reads the stream and rewinds it, so the file can still be saved afterwards.
    """
    stream = file_storage.stream
    try:
        stream.seek(0)
        with Image.open(stream) as img:
            fmt = img.format
            img.verify()
        return fmt in ALLOWED_FORMATS
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return False
    finally:
        try:
            stream.seek(0)
        except (OSError, ValueError):
            pass


def parse_image_paths(raw) -> list[str]:
    """Decode bills.image_path (a JSON list, or a legacy single filename) into a list."""
    if not raw:
        return []
    try:
        paths = json.loads(raw)
    except (TypeError, ValueError):
        return [raw]
    return paths if isinstance(paths, list) else [paths]
