import express from "express";
import http from "http";
import httpProxy from "http-proxy";
import { HttpsProxyAgent } from "https-proxy-agent";

const app = express();
app.set("trust proxy", 1);

const TARGET_WEB = "https://play.pokemonshowdown.com";
const TARGET_SIM = "https://sim3.psim.us";

const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

const webProxy = httpProxy.createProxyServer({
  target: TARGET_WEB,
  changeOrigin: true,
  agent: proxyAgent,
  secure: true,
  selfHandleResponse: true,
});

const simProxy = httpProxy.createProxyServer({
  target: TARGET_SIM,
  changeOrigin: true,
  agent: proxyAgent,
  secure: true,
  ws: true,
});

// Force uncompressed HTML so we can rewrite text without decoding crashes
webProxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("accept-encoding", "identity");
});

function sanitizeHeaders(proxyRes) {
  delete proxyRes.headers["content-security-policy"];
  delete proxyRes.headers["content-security-policy-report-only"];
  delete proxyRes.headers["x-frame-options"];
  delete proxyRes.headers["cross-origin-opener-policy"];
  delete proxyRes.headers["cross-origin-embedder-policy"];
  delete proxyRes.headers["content-encoding"];
  proxyRes.headers["access-control-allow-origin"] = "*";

  const setCookie = proxyRes.headers["set-cookie"];
  if (setCookie) {
    proxyRes.headers["set-cookie"] = (
      Array.isArray(setCookie) ? setCookie : [setCookie]
    ).map((cookie) => cookie.replace(/;\s*Domain=[^;]+/i, ""));
  }
}

webProxy.on("proxyRes", sanitizeHeaders);

// IMMEDIATE HEAD INJECTION: Runs before client.js to kill crossteams & auto-connect
const INSTANT_BOOT_SCRIPT = `
<script>
(function() {
  // 1. Immediately disable crossteams iframe so window never stalls
  try {
    window.localStorage.setItem('showdown_crossteams', 'false');
  } catch (e) {}

  var serverObj = {
    id: 'showdown',
    host: 'sim3.psim.us',
    port: 443,
    httpport: 8000,
    altport: 80,
    ssl: true
  };

  window.Config = window.Config || {};
  Config.server = Config.defaultserver = serverObj;

  // 2. Poll every 50ms and connect immediately when app is ready (NO onload waiting)
  var pollCount = 0;
  var connectInterval = setInterval(function() {
    pollCount++;
    if (window.Config) {
      Config.server = Config.defaultserver = serverObj;
    }
    if (window.app && typeof app.connect === 'function') {
      if (!app.connection) {
        app.connect();
      }
      clearInterval(connectInterval);
    }
    if (pollCount > 200) { // Safety clear after 10s
      clearInterval(connectInterval);
    }
  }, 50);
})();
</script>
`;

webProxy.on("proxyRes", (proxyRes, req, res) => {
  const chunks = [];
  proxyRes.on("data", (chunk) => chunks.push(chunk));
  proxyRes.on("end", () => {
    let body = Buffer.concat(chunks);
    const contentType = proxyRes.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      let text = body.toString("utf8");

      // Inject script at the very top of <head> before any external JS files load
      text = text.replace("<head>", `<head>${INSTANT_BOOT_SCRIPT}`);

      body = Buffer.from(text, "utf8");
      proxyRes.headers["content-length"] = Buffer.byteLength(body);
      delete proxyRes.headers["content-encoding"];
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    res.end(body);
  });
});

webProxy.on("error", (err, req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Web proxy communication error.");
  }
});

simProxy.on("error", (err, req, socket) => {
  if (socket && socket.destroy) socket.destroy();
});

// ---------------------------------------------------------------------------
// Route Dispatcher & WebSocket Handling
// ---------------------------------------------------------------------------
app.use((req, res) => {
  if (req.url.startsWith("/showdown")) {
    simProxy.web(req, res, {
      headers: {
        Host: "sim3.psim.us",
        Origin: TARGET_WEB,
        Referer: `${TARGET_WEB}/`,
      },
    });
  } else {
    webProxy.web(req, res, {
      headers: {
        Host: "play.pokemonshowdown.com",
        Origin: TARGET_WEB,
        Referer: `${TARGET_WEB}/`,
      },
    });
  }
});

const server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/showdown")) {
    simProxy.ws(req, socket, head, {
      headers: {
        Host: "sim3.psim.us",
        Origin: TARGET_WEB,
      },
    });
  } else {
    webProxy.ws(req, socket, head, {
      headers: {
        Host: "play.pokemonshowdown.com",
        Origin: TARGET_WEB,
      },
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Showdown proxy running on port ${PORT}`);
});
