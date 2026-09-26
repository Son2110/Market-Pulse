FROM node:22-bookworm-slim

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace=@marketpulse/api

ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
