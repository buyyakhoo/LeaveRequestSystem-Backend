FROM node:lts AS prebuilt
WORKDIR /app
COPY package-lock.json .
COPY package.json .
RUN npm install

FROM prebuilt AS builder
WORKDIR /app
COPY src/ src/
COPY tsconfig.json .
COPY prisma/ prisma/
RUN npm run build

FROM node:lts AS final
WORKDIR /app
COPY --from=builder /app/dist/ dist/
COPY package-lock.json .
COPY package.json .
RUN npm install --production
CMD ["npm", "run", "start"]