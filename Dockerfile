
FROM node:18-alpine

WORKDIR /

COPY package.json ./

COPY servers/server.js ./servers/

EXPOSE 8080

CMD ["node", "servers/server.js"]



