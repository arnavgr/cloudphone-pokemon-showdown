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

// Force uncompressed transfer so string/HTML replacement functions reliably
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
  /* 1. Neutralize Showdown hover tooltips completely */
  #tooltipwrapper, .tooltip, .tooltipwrapper, div[class*="tooltip"], .battle-log-tag {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    position: absolute !important;
    top: -9999px !important;
    height: 0 !important;
    width: 0 !important;
  }

  /* 2. Distinct spatial focus indicator */
  button:focus, a:focus, input:focus, select:focus {
    outline: 3px solid #ffcc00 !important;
    outline-offset: 1px !important;
    box-shadow: 0 0 8px #ffcc00 !important;
  }

  /* 3. QVGA Action Inspector Modal */
  #cp-inspector {
    position: fixed;
    top: 28px;
    left: 4px;
    right: 4px;
    background: rgba(14, 18, 24, 0.98);
    border: 2px solid #ffd700;
    border-radius: 6px;
    color: #ffffff;
    padding: 8px;
    z-index: 2147483647;
    font-family: sans-serif;
    font-size: 11px;
    line-height: 1.35;
    box-shadow: 0 4px 16px rgba(0,0,0,0.9);
  }
  #cp-inspector-title {
    font-size: 12px;
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
<script>
(function() {
  try {
    window.localStorage.setItem('showdown_crossteams', 'false');
  } catch (e) {}

  var activeInspectType = null; // 'move' | 'switch'
  var activeInspectIndex = null; // 1 - 6

  function getInspectorEl() {
    var el = document.getElementById('cp-inspector');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-inspector';
      el.style.display = 'none';
      el.innerHTML = '<div id="cp-inspector-title"></div><div id="cp-inspector-body"></div><div id="cp-inspector-footer">[CALL / OK] Confirm &nbsp;|&nbsp; [#] Close</div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideInspector() {
    var el = getInspectorEl();
    el.style.display = 'none';
    activeInspectType = null;
    activeInspectIndex = null;
  }

  function showInspector(title, bodyHtml, type, index) {
    var el = getInspectorEl();
    var titleEl = document.getElementById('cp-inspector-title');
    var bodyEl = document.getElementById('cp-inspector-body');

    titleEl.innerHTML = title;
    bodyEl.innerHTML = bodyHtml;
    el.style.display = 'block';
    activeInspectType = type;
    activeInspectIndex = index;
  }

  function getBattleRoom() {
    if (!window.app) return null;
    if (app.curRoom && app.curRoom.battle) return app.curRoom;
    if (app.curSideRoom && app.curSideRoom.battle) return app.curSideRoom;
    if (app.rooms) {
      for (var k in app.rooms) {
        if (app.rooms[k] && app.rooms[k].battle) return app.rooms[k];
      }
    }
    return app.curRoom || app.curSideRoom || null;
  }

  // 1. Horizontal D-Pad Isolation (ArrowLeft: 37, ArrowRight: 39)
  function interceptDpad(e) {
    var key = e.key;
    var code = e.keyCode || e.which;
    var isHorizontal = (key === 'ArrowLeft' || key === 'ArrowRight' || code === 37 || code === 39);

    if (isHorizontal) {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      e.stopImmediatePropagation();
    }
  }

  ['keydown', 'keyup'].forEach(function(evt) {
    window.addEventListener(evt, interceptDpad, true);
    document.addEventListener(evt, interceptDpad, true);
  });

  // 2. Hardware Matrix Key Listener
  window.addEventListener('keydown', function(e) {
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    var key = e.key;
    var code = e.keyCode || e.which;
    var eventCode = e.code;

    // --- CALL (0) / ENTER (13) -> CONFIRM ---
    var isCall = (key === 'Call' || code === 0);
    var isEnter = (key === 'Enter' || code === 13);

    if ((isCall || isEnter) && activeInspectType) {
      if (activeInspectType === 'move') {
        var moveBtn = document.querySelector('button[name="chooseMove"][value="' + activeInspectIndex + '"]') ||
                      document.querySelectorAll('button[name="chooseMove"]')[activeInspectIndex - 1];
        if (moveBtn) moveBtn.click();
      } else if (activeInspectType === 'switch') {
        var switchBtn = document.querySelector('button[name="chooseSwitch"][value="' + activeInspectIndex + '"]') ||
                        document.querySelectorAll('button[name="chooseSwitch"]')[activeInspectIndex - 1];
        if (switchBtn) switchBtn.click();
      }
      hideInspector();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // --- # (KEY '#' / CODE 51) / ESCAPE (27) -> CLOSE OR UNDO ---
    // Evaluated via key === '#' to prevent colliding with digit '3' (which shares code 51)
    if (key === '#' || key === 'Hash' || key === 'Pound' || key === 'Escape' || code === 27) {
      if (activeInspectType) {
        hideInspector();
      } else {
        var undoBtn = document.querySelector('button[name="undo"], button[name="clearMove"], button[name="chooseUndo"], button[value="undo"], button[value="cancel"]');
        if (undoBtn) {
          undoBtn.click();
        } else {
          var room = getBattleRoom();
          if (room && typeof room.send === 'function') {
            room.send('/undo');
          }
        }
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // --- * (106 / NumpadMultiply) -> TERA / GIMMICK ---
    if (key === '*' || code === 106 || eventCode === 'NumpadMultiply') {
      var tera = document.querySelector('input[name="terastallize"], input[name="megaEvolution"]');
      if (tera) {
        tera.click();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }

    // --- MOVES (1 - 4) ---
    if (key === '1' || key === '2' || key === '3' || key === '4') {
      var moveIndex = key;
      if (activeInspectType === 'move' && activeInspectIndex === moveIndex) {
        hideInspector();
      } else {
        inspectMove(moveIndex);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // --- SWITCH SLOTS (5 - 0 -> Slots 1 - 6) ---
    var switchMap = { '5': '1', '6': '2', '7': '3', '8': '4', '9': '5', '0': '6' };
    if (switchMap[key]) {
      var slotIndex = switchMap[key];
      if (activeInspectType === 'switch' && activeInspectIndex === slotIndex) {
        hideInspector();
      } else {
        inspectPokemon(slotIndex);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }, true);

  // Extract Detailed Move Info
  function inspectMove(index) {
    var moveBtn = document.querySelector('button[name="chooseMove"][value="' + index + '"]') ||
                  document.querySelectorAll('button[name="chooseMove"]')[index - 1];
    if (!moveBtn) return;

    var room = getBattleRoom();
    var reqMove = room && room.request && room.request.active && room.request.active[0] && room.request.active[0].moves[index - 1];

    var rawName = moveBtn.getAttribute('data-move') || moveBtn.innerText.split('\\n')[0] || ('Move ' + index);
    var moveId = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
    var dexData = (window.BattleMovedex && BattleMovedex[moveId]) ? BattleMovedex[moveId] : null;

    var html = '';
    var moveName = dexData ? dexData.name : (reqMove ? reqMove.move : rawName);
    var type = dexData ? dexData.type : 'Standard';
    var category = dexData ? dexData.category : '';
    var bp = dexData ? (dexData.basePower || '—') : '—';
    var acc = dexData ? (dexData.accuracy === true ? '—' : dexData.accuracy + '%') : '—';
    var ppText = reqMove && reqMove.pp !== undefined ? (reqMove.pp + '/' + reqMove.maxpp) : '—';

    html += '<div><b>Type:</b> ' + type + ' ' + (category ? '(' + category + ')' : '') + '</div>';
    html += '<div><b>Power:</b> ' + bp + ' &nbsp;|&nbsp; <b>Acc:</b> ' + acc + ' &nbsp;|&nbsp; <b>PP:</b> ' + ppText + '</div>';

    if (dexData && (dexData.shortDesc || dexData.desc)) {
      html += '<div style="margin-top:4px;color:#bbb;">' + (dexData.shortDesc || dexData.desc) + '</div>';
    } else {
      html += '<div style="margin-top:4px;color:#bbb;">' + moveBtn.innerText.replace(/\\n/g, ' ') + '</div>';
    }

    if (reqMove && reqMove.disabled) {
      html += '<div style="color:#ff5555;font-weight:bold;margin-top:2px;">[DISABLED]</div>';
    }

    showInspector('⚡ [' + index + '] ' + moveName, html, 'move', index);
  }

  // Extract Detailed Switch Slot Info
  function inspectPokemon(slot) {
    var switchBtn = document.querySelector('button[name="chooseSwitch"][value="' + slot + '"]') ||
                    document.querySelectorAll('button[name="chooseSwitch"]')[slot - 1];
    if (!switchBtn) return;

    var room = getBattleRoom();
    var mon = room && room.request && room.request.side && room.request.side.pokemon && room.request.side.pokemon[slot - 1];

    var name = mon ? mon.details.split(',')[0] : ('Slot ' + slot);
    var html = '';

    if (mon) {
      html += '<div><b>HP:</b> ' + mon.condition + '</div>';
      if (mon.item) html += '<div><b>Item:</b> ' + mon.item + '</div>';
      if (mon.ability) html += '<div><b>Ability:</b> ' + mon.ability + '</div>';
      if (mon.teraType) html += '<div><b>Tera Type:</b> ' + mon.teraType + '</div>';
      if (mon.moves && mon.moves.length) {
        html += '<div style="margin-top:4px;"><b>Moves:</b> ' + mon.moves.join(', ') + '</div>';
      }
      if (mon.active) html += '<div style="color:#00ffcc;font-weight:bold;margin-top:2px;">[CURRENTLY IN BATTLE]</div>';
    } else {
      html = '<div>' + switchBtn.innerText.replace(/\\n/g, '<br>') + '</div>';
    }

    showInspector('🔄 [Slot ' + slot + '] ' + name, html, 'switch', slot);
  }

  // 3. Disable Showdown Tooltips & Room Switchers
  function patchShowdown() {
    if (window.BattleTooltips) {
      BattleTooltips.prototype.showTooltip = function() {};
      BattleTooltips.prototype.showMoveTooltip = function() {};
      BattleTooltips.prototype.showPokemonTooltip = function() {};
      BattleTooltips.prototype.hideTooltip = function() {};
    }
    if (window.app) {
      app.showTooltip = function() {};
      app.focusPrevRoom = function() {};
      app.focusNextRoom = function() {};
    }
  }

  // 4. Auto-Connect Polling Loop
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
