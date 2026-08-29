FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN apt-get update -y && apt-get install -y openssl

RUN yarn prisma generate

RUN yarn build

EXPOSE 3001

CMD ["yarn", "start:prod"]