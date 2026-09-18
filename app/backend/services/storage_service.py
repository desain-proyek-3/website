"""
Dentify Services — Storage Service
Layanan penyimpanan objek MinIO untuk citra klinis intraoral.
Menangani inisialisasi bucket, upload citra, kalkulasi hash SHA-256 (chain-of-custody),
dan pembuatan presigned URL yang aman untuk client.
"""

import hashlib
import io
import logging
from datetime import timedelta
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error

from core.config import settings

logger = logging.getLogger("dentify.storage")


class StorageService:
    """
    Service wrapper untuk operasi object storage MinIO.
    """

    def __init__(self) -> None:
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD,
            secure=False,
        )
        self.default_bucket = settings.MINIO_BUCKET_NAME

    def ensure_bucket_exists(self, bucket_name: str | None = None) -> bool:
        """
        Pastikan bucket target sudah dibuat di MinIO. Jika belum, buat bucket baru.
        Return True jika bucket siap digunakan, False jika gagal.
        """
        bucket = bucket_name or self.default_bucket
        try:
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)
                logger.info(f"Bucket MinIO '{bucket}' berhasil dibuat.")
            return True
        except Exception as e:
            logger.error(f"Gagal memeriksa/membuat bucket MinIO '{bucket}': {e}")
            return False

    @staticmethod
    def calculate_sha256(data: bytes) -> str:
        """
        Hitung hash SHA-256 dari byte data untuk audit chain-of-custody.
        """
        return hashlib.sha256(data).hexdigest()

    def upload_image(
        self,
        file_data: bytes,
        object_name: str,
        content_type: str = "image/jpeg",
        bucket_name: str | None = None,
    ) -> str:
        """
        Upload citra ke MinIO object storage.
        Mengembalikan object_name (file_path referensi).
        """
        bucket = bucket_name or self.default_bucket
        self.ensure_bucket_exists(bucket)

        data_stream = io.BytesIO(file_data)
        size = len(file_data)

        try:
            self.client.put_object(
                bucket_name=bucket,
                object_name=object_name,
                data=data_stream,
                length=size,
                content_type=content_type,
            )
            logger.info(f"File berhasil diupload ke MinIO: {bucket}/{object_name} ({size} bytes)")
            return object_name
        except Exception as e:
            logger.error(f"Gagal mengupload file ke MinIO ({object_name}): {e}")
            raise RuntimeError(f"Gagal mengupload file ke object storage: {e}") from e

    def get_presigned_url(
        self,
        object_name: str,
        expires_seconds: int = 3600,
        bucket_name: str | None = None,
    ) -> str:
        """
        Buat presigned GET URL berbatas waktu agar client dapat mengunduh citra
        secara aman tanpa membuka kredensial atau bucket mentah MinIO.
        """
        bucket = bucket_name or self.default_bucket
        try:
            url = self.client.presigned_get_object(
                bucket_name=bucket,
                object_name=object_name,
                expires=timedelta(seconds=expires_seconds),
            )
            return url
        except Exception as e:
            logger.error(f"Gagal membuat presigned URL untuk '{object_name}': {e}")
            raise RuntimeError(f"Gagal membuat presigned URL: {e}") from e

    def object_exists(self, object_name: str, bucket_name: str | None = None) -> bool:
        """
        Cek apakah objek ada di MinIO.
        """
        bucket = bucket_name or self.default_bucket
        try:
            self.client.stat_object(bucket, object_name)
            return True
        except S3Error as e:
            if e.code == "NoSuchKey":
                return False
            raise
        except Exception:
            return False


# Singleton instance
storage_service = StorageService()
