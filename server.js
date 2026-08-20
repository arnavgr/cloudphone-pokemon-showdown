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

// Create dedicated proxy instances
const webProxy = httpProxy.createProxyServer({
  target: TARGET_WEB,
  changeOrigin: true,
  agent: proxyAgent,
  secure: true,
});

const simProxy = httpProxy.createProxyServer({
  target: TARGET_SIM,
  changeOrigin: true,
  agent: proxyAgent,
  secure: true,
  ws: true,
});

// Clean security and cookie headers from upstream responses
function sanitizeHeaders(proxyRes) {
  delete proxyRes.headers["content-security-policy"];
  delete proxyRes.headers["content-security-policy-report-only"];
  delete proxyRes.headers["x-frame-options"];
  delete proxyRes.headers["cross-origin-opener-policy"];
  delete proxyRes.headers["cross-origin-embedder-policy"];
  proxyRes.headers["access-control-allow-origin"] = "*";

  const setCookie = proxyRes.headers["set-cookie"];
  if (setCookie) {
    proxyRes.headers["set-cookie"] = (
      Array.isArray(setCookie) ? setCookie : [setCookie]
    ).map((cookie) => cookie.replace(/;\s*Domain=[^;]+/i, ""));
  }
}

webProxy.on("proxyRes", sanitizeHeaders);
simProxy.on("proxyRes", sanitizeHeaders);

// Error handlers to prevent server crashes on socket resets
webProxy.on("error", (err, req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Web proxy connection error.");
  }
});

simProxy.on("error", (err, req, socket) => {
  if (socket && socket.destroy) {
    socket.destroy();
  }
});

// ---------------------------------------------------------------------------
// 1. Dynamic Config Interception
// ---------------------------------------------------------------------------
app.get("/config/config.js", async (req, res) => {
  try {
    const fetchOptions = {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: `${TARGET_WEB}/`,
        Origin: TARGET_WEB,
      },
    };

    const response = await fetch(`${TARGET_WEB}/config/config.js`, fetchOptions);
    let text = await response.text();

    const currentHost = req.get("host");
    text = text.replace(/sim\d*\.psim\.us/g, currentHost);

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(text);
  } catch (err) {
    return res.status(500).send(`// Config proxy error: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// 2. HTTP Route Dispatcher
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

// ---------------------------------------------------------------------------
// 3. Native WebSocket Upgrade Listener
// ---------------------------------------------------------------------------
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
  console.log(`Showdown proxy active on port ${PORT}`);
});
