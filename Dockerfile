FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY server/package.json server/pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile || pnpm install

COPY server/ .
COPY public/stanox-lookup.json ./public/

RUN pnpm run build

RUN mkdir -p /app/data

EXPOSE 8080

ENV PORT=8080

CMD ["node", "dist/index.js"]
