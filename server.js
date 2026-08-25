import express from "express";
import http from "http";
import httpProxy from "http-proxy";

const LEGACY_PORT = Number(process.env.LEGACY_PORT || 3001);
const PORT = Number(process.env.PORT || 3000);

// Keep the existing implementation intact and put a small compatibility
// layer in front of it. Only config.js is buffered; large data responses are
// streamed directly.
process.env.PORT = String(LEGACY_PORT);
await import("./server-legacy.js");

const app = express();
const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${LEGACY_PORT}`,
  changeOrigin: true,
  ws: true,
  selfHandleResponse: true,
});

proxy.on("proxyReq", (proxyReq, req) => {
  // Preserve the public Host so the legacy proxy generates public-origin URLs.
  if (req.headers.host) proxyReq.setHeader("host", req.headers.host);
});

proxy.on("proxyRes", (proxyRes, req, res) => {
  const publicHost = req.headers.host || "";
  const isConfig = req.url.split("?", 1)[0] === "/config/config.js";

  const cookies = proxyRes.headers["set-cookie"];
  if (cookies) {
    proxyRes.headers["set-cookie"] = (Array.isArray(cookies) ? cookies : [cookies])
      .map(cookie => cookie.replace(/;\s*Domain=[^;]+/i, ""));
  }

  // Wildcard ACAO + credentials is invalid for credentialed browser requests.
  delete proxyRes.headers["access-control-allow-origin"];
  delete proxyRes.headers["access-control-allow-credentials"];

  const location = proxyRes.headers["location"];
  if (location && publicHost) {
    proxyRes.headers["location"] = location
      .replace("https://play.pokemonshowdown.com", `https://${publicHost}`)
      .replace("http://play.pokemonshowdown.com", `https://${publicHost}`);
  }

  if (!isConfig) {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
    return;
  }

  // The upstream client uses crossdomain.php when Config.routes.client points
  // at play.pokemonshowdown.com. That endpoint rejects arbitrary proxy hosts,
  // leaving PSStorage unresolved and the Teambuilder stuck on Loading... .
  // Rewrite only config.js so the proxy becomes the client's canonical origin.
  const chunks = [];
  proxyRes.on("data", chunk => chunks.push(chunk));
  proxyRes.on("end", () => {
    let body = Buffer.concat(chunks).toString("utf8");
    body += `\nConfig.routes = Config.routes || {};\nConfig.routes.client = ${JSON.stringify(publicHost)};\n`;
    delete proxyRes.headers["content-encoding"];
    delete proxyRes.headers["content-length"];
    proxyRes.headers["cache-control"] = "no-store";
    proxyRes.headers["content-length"] = Buffer.byteLength(body);
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    res.end(body);
  });
});

proxy.on("error", (err, req, res) => {
  if (res && typeof res.writeHead === "function" && !res.headersSent) {
    res.writeHead(502, { "content-type": "text/plain" });
  }
  if (res && typeof res.end === "function") {
    res.end("Compatibility proxy error: " + err.message);
  }
});

app.use((req, res) => proxy.web(req, res));
const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => proxy.ws(req, socket, head));
server.listen(PORT, () => console.log(`CloudPhone compatibility proxy active on port ${PORT}`));
