FROM oven/bun:latest AS builder
WORKDIR /app

COPY ./package.json ./
RUN bun install

COPY . .
RUN bun run compile






FROM oven/bun:latest AS runner
WORKDIR /app

COPY --from=builder /app/pukis /app/pukis
RUN bun i socket.io

# COPY .env.docker ./.env
ENV PORT=3000

CMD ["./pukis"]
