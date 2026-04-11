import * as http from "node:http";
import http_proxy from "http-proxy";

const proxy = http_proxy.createProxyServer({});

const server = http.createServer((request, response) => {
  proxy.web(request, response, { target: "http://mock-backend:8080" });
});

server.listen(5000, () => {
  console.log("Proxy server running on http://localhost:5000");
});
