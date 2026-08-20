import express from "express";
import http from "http";
import httpProxy from "http-proxy";

const app = express();
app.set("trust proxy", 1);

const TARGET_WEB = "https://play.pokemonshowdown.com";

const webProxy = httpProxy.createProxyServer({
  target: TARGET_WEB,
  changeOrigin: true,
  secure: true,
  selfHandleResponse: true,
});

// Boot injection: Forces Showdown client to auto-connect on custom domains
const INJECTED_BOOT = `
<script>
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
</script>
`;

// Request uncompressed plaintext from upstream to allow body injection
webProxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("accept-encoding", "identity");
});

// ---------------------------------------------------------------------------
// 1. Force Clean Config Route
// ---------------------------------------------------------------------------
app.get("/config/config.js", async (req, res) => {
  try {
    const upstream = await fetch(`${TARGET_WEB}/config/config.js`, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: `${TARGET_WEB}/`,
        Origin: TARGET_WEB,
        "Accept-Encoding": "identity",
      },
    });

    let text = await upstream.text();
    text += `\nConfig.server = Config.defaultserver = { id: 'showdown', host: 'sim3.psim.us', port: 443, httpport: 8000, altport: 80, ssl: true };\n`;

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
// 2. HTML Injection & Header Sanitization
// ---------------------------------------------------------------------------
webProxy.on("proxyRes", (proxyRes, req, res) => {
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

  const contentType = proxyRes.headers["content-type"] || "";

  if (contentType.includes("text/html")) {
    const body = [];
    proxyRes.on("data", (chunk) => body.push(chunk));
    proxyRes.on("end", () => {
      let html = Buffer.concat(body).toString("utf8");
      html = html.replace("<head>", `<head>${INJECTED_BOOT}`);

      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        "content-length": Buffer.byteLength(html),
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(html);
    });
  } else {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  }
});

webProxy.on("error", (err, req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy communication error.");
  }
});

// ---------------------------------------------------------------------------
// 3. Dispatcher
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
