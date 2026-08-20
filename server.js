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

// Request uncompressed plaintext from upstream
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

webProxy.on("proxyRes", (proxyRes, req, res) => {
  const chunks = [];
  proxyRes.on("data", (chunk) => chunks.push(chunk));
  proxyRes.on("end", () => {
    let body = Buffer.concat(chunks);
    const contentType = proxyRes.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      const currentHost = req.headers.host;
      let text = body.toString("utf8");

      text = text.split("//play.pokemonshowdown.com/config/config.js")
                 .join(`//${currentHost}/config/config.js`);

      // Top-of-page D-pad button & instant trigger
      const topButtonHtml = `
<div id="proxy-connect-bar" style="position:fixed;top:0;left:0;width:100%;z-index:999999;background:#111;padding:4px;text-align:center;border-bottom:2px solid #ffd700;">
  <button id="proxy-connect-btn" tabindex="1" onclick="window.triggerShowdownConnect()" style="width:96%;height:32px;background:#0088cc;color:#fff;font-weight:bold;font-size:12px;border:2px solid #fff;border-radius:4px;cursor:pointer;">
    ⚡ CONNECT / WAKE WEBSOCKET
  </button>
</div>

<script>
window.triggerShowdownConnect = function() {
  var btn = document.getElementById('proxy-connect-btn');
  if (btn) btn.innerText = "CONNECTING...";
  
  try {
    window.Config = window.Config || {};
    Config.server = Config.defaultserver = {
      id: 'showdown',
      host: 'sim3.psim.us',
      port: 443,
      httpport: 8000,
      altport: 80,
      ssl: true
    };
    try { window.localStorage.setItem('showdown_crossteams', 'false'); } catch (e) {}
    
    if (window.app && typeof app.connect === 'function') {
      app.connect();
    }
  } catch (err) {
    if (btn) btn.innerText = "RETRY CONNECT";
    console.error("Connect failed:", err);
  }
};

// Monitor connection state and hide button once connected
setInterval(function() {
  if (window.app && app.connection && app.connection.open) {
    var bar = document.getElementById('proxy-connect-bar');
    if (bar) bar.style.display = 'none';
  }
}, 300);

// Auto-trigger without waiting for load event
setTimeout(function() {
  window.triggerShowdownConnect();
}, 600);
</script>
`;

      // Inject directly after opening <body> so it takes index 1 on D-Pad focus
      if (text.includes("<body")) {
        text = text.replace(/<body[^>]*>/i, (match) => `${match}${topButtonHtml}`);
      } else {
        text = topButtonHtml + text;
      }

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
        "Accept-Encoding": "identity",
      },
    };

    const response = await fetch(`${TARGET_WEB}/config/config.js`, fetchOptions);
    let text = await response.text();

    text += `
Config.server = Config.defaultserver = {
  id: 'showdown',
  host: 'sim3.psim.us',
  port: 443,
  httpport: 8000,
  altport: 80,
  ssl: true
};
`;

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(text);
  } catch (err) {
    return res.status(500).send(`// Config proxy error: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Route Dispatcher
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
