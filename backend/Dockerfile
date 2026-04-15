# syntax=docker/dockerfile:1.4
FROM python:3.12-slim

# Install all system dependencies at once
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libssl-dev \
    libffi-dev \
    python3-dev \
    git \
    ffmpeg \
    curl \
    ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Install Poetry
RUN pip install --no-cache-dir poetry==1.8.3

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Install Python dependencies with cache mount
RUN --mount=type=cache,target=/root/.cache/pip \
    poetry config virtualenvs.create false && \
    poetry install --no-cache --no-interaction --no-root --only main

# Copy application code
COPY app/ ./app/

# Cleanup build dependencies (keeping runtime deps)
RUN apt-get purge -y --auto-remove \
    build-essential gcc g++ libssl-dev libffi-dev python3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/ /root/.cache/*

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
