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

// Force upstream to send uncompressed plaintext so body rewrites don't corrupt
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

      // Invisible, zero-UI boot script: polls silently and connects instantly
      const injected = `
<script>
(function() {
  // Prevent D-pad left/right from navigating away from battle
  window.addEventListener('keydown', function(e) {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        (window.location.hash.includes('battle') || document.querySelector('.battle-room'))) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  try {
    window.localStorage.setItem('showdown_crossteams', 'false');
  } catch (e) {}

  function attemptConnect() {
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
      if (window.app && typeof app.connect === 'function') {
        if (!app.connection) {
          app.connect();
        }
        return true;
      }
    } catch (err) {}
    return false;
  }

  // Poll every 50ms so it connects immediately when app is ready (no waiting on window.onload)
  var pollCount = 0;
  var connectInterval = setInterval(function() {
    pollCount++;
    if (attemptConnect() || pollCount > 200) {
      clearInterval(connectInterval);
    }
  }, 50);

  window.addEventListener('load', function() {
    setTimeout(attemptConnect, 100);
  });
})();
</script>`;

      text = text.includes("</body>")
        ? text.replace("</body>", `${injected}</body>`)
        : text + injected;

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
// 1. Short-Circuit Trackers & Dead Analytics Requests
// ---------------------------------------------------------------------------
app.get(/(analytics\.js|gtag\/js|ga\.js)/, (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.send("// Analytics disabled");
});

// ---------------------------------------------------------------------------
// 2. Dynamic Config Interception
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
// 3. Route Dispatcher
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
// 4. Native WebSocket Upgrade Listener
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
