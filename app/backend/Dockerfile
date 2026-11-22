# Image produksi backend Dentify (FastAPI + uvicorn).
# Build (dari root repo):  docker build --platform linux/amd64 -t dentify-backend:<TAG> app/backend
# Konfigurasi runtime TIDAK ada di image — .env server dipasang lewat env_file di
# deploy/docker-compose.prod.yml.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UVICORN_HOST=127.0.0.1 \
    UVICORN_PORT=8000

WORKDIR /app

# Dependensi dulu agar layer ini ter-cache selama requirements.lock.txt tidak berubah
COPY requirements.lock.txt .
RUN pip install -r requirements.lock.txt

# User non-root; kode milik root → tidak bisa diubah oleh proses aplikasi
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin dentify
COPY --chown=root:root . .
USER dentify

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('UVICORN_PORT', '8000'), timeout=3)"

# 1 worker: recover_interrupted_jobs & antrean AI in-process mengasumsikan satu proses.
# Default bind 127.0.0.1 (server, network_mode: host, diakses lewat nginx).
# Uji di laptop dengan -p 8000:8000 → set UVICORN_HOST=0.0.0.0.
CMD ["sh", "-c", "exec uvicorn main:app --host \"$UVICORN_HOST\" --port \"$UVICORN_PORT\" --workers 1"]
