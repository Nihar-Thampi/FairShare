# FairShare API (Flask) with EasyOCR for reading invoices.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OpenCV (pulled in by EasyOCR) needs these shared libraries.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# EasyOCR runs on the CPU (gpu=False), so the much smaller CPU build of PyTorch is enough.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
 && pip install -r requirements.txt gunicorn

COPY . .

# data/ (the SQLite database) and uploads/ (invoice images) are mounted from the project folder.
EXPOSE 5000
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--timeout", "300", "--bind", "0.0.0.0:5000", "run:app"]
