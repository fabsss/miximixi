# n8n mit yt-dlp und ffmpeg für Instagram-Medien-Download
FROM n8nio/n8n:latest

USER root

# yt-dlp + ffmpeg installieren
RUN apk add --no-cache ffmpeg python3 py3-pip curl && \
    pip3 install --break-system-packages yt-dlp

# Zurück zu n8n-User
USER node
