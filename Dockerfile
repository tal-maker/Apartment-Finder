# The Playwright image ships Chromium, used for Facebook groups (and Yad2 with YAD2_USE_BROWSER=1).
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R pwuser /app/data
VOLUME /app/data
EXPOSE 3000
USER pwuser
CMD ["node", "--env-file-if-exists=.env", "server/index.js"]
