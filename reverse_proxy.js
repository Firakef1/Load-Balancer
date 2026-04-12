import * as http from "node:http";
import http_proxy from "http-proxy";
import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const proxy = http_proxy.createProxyServer({
  proxyTimeout: 5000,
  timeout: 5000,
});

let healthyBackends = [];
let requestCounter = 0;

async function refreshBackends() {
  try {
    const containers = await docker.listContainers();
    const matches = containers.filter((c) => c.Image.includes("mock-backend"));

    healthyBackends = matches
      .map((c) => {
        const networks = c.NetworkSettings.Networks;
        const firstNetwork = Object.keys(networks)[0];
        const ip = networks[firstNetwork]?.IPAddress;
        return ip ? `http://${ip}:8080` : null;
      })
      .filter(Boolean);

    console.log(
      `[Health Check] Active: ${healthyBackends.length}`,
      healthyBackends,
    );
  } catch (err) {
    console.error("Docker Socket Error:", err.message);
  }
}

setInterval(refreshBackends, 10000);
refreshBackends();

const server = http.createServer((req, res) => {
  if (healthyBackends.length === 0) {
    res.writeHead(503);
    return res.end("Service Unavailable: No healthy backends.");
  }

  const startOffset = requestCounter++ % healthyBackends.length;

  const attemptProxy = (retries) => {
    if (retries >= healthyBackends.length) {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("Bad Gateway: All backends failed.");
      }
      return;
    }

    const targetIndex = (startOffset + retries) % healthyBackends.length;
    const target = healthyBackends[targetIndex];

    proxy.web(req, res, { target }, (err) => {
      console.error(`Failover: ${target} unreachable. trying next...`);
      healthyBackends = healthyBackends.filter((url) => url !== target);
      attemptProxy(retries + 1);
    });
  };

  attemptProxy(0);
});

proxy.on("error", (err, req, res) => {
  if (!res.headersSent) {
    res.writeHead(502);
    res.end("Proxy Connection Error");
  }
});

server.listen(5000, () => {
  console.log("Load Balancer active on port 5000");
});
