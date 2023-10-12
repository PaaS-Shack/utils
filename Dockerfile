FROM node:18-alpine

ENV NODE_ENV=production

RUN apk add git mtr

RUN mkdir /app
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production

COPY . .

CMD ["npm", "start"]
