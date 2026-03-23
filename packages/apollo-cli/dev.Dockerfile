# syntax=docker/dockerfile:1

FROM node:24-alpine AS setup
RUN npm install -g pnpm@10.12.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/ packages/
RUN find packages/ -type f \! \( -name "package.json" \) -delete && \
find . -type d -empty -delete

FROM node:24-alpine AS build
RUN npm install -g pnpm@10.12.1
WORKDIR /app
COPY --from=setup /app .
RUN pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/packages/apollo-shared
RUN pnpm build
WORKDIR /app/packages/apollo-cli
RUN pnpm build

FROM node:24-alpine
RUN npm install -g pnpm@10.12.1
LABEL org.opencontainers.image.source=https://github.com/GMOD/Apollo3
LABEL org.opencontainers.image.description="Apollo CLI"
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/apollo-cli packages/apollo-cli
COPY --from=build /app/packages/apollo-cli/dist ./packages/apollo-cli/dist
RUN pnpm install --frozen-lockfile --prod
WORKDIR /app/packages/apollo-cli
ENV APOLLO_DISABLE_CONFIG_CREATE=1
ENTRYPOINT ["node", "bin/run.js"]
