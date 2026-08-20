import express from "express";
import http from "http";
import httpProxy from "http-proxy";

const app = express();
app.set("trust proxy", 1);

const TARGET_WEB = "https://play.pokemonshowdown.com";

// Standard streaming proxy with no body manipulation
const webProxy = httpProxy.createProxyServer({
  target: TARGET_WEB,
  changeOrigin: true,
  secure: true,
});

// Strip CSP and frame blockers from headers
webProxy.on("proxyRes", (proxyRes) => {
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
});

webProxy.on("error", (err, req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Web proxy communication error.");
  }
});

// ---------------------------------------------------------------------------
// 1. Intercept Config & Auto-Inject Showdown Server Definition
// ---------------------------------------------------------------------------
app.get("/config/config.js*", async (req, res) => {
  try {
    const upstreamUrl = `${TARGET_WEB}${req.originalUrl}`;
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: `${TARGET_WEB}/`,
        Origin: TARGET_WEB,
      },
    });

    let text = await upstream.text();

    // Force server definition and trigger app.connect() on boot
    const injectedCode = `
// --- Auto-Connection Boot Patch ---
window.Config = window.Config || {};
Config.server = Config.defaultserver = {
  id: 'showdown',
  host: 'sim3.psim.us',
  port: 443,
  httpport: 8000,
  altport: 80,
  ssl: true
};
try {
  window.localStorage.setItem('showdown_crossteams', 'false');
} catch (e) {}

window.addEventListener('load', function() {
  setTimeout(function() {
    if (window.app && !app.connection && window.Config && Config.server) {
      app.connect();
    }
  }, 400);
});
`;

    text += `\n${injectedCode}\n`;

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.send(text);
  } catch (err) {
    return res.status(500).send(`// Config proxy error: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Pass Everything Else Direct to Upstream (No Gzip/Decoding Bugs)
// ---------------------------------------------------------------------------
app.use((req, res) => {
  webProxy.web(req, res, {
    headers: {
      Host: "play.pokemonshowdown.com",
      Origin: TARGET_WEB,
      Referer: `${TARGET_WEB}/`,
    },
  });
});

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Showdown proxy active on port ${PORT}`);
});
