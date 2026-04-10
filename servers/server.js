import * as http from "node:http";
import { hostname } from "node:os";
// create a server

const server = http.createServer((request, response) => {
  response.statusCode = 200;
  response.setHeader("Content-type", "text/plain");

  response.end(`this server is ${hostname()}`);
});

const PORT = 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`server is runnig on port: ${PORT}`);
  console.log(`My hostname is: ${hostname()}`);
});
