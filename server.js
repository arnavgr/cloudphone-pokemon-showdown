import express from "express";
import http from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { HttpsProxyAgent } from "https-proxy-agent";

const app = express();
app.set("trust proxy", 1);

const TARGET_WEB = "https://play.pokemonshowdown.com";
const TARGET_SIM = "https://sim3.psim.us";

// Optional outbound proxy routing (e.g. Webshare Warsaw proxy)
const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

// ---------------------------------------------------------------------------
// 1. Dynamic Config Interception
// ---------------------------------------------------------------------------
// Forces the Showdown client to route its WebSocket to this proxy instead
// of trying to connect cross-origin directly to sim3.psim.us
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
// 2. Simulator WebSocket & SockJS Proxy (/showdown/*)
// ---------------------------------------------------------------------------
const simProxy = createProxyMiddleware({
  target: TARGET_SIM,
  changeOrigin: true,
  ws: true,
  agent: proxyAgent,
  headers: {
    Host: "sim3.psim.us",
    Origin: TARGET_WEB,
    Referer: `${TARGET_WEB}/`,
  },
  on: {
    proxyRes: (proxyRes) => {
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["x-frame-options"];
    },
    error: (err, req, res) => {
      if (res && res.writeHead) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("Simulator proxy error.");
      }
    },
  },
});

app.use("/showdown", simProxy);

// ---------------------------------------------------------------------------
// 3. Web Client Asset & Page Proxy (/*)
// ---------------------------------------------------------------------------
const webProxy = createProxyMiddleware({
  target: TARGET_WEB,
  changeOrigin: true,
  agent: proxyAgent,
  headers: {
    Host: "play.pokemonshowdown.com",
    Origin: TARGET_WEB,
    Referer: `${TARGET_WEB}/`,
  },
  on: {
    proxyRes: (proxyRes) => {
      // Strip CSP and framing blockers
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["cross-origin-opener-policy"];
      delete proxyRes.headers["cross-origin-embedder-policy"];

      // Strip domain from cookies so they stick to your Render domain
      const setCookie = proxyRes.headers["set-cookie"];
      if (setCookie) {
        proxyRes.headers["set-cookie"] = (
          Array.isArray(setCookie) ? setCookie : [setCookie]
        ).map((cookie) => cookie.replace(/;\s*Domain=[^;]+/i, ""));
      }
    },
    error: (err, req, res) => {
      if (res && res.writeHead) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("Web proxy error.");
      }
    },
  },
});

app.use("/", webProxy);

// ---------------------------------------------------------------------------
// Server Initialization
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Showdown proxy active on port ${PORT}`);
});
