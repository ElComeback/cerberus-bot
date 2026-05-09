FROM node:22-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip && pip3 install --break-system-packages yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
