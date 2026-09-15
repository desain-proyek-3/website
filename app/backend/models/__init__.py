"""
Dentify ORM — Package Init
Import semua model di sini agar SQLAlchemy Base.metadata aware terhadap semua tabel.
"""

from models.user import User
from models.subject import Subject
from models.dental_image import DentalImage
from models.tooth_record import ToothRecord
from models.embedding import Embedding
from models.matching_result import MatchingResult
from models.audit_log import AuditLog

__all__ = [
    "User",
    "Subject",
    "DentalImage",
    "ToothRecord",
    "Embedding",
    "MatchingResult",
    "AuditLog",
]

