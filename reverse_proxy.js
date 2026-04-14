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
        const name = c.Names[0].replace("/", "");
        return {
          id: name,
          url: `http://${name}:8080`,
        };
      })
      .filter(Boolean);

    // console.log("Active Backends:", healthyBackends);
  } catch (err) {
    console.error("Docker Socket Error:", err.message);
  }
}

//check the available containers every 10 seconds
setInterval(refreshBackends, 10000);
refreshBackends();

function getTargetUrl(startOffset, retries) {
  const index = (startOffset + retries) % healthyBackends.length;
  return healthyBackends[index];
}

function removeFailedBackend(target) {
  healthyBackends = healthyBackends.filter((s) => s.url !== target.url);
}

function sendErrorResponse(res, statusCode, message) {
  if (!res.headersSent) {
    res.writeHead(statusCode);
    res.end(message);
  }
}
function attemptProxy(req, res, startOffset, retries) {
  // 1. Fix Regex: Remove quotes to make it a real RegExp object
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/SERVERID=([^;]+)/);
  const cookieServerId = match ? match[1] : null;

  // 2. Logic: Try to find the "Stuck" server first, otherwise use Load Balancer
  let target;
  if (cookieServerId && retries === 0) {
    target = healthyBackends.find((s) => s.id === cookieServerId);
  }

  // If no cookie or the "stuck" server is dead, get the next available one
  if (!target) {
    if (retries >= healthyBackends.length || healthyBackends.length === 0) {
      return sendErrorResponse(res, 502, "No healthy backends.");
    }
    target = getTargetUrl(startOffset, retries);
  }

  // 3. Set the cookie so the user "sticks" to this specific target
  res.setHeader("Set-Cookie", `SERVERID=${target.id}; Path=/; HttpOnly`);

  proxy.web(req, res, { target: target.url }, (err) => {
    console.error(`[Failover] ${target.id} failed.`);
    removeFailedBackend(target);

    // Use the 'res' passed into attemptProxy
    if (!res.headersSent) {
      attemptProxy(req, res, startOffset, retries + 1);
    }
  });
}

const server = http.createServer((req, res) => {
  console.log(`[Server] Incoming request: ${req.url}`);

  //check if there is no health server
  if (healthyBackends.length === 0) {
    return sendErrorResponse(
      res,
      503,
      "Service Unavailable: No backends found.",
    );
  }

  //round robin task assignment
  const startOffset = requestCounter++ % healthyBackends.length;
  attemptProxy(req, res, startOffset, 0);
});

proxy.on("error", (err, req, res) => {
  console.error("[Proxy Error]", err.message);
  if (!res.headersSent) {
    sendErrorResponse(res, 502, "Proxy Connection Error");
  }
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Load Balancer active on port 5000");
});
