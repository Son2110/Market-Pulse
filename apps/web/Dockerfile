FROM node:22-bookworm-slim

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web

EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace=@marketpulse/web", "--", "--host", "0.0.0.0"]
