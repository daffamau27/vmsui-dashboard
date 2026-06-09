FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8082

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/build ./build

EXPOSE 8082

CMD ["node", "build/index.js"]