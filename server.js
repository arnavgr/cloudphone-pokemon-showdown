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

// Force upstream uncompressed data for clean script injection
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

      const injectedHead = `
<style>
  /* Suppress default oversized hover tooltips */
  #tooltipwrapper, .tooltip, .battle-log-tag {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* High-visibility spatial focus indicator */
  button:focus, a:focus, input:focus, select:focus {
    outline: 3px solid #ffcc00 !important;
    outline-offset: 1px !important;
    box-shadow: 0 0 8px #ffcc00 !important;
  }

  /* Custom 240x320 Compact HUD Inspector */
  #cp-inspector {
    display: none;
    position: fixed;
    top: 36px;
    left: 4px;
    right: 4px;
    background: rgba(18, 22, 28, 0.96);
    border: 2px solid #ffcc00;
    border-radius: 6px;
    color: #fff;
    padding: 8px;
    z-index: 999999;
    font-family: sans-serif;
    font-size: 11px;
    line-height: 1.35;
    box-shadow: 0 4px 16px rgba(0,0,0,0.8);
  }
  #cp-inspector-title {
    font-size: 13px;
    font-weight: bold;
    color: #ffd700;
    margin-bottom: 4px;
    border-bottom: 1px solid #444;
    padding-bottom: 2px;
  }
  #cp-inspector-body {
    color: #e0e0e0;
    margin-bottom: 6px;
    max-height: 140px;
    overflow-y: auto;
  }
  #cp-inspector-footer {
    font-size: 10px;
    color: #00ffcc;
    font-weight: bold;
    text-align: center;
    border-top: 1px solid #333;
    padding-top: 4px;
  }
</style>
`;

      const injectedBody = `
<div id="cp-inspector">
  <div id="cp-inspector-title">Action Preview</div>
  <div id="cp-inspector-body">Loading...</div>
  <div id="cp-inspector-footer">[CALL / OK] Confirm &nbsp;|&nbsp; [#] Close</div>
</div>

<script>
(function() {
  try {
    window.localStorage.setItem('showdown_crossteams', 'false');
  } catch (e) {}

  var activeInspectType = null; // 'move' | 'switch'
  var activeInspectIndex = null; // 1-6

  function hideInspector() {
    var el = document.getElementById('cp-inspector');
    if (el) el.style.display = 'none';
    activeInspectType = null;
    activeInspectIndex = null;
  }

  function showInspector(title, bodyHtml, type, index) {
    var el = document.getElementById('cp-inspector');
    var titleEl = document.getElementById('cp-inspector-title');
    var bodyEl = document.getElementById('cp-inspector-body');
    if (!el || !titleEl || !bodyEl) return;

    titleEl.innerHTML = title;
    bodyEl.innerHTML = bodyHtml;
    el.style.display = 'block';
    activeInspectType = type;
    activeInspectIndex = index;
  }

  // 1. Intercept D-Pad Left/Right to preserve native spatial navigation
  function interceptDpad(e) {
    var key = e.key;
    var code = e.keyCode || e.which;
    var isHorizontal = (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Left' || key === 'Right' || code === 37 || code === 39);

    if (isHorizontal) {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      e.stopImmediatePropagation();
    }
  }

  ['keydown', 'keyup'].forEach(function(evt) {
    window.addEventListener(evt, interceptDpad, true);
    document.addEventListener(evt, interceptDpad, true);
  });

  // 2. Keypad Inspector & Confirmation Logic
  window.addEventListener('keydown', function(e) {
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    var key = e.key;
    var code = e.keyCode || e.which;

    var isCallOrOk = (
      key === 'Enter' || key === 'Call' || key === 'F3' ||
      code === 13 || code === 170 || code === 114
    );

    // CONFIRM ACTION via CALL / CENTER KEY
    if (isCallOrOk && activeInspectType) {
      if (activeInspectType === 'move') {
        var moveBtn = document.querySelector('button[name="chooseMove"][value="' + activeInspectIndex + '"]');
        if (moveBtn) moveBtn.click();
      } else if (activeInspectType === 'switch') {
        var switchBtn = document.querySelector('button[name="chooseSwitch"][value="' + activeInspectIndex + '"]');
        if (switchBtn) switchBtn.click();
      }
      hideInspector();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // CLOSE INSPECTOR OR UNDO (#)
    if (key === '#' || key === 'Escape') {
      if (activeInspectType) {
        hideInspector();
        e.preventDefault();
      } else {
        var undo = document.querySelector('button[name="undo"]');
        if (undo) undo.click();
      }
      return;
    }

    // TERA / GIMMICK (*)
    if (key === '*') {
      var tera = document.querySelector('input[name="terastallize"], input[name="megaEvolution"]');
      if (tera) {
        tera.click();
        e.preventDefault();
      }
      return;
    }

    // MOVES (1 - 4)
    if (['1', '2', '3', '4'].includes(key)) {
      var moveIndex = key;
      if (activeInspectType === 'move' && activeInspectIndex === moveIndex) {
        hideInspector();
      } else {
        inspectMove(moveIndex);
      }
      e.preventDefault();
      return;
    }

    // SWITCHES (5 - 0 -> Slots 1 - 6)
    var switchMap = { '5': '1', '6': '2', '7': '3', '8': '4', '9': '5', '0': '6' };
    if (switchMap[key]) {
      var slotIndex = switchMap[key];
      if (activeInspectType === 'switch' && activeInspectIndex === slotIndex) {
        hideInspector();
      } else {
        inspectPokemon(slotIndex);
      }
      e.preventDefault();
      return;
    }
  });

  // Extract Move Details
  function inspectMove(index) {
    var moveBtn = document.querySelector('button[name="chooseMove"][value="' + index + '"]');
    if (!moveBtn) return;

    var room = window.app && app.curSideRoom;
    var reqMove = room && room.request && room.request.active && room.request.active[0] && room.request.active[0].moves[index - 1];

    var name = moveBtn.getAttribute('data-move') || moveBtn.innerText.split('\\n')[0] || ('Move ' + index);
    var details = '';

    if (reqMove) {
      details += '<div><b>Move:</b> ' + (reqMove.move || name) + '</div>';
      details += '<div><b>PP:</b> ' + (reqMove.pp !== undefined ? (reqMove.pp + '/' + reqMove.maxpp) : 'N/A') + '</div>';
      if (reqMove.target) details += '<div><b>Target:</b> ' + reqMove.target + '</div>';
      if (reqMove.disabled) details += '<div style="color:#ff5555;"><b>[DISABLED]</b></div>';
    } else {
      details = '<div>' + moveBtn.innerText.replace(/\\n/g, '<br>') + '</div>';
    }

    showInspector('⚡ Move ' + index + ': ' + name, details, 'move', index);
  }

  // Extract Switch Slot Details
  function inspectPokemon(slot) {
    var switchBtn = document.querySelector('button[name="chooseSwitch"][value="' + slot + '"]');
    if (!switchBtn) return;

    var room = window.app && app.curSideRoom;
    var mon = room && room.request && room.request.side && room.request.side.pokemon && room.request.side.pokemon[slot - 1];

    var name = mon ? (mon.details.split(',')[0]) : ('Slot ' + slot);
    var html = '';

    if (mon) {
      html += '<div><b>HP:</b> ' + mon.condition + '</div>';
      if (mon.item) html += '<div><b>Item:</b> ' + mon.item + '</div>';
      if (mon.ability) html += '<div><b>Ability:</b> ' + mon.ability + '</div>';
      if (mon.teraType) html += '<div><b>Tera Type:</b> ' + mon.teraType + '</div>';
      if (mon.moves && mon.moves.length) {
        html += '<div style="margin-top:4px;"><b>Moves:</b> ' + mon.moves.join(', ') + '</div>';
      }
      if (mon.active) html += '<div style="color:#00ffcc;"><b>[CURRENTLY ACTIVE]</b></div>';
    } else {
      html = '<div>' + switchBtn.innerText.replace(/\\n/g, '<br>') + '</div>';
    }

    showInspector('🔄 Slot ' + slot + ': ' + name, html, 'switch', slot);
  }

  // 3. App Patching and Auto-Connect Loop
  function patchShowdown() {
    if (window.app) {
      app.focusPrevRoom = function() {};
      app.focusNextRoom = function() {};
    }
  }

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
      patchShowdown();
      if (window.app && typeof app.connect === 'function' && !app.connection) {
        app.connect();
        return true;
      }
    } catch (err) {}
    return false;
  }

  var pollCount = 0;
  var connectInterval = setInterval(function() {
    pollCount++;
    patchShowdown();
    if (attemptConnect() || pollCount > 200) {
      clearInterval(connectInterval);
    }
  }, 50);

  window.addEventListener('load', function() {
    setTimeout(attemptConnect, 100);
  });
})();
</script>`;

      text = text.replace("<head>", `<head>${injectedHead}`);
      text = text.includes("</body>")
        ? text.replace("</body>", `${injectedBody}</body>`)
        : text + injectedBody;

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
  if (socket && socket.destroy) socket.destroy();
});

// ---------------------------------------------------------------------------
// 1. Short-Circuit Trackers & Ad Networks
// ---------------------------------------------------------------------------
app.get([
  /(analytics\.js|gtag\/js|ga\.js)/,
  /ad-manager\.js/,
  /pubads.*\.js/,
  /adx-floors\.js/,
  /afihbs\.js/,
], (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.send("// Ad/Analytics disabled by proxy");
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
