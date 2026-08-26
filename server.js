import express from "express";
import http from "http";
import httpProxy from "http-proxy";

const LEGACY_PORT = Number(process.env.LEGACY_PORT || 3001);
const PORT = Number(process.env.PORT || 3000);

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
  if (req.headers.host) proxyReq.setHeader("host", req.headers.host);
});

const opponentInspectorPatch = `
<script>
(function () {
  // CloudPhone inspector fix: the old inspector indexed the opponent's
  // initially discovered team order. This patch reads the live BattleRoom
  // state instead, so key 1 always describes the currently active foe.
  function getCurrentBattle() {
    try {
      if (window.app) {
        if (window.app.curRoom && window.app.curRoom.battle) return window.app.curRoom.battle;
        if (window.app.curRoom && window.app.curRoom.room && window.app.curRoom.room.battle) return window.app.curRoom.room.battle;
        var rooms = window.app.rooms;
        if (rooms) {
          var values = Array.isArray(rooms) ? rooms : Object.keys(rooms).map(function (k) { return rooms[k]; });
          for (var i = 0; i < values.length; i++) {
            if (values[i] && values[i].battle) return values[i].battle;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function getActiveOpponent(battle) {
    if (!battle) return null;
    var side = battle.mySide && battle.mySide.foe;
    if (!side && battle.nearSide && battle.nearSide.foe) side = battle.nearSide.foe;
    if (!side && battle.farSide) side = battle.farSide;
    if (!side) return null;

    var active = side.active;
    if (Array.isArray(active)) {
      for (var i = 0; i < active.length; i++) {
        if (active[i] && !active[i].fainted) return active[i];
      }
      for (var j = 0; j < active.length; j++) {
        if (active[j]) return active[j];
      }
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function normaliseMoveName(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0] || '';
    return value.name || value.move || value.id || '';
  }

  function getKnownMoves(pokemon) {
    var result = [];
    var seen = Object.create(null);
    function add(value) {
      var name = normaliseMoveName(value);
      if (!name) return;
      var id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!id || seen[id]) return;
      seen[id] = true;
      result.push(name);
    }

    // moveTrack is the client's battle-memory for moves the opponent has
    // actually used/revealed. Do not use the species' complete movepool.
    if (pokemon && Array.isArray(pokemon.moveTrack)) {
      pokemon.moveTrack.forEach(add);
    }

    // Some client generations also populate pokemon.moves with revealed moves.
    if (pokemon && Array.isArray(pokemon.moves)) {
      pokemon.moves.forEach(add);
    }

    return result;
  }

  function getInspector() {
    var el = document.getElementById('cp-inspector');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-inspector';
      el.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:224px!important;max-height:265px!important;background:#0e121a!important;border:2px solid #ffd700!important;border-radius:6px!important;color:#fff!important;padding:6px 8px!important;z-index:2147483647!important;font-family:sans-serif!important;font-size:10px!important;line-height:1.3!important;box-shadow:0 0 20px rgba(0,0,0,.95)!important;box-sizing:border-box!important;display:none;overflow-y:auto!important;';
      el.innerHTML = '<div id="cp-insp-title" style="font-size:11px;font-weight:bold;color:#ffd700;margin-bottom:3px;border-bottom:1px solid #333;padding-bottom:2px"></div><div id="cp-insp-body" style="color:#e0e0e0;margin-bottom:5px;max-height:200px;overflow-y:auto"></div><div id="cp-insp-footer" style="font-size:9px;color:#00ffcc;font-weight:bold;text-align:center;border-top:1px solid #333;padding-top:3px">[1] Active opponent | [#] Close</div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function showActiveOpponent() {
    var battle = getCurrentBattle();
    var pokemon = getActiveOpponent(battle);
    if (!pokemon) return false;

    var el = getInspector();
    var title = document.getElementById('cp-insp-title');
    var body = document.getElementById('cp-insp-body');
    var name = pokemon.name || pokemon.speciesForme || pokemon.species || pokemon.details || 'Unknown';
    var hp = pokemon.hp != null && pokemon.maxhp ? Math.round((pokemon.hp / pokemon.maxhp) * 100) + '%' : (pokemon.hp != null ? String(pokemon.hp) : '?');
    var moves = getKnownMoves(pokemon);

    if (title) title.innerHTML = 'Opponent Active: ' + escapeHtml(name);

    var html = '<div><b>HP:</b> ' + escapeHtml(hp);
    if (pokemon.status) html += ' <span style="color:#ff9999">[' + escapeHtml(pokemon.status) + ']</span>';
    html += '</div>';

    if (pokemon.types && pokemon.types.length) {
      html += '<div><b>Types:</b> ' + escapeHtml(pokemon.types.join(' / ')) + '</div>';
    }
    if (pokemon.ability || pokemon.baseAbility) {
      html += '<div><b>Ability:</b> ' + escapeHtml(pokemon.ability || pokemon.baseAbility) + '</div>';
    }
    if (pokemon.item) html += '<div><b>Item:</b> ' + escapeHtml(pokemon.item) + '</div>';

    html += '<div style="margin-top:4px;border-top:1px solid #333;padding-top:3px"><b>Known Moves:</b></div>';
    if (moves.length) {
      html += '<div style="margin-top:2px">' + moves.map(function (m) { return '<div>✓ ' + escapeHtml(m) + '</div>'; }).join('') + '</div>';
    } else {
      html += '<div style="color:#999">No moves revealed yet.</div>';
    }

    if (body) body.innerHTML = html;
    el.style.setProperty('display', 'block', 'important');
    return true;
  }

  // Capture phase prevents the old slot-1 inspector from opening underneath
  // this one. Numpad 1 and the normal number-row 1 are both supported.
  document.addEventListener('keydown', function (event) {
    if (event.repeat) return;
    var isOne = event.key === '1' || event.code === 'Digit1' || event.code === 'Numpad1';
    if (!isOne) return;
    if (showActiveOpponent()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
</script>
`;

proxy.on("proxyRes", (proxyRes, req, res) => {
  const publicHost = req.headers.host || "";
  const path = req.url.split("?", 1)[0];
  const isConfig = path === "/config/config.js";
  const contentType = proxyRes.headers["content-type"] || "";
  const isHtml = contentType.includes("text/html");

  const cookies = proxyRes.headers["set-cookie"];
  if (cookies) {
    proxyRes.headers["set-cookie"] = (Array.isArray(cookies) ? cookies : [cookies])
      .map(cookie => cookie.replace(/;\s*Domain=[^;]+/i, ""));
  }

  delete proxyRes.headers["access-control-allow-origin"];
  delete proxyRes.headers["access-control-allow-credentials"];

  const location = proxyRes.headers["location"];
  if (location && publicHost) {
    proxyRes.headers["location"] = location
      .replace("https://play.pokemonshowdown.com", `https://${publicHost}`)
      .replace("http://play.pokemonshowdown.com", `https://${publicHost}`);
  }

  if (!isConfig && !isHtml) {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
    return;
  }

  const chunks = [];
  proxyRes.on("data", chunk => chunks.push(chunk));
  proxyRes.on("end", () => {
    let body = Buffer.concat(chunks).toString("utf8");

    if (isConfig) {
      body += `\nConfig.routes = Config.routes || {};\nConfig.routes.client = ${JSON.stringify(publicHost)};\n`;
    } else if (isHtml) {
      // server-legacy has already injected its normal CloudPhone script. Add
      // the active-opponent correction after it so it can take keyboard
      // precedence without modifying the large legacy source file.
      if (!body.includes('CloudPhone inspector fix: the old inspector indexed')) {
        const marker = '</body>';
        if (body.toLowerCase().includes(marker)) {
          body = body.replace(/<\/body>/i, opponentInspectorPatch + '</body>');
        } else {
          body += opponentInspectorPatch;
        }
      }
    }

    delete proxyRes.headers["content-encoding"];
    delete proxyRes.headers["content-length"];
    if (isConfig || isHtml) proxyRes.headers["cache-control"] = "no-store";
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
