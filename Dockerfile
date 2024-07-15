FROM node:20.15-bullseye as base
RUN apt-get update &&\
    apt-get install -y build-essential libc-dev &&\
    apt-get clean
RUN npm install -g node-gyp

FROM base as builder
WORKDIR /app

COPY ./package.json ./yarn.lock  ./lerna.json ./.yarnrc.yml ./
COPY packages/cw-to-ton/package.json /app/packages/cw-to-ton/package.json
COPY packages/ton-to-cw/package.json /app/packages/ton-to-cw/package.json
COPY packages/orchestrator/package.json /app/packages/orchestrator/package.json
COPY patches /app/patches
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build


FROM base as main

WORKDIR /app 

COPY --from=builder /app/packages/orchestrator/dist/ ./dist

CMD ["node", "dist/index.js"]


