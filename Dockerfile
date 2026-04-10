
FROM node:18-alpine

WORKDIR /app

COPY package.json ./

COPY servers/servers.js ./servers/

EXPOSE 8080

CMD ["node", "servers/servers.js"]



