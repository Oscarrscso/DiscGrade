FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=7000 \
    DATA_DIR=/app/.data

RUN mkdir -p /app/.data/guides && chown -R node:node /app

USER node

EXPOSE 7000

CMD ["node", "--experimental-strip-types", "src/server.ts"]
