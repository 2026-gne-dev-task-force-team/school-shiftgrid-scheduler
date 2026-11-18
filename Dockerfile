FROM node:22-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY scripts ./scripts
COPY --from=web /web/dist ./web/dist
USER node
EXPOSE 3000
CMD ["npm", "start"]
