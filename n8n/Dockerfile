# n8n mit yt-dlp und ffmpeg für Instagram-Medien-Download
FROM alpine:latest

# Alle notwendigen Tools installieren
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    nodejs \
    npm && \
    pip3 install --break-system-packages yt-dlp

# n8n installieren
RUN npm install -g n8n

EXPOSE 5678

# RUN addgroup -S node && \
#     adduser -S -G node -h /home/node -s /bin/sh node

# # Als node-User ausführen (ähnlich wie das Original-Image)
# USER node

ENTRYPOINT ["n8n", "start", "--tunnel"]