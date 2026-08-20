import express from "express";
import http from "http";
import httpProxy from "http-proxy";

const app = express();
app.set("trust proxy", 1);

const TARGET_WEB = "https://play.pokemonshowdown.com";
const TARGET_SIM = "https://sim3.psim.us";

const webProxy = httpProxy.createProxyServer({
  target: TARGET_WEB,
  changeOrigin: true,
  secure: true,
});

const simProxy = httpProxy.createProxyServer({
  target: TARGET_SIM,
  changeOrigin: true,
  secure: true,
  ws: true,
});

// Strip CSP and cross-origin locks
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

webProxy.on("error", (err, req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Web proxy communication error.");
  }
});

simProxy.on("error", (err, req, socket) => {
  if (socket && socket.destroy) socket.destroy();
});

// The indestructible boot & connection payload
const BOOT_PAYLOAD = `
<script>
  (function() {
    var serverObj = {
      id: 'showdown',
      host: 'sim3.psim.us',
      port: 443,
      httpport: 8000,
      altport: 80,
      ssl: true
    };

    window.Config = window.Config || {};

    // Lock Config.server so client.js cannot wipe it to null
    try {
      Object.defineProperty(window.Config, 'server', {
        get: function() { return serverObj; },
        set: function() {},
        configurable: true,
        enumerable: true
      });
      Object.defineProperty(window.Config, 'defaultserver', {
        get: function() { return serverObj; },
        set: function() {},
        configurable: true,
        enumerable: true
      });
      window.localStorage.setItem('showdown_crossteams', 'false');
    } catch (e) {}

    // Auto-connect loop: fires the millisecond app is ready
    var connectInterval = setInterval(function() {
      if (window.app && typeof window.app.connect === 'function') {
        if (!window.app.connection) {
          window.app.connect();
        }
        clearInterval(connectInterval);
      }
    }, 50);
  })();
</script>
`;

// ---------------------------------------------------------------------------
// 1. Intercept Root HTML (Native Fetch Auto-Decompresses Gzip Cleanly)
// ---------------------------------------------------------------------------
app.get(["/", "/index.html"], async (req, res) => {
  try {
    const upstream = await fetch(`${TARGET_WEB}/`, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: `${TARGET_WEB}/`,
        Origin: TARGET_WEB,
      },
    });

    let html = await upstream.text();
    html = html.replace("<head>", `<head>${BOOT_PAYLOAD}`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.send(html);
  } catch (err) {
    return res.status(500).send(`HTML proxy error: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Intercept Config File (Backup Property Lock)
// ---------------------------------------------------------------------------
app.get(["/config/config.js", "/config/config.js*"], async (req, res) => {
  try {
    const upstream = await fetch(`${TARGET_WEB}${req.originalUrl}`, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: `${TARGET_WEB}/`,
        Origin: TARGET_WEB,
      },
    });

    let text = await upstream.text();
    text += `\n${BOOT_PAYLOAD.replace(/<\/?script>/g, "")}\n`;

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.send(text);
  } catch (err) {
    return res.status(500).send(`Config proxy error: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Transparent Asset & Simulator Routing
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
// 4. WebSocket Upgrade Pipeline
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
  console.log(`Showdown reverse proxy listening on port ${PORT}`);
});
