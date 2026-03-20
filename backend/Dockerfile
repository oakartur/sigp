FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN apk add --no-cache openssl postgresql-client

RUN npm ci --ignore-scripts

COPY . .

RUN npx prisma generate

RUN npm run build

RUN ls -la /usr/src/app/dist

CMD ["npm", "run", "start:prod"]
