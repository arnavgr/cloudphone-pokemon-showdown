import express from "express";
import http from "http";
import httpProxy from "http-proxy";
import zlib from "zlib";

const app = express();
app.set("trust proxy", 1);

const TARGET_WEB = "https://play.pokemonshowdown.com";
const TARGET_SIM = "https://sim3.psim.us";

const webProxy = httpProxy.createProxyServer({
  target: TARGET_WEB,
  changeOrigin: true,
  secure: true,
  selfHandleResponse: true,
});

const simProxy = httpProxy.createProxyServer({
  target: TARGET_SIM,
  changeOrigin: true,
  secure: true,
  ws: true,
});

function forwardClientIp(proxyReq, req) {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (clientIp) {
    proxyReq.setHeader("x-forwarded-for", clientIp);
    proxyReq.setHeader("x-real-ip", clientIp.split(",")[0].trim());
  }
}

webProxy.on("proxyReq", (proxyReq, req) => {
  forwardClientIp(proxyReq, req);
});

simProxy.on("proxyReqWs", (proxyReq, req) => {
  forwardClientIp(proxyReq, req);
});

function sanitizeHeaders(proxyRes) {
  delete proxyRes.headers["content-security-policy"];
  delete proxyRes.headers["content-security-policy-report-only"];
  delete proxyRes.headers["x-frame-options"];
  delete proxyRes.headers["cross-origin-opener-policy"];
  delete proxyRes.headers["cross-origin-embedder-policy"];
  proxyRes.headers["access-control-allow-origin"] = "*";
  proxyRes.headers["access-control-allow-credentials"] = "true";

  const setCookie = proxyRes.headers["set-cookie"];
  if (setCookie) {
    proxyRes.headers["set-cookie"] = (
      Array.isArray(setCookie) ? setCookie : [setCookie]
    ).map((cookie) => cookie.replace(/;\s*Domain=[^;]+/i, ""));
  }
}

function decompressBuffer(buffer, encoding) {
  if (!buffer || buffer.length === 0) return buffer;
  try {
    if (encoding === "gzip" || encoding === "deflate") {
      return zlib.unzipSync(buffer);
    } else if (encoding === "br") {
      return zlib.brotliDecompressSync(buffer);
    }
  } catch (e) {
    return buffer;
  }
  return buffer;
}

webProxy.on("proxyRes", sanitizeHeaders);

webProxy.on("proxyRes", (proxyRes, req, res) => {
  const publicHost = req.headers.host || "";
  const location = proxyRes.headers["location"];
  if (location && publicHost) {
    proxyRes.headers["location"] = location
      .replace("https://play.pokemonshowdown.com", `https://${publicHost}`)
      .replace("http://play.pokemonshowdown.com", `https://${publicHost}`);
  }

  const chunks = [];
  proxyRes.on("data", (chunk) => chunks.push(chunk));
  proxyRes.on("end", () => {
    let body = Buffer.concat(chunks);
    const contentType = proxyRes.headers["content-type"] || "";
    const contentEncoding = proxyRes.headers["content-encoding"];

    if (contentType.includes("text/html")) {
      body = decompressBuffer(body, contentEncoding);
      delete proxyRes.headers["content-encoding"];

      let text = body.toString("utf8");
      text = text.split("//play.pokemonshowdown.com/config/config.js")
                 .join(`//${publicHost}/config/config.js`);

      const injectedHead = `
<style>
  /* 1. Suppression of Native Hover Tooltips */
  #tooltipwrapper,
  .tooltip,
  .tooltipwrapper,
  .tooltip-inner,
  div[class*="tooltip"],
  .battle-log-tag {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    position: absolute !important;
    top: -9999px !important;
    left: -9999px !important;
    width: 0 !important;
    height: 0 !important;
  }

  /* 2. Suppress on-screen mobile chat buttons */
  button[name="openChat"],
  button[name="closeChat"],
  button[name="openBattleLog"],
  button[name="closeBattleLog"],
  .battle-chat-toggle,
  .chat-toggle,
  .battle-log-toggle,
  button.battle-chat-toggle,
  .roomcontrols button[name="openChat"],
  .roomcontrols button[name="openBattleLog"],
  .battle-options-menu {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
    position: absolute !important;
    top: -9999px !important;
    left: -9999px !important;
  }

  /* 3. Hide side chat log in normal view */
  .battle-log, .chat-log {
    display: none !important;
  }

  /* 4. Spatial focus indicator */
  button:focus, a:focus, input:focus, select:focus {
    outline: 2px solid #ffcc00 !important;
    outline-offset: 1px !important;
    box-shadow: 0 0 5px #ffcc00 !important;
  }

  /* 5. Chat Modal Internal Styling */
  #cp-chat-content .chat {
    padding: 2px 0 !important;
    border-bottom: 1px solid rgba(255,255,255,0.05) !important;
  }
  #cp-chat-content .chat strong {
    color: #ffd700 !important;
  }
  #cp-chat-content .battle-history {
    color: #88a0b8 !important;
    font-style: italic !important;
  }

  /* 6. Compact Effectiveness Badges */
  .eff-badge {
    display: inline-block;
    padding: 1px 3px;
    border-radius: 2px;
    font-weight: bold;
    font-size: 8.5px;
    margin: 1px 1px;
  }
  .eff-super { background: #1b5e20; color: #a5d6a7; border: 1px solid #4caf50; }
  .eff-neutral { background: #37474f; color: #eceff1; }
  .eff-resist { background: #b71c1c; color: #ef9a9a; border: 1px solid #e57373; }
  .eff-immune { background: #212121; color: #9e9e9e; border: 1px solid #616161; }
</style>
`;

      const injectedBody = `
<script>
(function() {
  try {
    window.localStorage.setItem('showdown_crossteams', 'false');
  } catch (e) {}

  var activeInspectType = null; // 'move' | 'switch' | 'opponent' | 'myteam'
  var activeInspectIndex = 1;
  var chatSyncTimer = null;

  var TYPE_LIST = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];

  var TYPE_CHART = {
    Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
    Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
    Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
    Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
    Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
    Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
    Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
    Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
    Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
    Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
    Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
    Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Steel: 0.5, Fairy: 0.5 },
    Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
    Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
    Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
    Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
    Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
    Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 }
  };

  function getEffectiveness(moveType, targetTypes) {
    if (!moveType || !targetTypes || !targetTypes.length || !TYPE_CHART[moveType]) return 1;
    var mult = 1;
    for (var i = 0; i < targetTypes.length; i++) {
      var t = targetTypes[i];
      if (TYPE_CHART[moveType][t] !== undefined) mult *= TYPE_CHART[moveType][t];
    }
    return mult;
  }

  function formatMultiplierBadge(mult) {
    if (mult === 0) return '<span class="eff-badge eff-immune">Immune (0×)</span>';
    if (mult >= 2) return '<span class="eff-badge eff-super">Super Eff (' + mult + '×)</span>';
    if (mult <= 0.5) return '<span class="eff-badge eff-resist">Not Eff (' + mult + '×)</span>';
    return '<span class="eff-badge eff-neutral">Neutral (1×)</span>';
  }

  function getItemDesc(itemName) {
    if (!itemName) return '';
    var clean = itemName.replace(/\\s*\\(Lost\\)$/i, '');
    var id = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    var data = (window.BattleItems && BattleItems[id]) || (window.Dex && Dex.items ? Dex.items.get(clean) : null);
    return (data && (data.shortDesc || data.desc)) ? (data.shortDesc || data.desc) : '';
  }

  function getAbilityDesc(abilityName) {
    if (!abilityName) return '';
    var clean = abilityName.replace(/\\s*\\(Possible\\)$/i, '');
    var id = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    var data = (window.BattleAbilities && BattleAbilities[id]) || (window.Dex && Dex.abilities ? Dex.abilities.get(clean) : null);
    return (data && (data.shortDesc || data.desc)) ? (data.shortDesc || data.desc) : '';
  }

  function renderDefensiveProfile(types) {
    var weak = [], resist = [], immune = [];
    for (var i = 0; i < TYPE_LIST.length; i++) {
      var atkT = TYPE_LIST[i];
      var m = getEffectiveness(atkT, types);
      if (m === 0) immune.push(atkT);
      else if (m > 1) weak.push(atkT + ' (' + m + '×)');
      else if (m < 1) resist.push(atkT + ' (' + m + '×)');
    }
    var html = '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Defensive Profile:</b></div>';
    if (weak.length) html += '<div style="margin:1px 0;"><span style="color:#a5d6a7;font-weight:bold;">Weak:</span> ' + weak.join(', ') + '</div>';
    if (resist.length) html += '<div style="margin:1px 0;"><span style="color:#ef9a9a;font-weight:bold;">Resist:</span> ' + resist.join(', ') + '</div>';
    if (immune.length) html += '<div style="margin:1px 0;"><span style="color:#9e9e9e;font-weight:bold;">Immune:</span> ' + immune.join(', ') + '</div>';
    return html;
  }

  function getInspectorEl() {
    var el = document.getElementById('cp-inspector');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-inspector';
      el.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:224px!important;max-height:265px!important;background:#0e121a!important;border:2px solid #ffd700!important;border-radius:6px!important;color:#fff!important;padding:6px 8px!important;z-index:2147483647!important;font-family:sans-serif!important;font-size:10px!important;line-height:1.3!important;box-shadow:0 0 20px rgba(0,0,0,0.95)!important;box-sizing:border-box!important;display:none;overflow-y:auto!important;';
      el.innerHTML = '<div id="cp-insp-title" style="font-size:11px;font-weight:bold;color:#ffd700;margin-bottom:3px;border-bottom:1px solid #333;padding-bottom:2px;"></div><div id="cp-insp-body" style="color:#e0e0e0;margin-bottom:5px;max-height:200px;overflow-y:auto;"></div><div id="cp-insp-footer" style="font-size:9px;color:#00ffcc;font-weight:bold;text-align:center;border-top:1px solid #333;padding-top:3px;">[CALL/OK] Use | [D-Pad] Cycle | [#] Close</div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideInspector() {
    var el = getInspectorEl();
    el.style.setProperty('display', 'none', 'important');
    activeInspectType = null;
  }

  function showInspector(title, bodyHtml, type, index) {
    hideChatModal();
    var el = getInspectorEl();
    var titleEl = document.getElementById('cp-insp-title');
    var bodyEl = document.getElementById('cp-insp-body');

    if (titleEl) titleEl.innerHTML = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;

    el.style.setProperty('display', 'block', 'important');
    activeInspectType = type;
    activeInspectIndex = Number(index) || 1;
  }

  function getChatModalEl() {
    var el = document.getElementById('cp-chat-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-chat-modal';
      el.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:226px!important;height:270px!important;background:#0c1016!important;border:2px solid #00ffcc!important;border-radius:6px!important;color:#e0e0e0!important;padding:6px!important;z-index:2147483646!important;font-family:sans-serif!important;font-size:10px!important;line-height:1.25!important;box-shadow:0 0 22px rgba(0,0,0,0.98)!important;box-sizing:border-box!important;display:none;flex-direction:column!important;';
      el.innerHTML = '<div style="font-size:10.5px;font-weight:bold;color:#00ffcc;border-bottom:1px solid #333;padding-bottom:2px;margin-bottom:3px;display:flex;justify-content:space-between;"><span>💬 Battle Log & Chat</span><span style="color:#888;font-size:9px;">[#] Close</span></div>' +
                     '<div id="cp-chat-content" style="flex:1!important;overflow-y:auto!important;margin-bottom:4px;padding-right:2px;word-break:break-word;"></div>' +
                     '<form id="cp-chat-form" style="display:flex;gap:3px;margin:0;padding:0;">' +
                       '<input type="text" id="cp-chat-input" placeholder="Type msg..." style="flex:1;min-width:0;background:#18202c;border:1px solid #00ffcc;border-radius:3px;color:#fff;font-size:9.5px;padding:2px 4px;box-sizing:border-box;" />' +
                       '<button type="submit" style="background:#00aa88;border:none;border-radius:3px;color:#fff;font-size:9px;font-weight:bold;padding:0 6px;cursor:pointer;">Send</button>' +
                     '</form>' +
                     '<div style="font-size:8px;color:#777;text-align:center;margin-top:2px;">[D-Pad Up/Down] Scroll &nbsp;|&nbsp; [OK] Type/Send</div>';
      document.body.appendChild(el);

      var form = document.getElementById('cp-chat-form');
      if (form) {
        form.addEventListener('submit', function(ev) {
          ev.preventDefault();
          submitChatMessage();
        });
      }
    }
    return el;
  }

  function isChatModalOpen() {
    var el = getChatModalEl();
    return el && el.style.display === 'flex';
  }

  function syncChatContent() {
    var contentEl = document.getElementById('cp-chat-content');
    if (!contentEl) return;

    var logSources = [
      document.querySelector('.battle-log .inner'),
      document.querySelector('.battle-log'),
      document.querySelector('.chat-log .inner'),
      document.querySelector('.chat-log')
    ];

    var sourceEl = null;
    for (var i = 0; i < logSources.length; i++) {
      if (logSources[i] && logSources[i].innerHTML.trim().length > 0) {
        sourceEl = logSources[i];
        break;
      }
    }

    if (sourceEl) {
      var isNearBottom = (contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight) < 45;
      if (contentEl.innerHTML !== sourceEl.innerHTML) {
        contentEl.innerHTML = sourceEl.innerHTML;
        if (isNearBottom) contentEl.scrollTop = contentEl.scrollHeight;
      }
    } else if (contentEl.children.length === 0) {
      contentEl.innerHTML = '<div style="color:#777;padding:10px 0;text-align:center;">No log or messages yet.</div>';
    }
  }

  function submitChatMessage() {
    var input = document.getElementById('cp-chat-input');
    if (!input) return;
    var msg = input.value.trim();
    if (!msg) return;

    var room = getBattleRoom();
    if (room && typeof room.send === 'function') room.send(msg);
    else if (window.app && typeof app.send === 'function') app.send(msg);

    input.value = '';
    setTimeout(syncChatContent, 100);
  }

  function hideChatModal() {
    var el = getChatModalEl();
    el.style.setProperty('display', 'none', 'important');
    if (chatSyncTimer) {
      clearInterval(chatSyncTimer);
      chatSyncTimer = null;
    }
  }

  function toggleChatModal() {
    hideInspector();
    var el = getChatModalEl();
    if (isChatModalOpen()) {
      hideChatModal();
      return;
    }

    el.style.setProperty('display', 'flex', 'important');
    syncChatContent();
    var contentEl = document.getElementById('cp-chat-content');
    if (contentEl) contentEl.scrollTop = contentEl.scrollHeight;

    if (!chatSyncTimer) {
      chatSyncTimer = setInterval(syncChatContent, 400);
    }
  }

  function getBattleRoom() {
    if (!window.app) return null;
    var room = app.curRoom || app.curSideRoom;
    if (room && room.battle) return room;
    if (app.rooms) {
      for (var k in app.rooms) {
        if (app.rooms[k] && app.rooms[k].battle) return app.rooms[k];
      }
    }
    return room || null;
  }

  function getBattleRequest() {
    var room = getBattleRoom();
    if (room && room.request) return room.request;
    if (room && room.battle && room.battle.request) return room.battle.request;
    return null;
  }

  function getValidSwitchSlots() {
    var req = getBattleRequest();
    var valid = [];
    if (req && req.side && req.side.pokemon) {
      for (var i = 0; i < req.side.pokemon.length; i++) {
        var p = req.side.pokemon[i];
        var isDead = p.condition && p.condition.includes('fnt');
        if (!p.active && !isDead) {
          valid.push(i + 1);
        }
      }
    }
    return valid.length > 0 ? valid : [1];
  }

  function getOpponentActive() {
    var room = getBattleRoom();
    if (!room || !room.battle) return null;
    var b = room.battle;

    if (b.farSide && b.farSide.active && b.farSide.active[0]) return b.farSide.active[0];
    if (b.yourSide && b.yourSide.active && b.yourSide.active[0]) return b.yourSide.active[0];
    if (b.foe && b.foe.active && b.foe.active[0]) return b.foe.active[0];

    if (b.sides && b.sides.length) {
      var myIndex = (b.mySide && b.mySide.n !== undefined) ? b.mySide.n : 0;
      var foeIndex = (myIndex === 0) ? 1 : 0;
      if (b.sides[foeIndex] && b.sides[foeIndex].active && b.sides[foeIndex].active[0]) {
        return b.sides[foeIndex].active[0];
      }
    }

    if (b.p1 && b.p2) {
      var mySideId = b.mySide ? b.mySide.id : 'p1';
      var foeObj = (mySideId === 'p1') ? b.p2 : b.p1;
      if (foeObj && foeObj.active && foeObj.active[0]) return foeObj.active[0];
    }
    return null;
  }

  function getFoeTeam() {
    var room = getBattleRoom();
    if (!room || !room.battle) return [];
    var b = room.battle;
    var foeSide = (b.mySide && b.mySide.foe) || b.farSide || (b.sides && (b.mySide && b.mySide.n === 0 ? b.sides[1] : b.sides[0])) || b.foe;
    if (!foeSide) return [];

    var active = (foeSide.active && foeSide.active[0]) ? foeSide.active[0] : getOpponentActive();
    var list = [];
    if (active) list.push(active);

    if (foeSide.pokemon && foeSide.pokemon.length) {
      for (var i = 0; i < foeSide.pokemon.length; i++) {
        var p = foeSide.pokemon[i];
        if (p && p !== active && list.indexOf(p) === -1) {
          list.push(p);
        }
      }
    }
    return list;
  }

  function getMyTeam() {
    var req = getBattleRequest();
    if (req && req.side && req.side.pokemon && req.side.pokemon.length) {
      return req.side.pokemon;
    }
    var room = getBattleRoom();
    if (room && room.battle) {
      var b = room.battle;
      var mySide = b.yourSide || (b.sides && (b.mySide && b.mySide.n !== undefined ? b.sides[b.mySide.n] : b.sides[0])) || b.mySide;
      if (mySide && mySide.pokemon) return mySide.pokemon;
    }
    return [];
  }

  function getOpponentTypes(customFoe) {
    var foe = customFoe || getOpponentActive();
    if (!foe) return [];

    if (foe.terastallized && typeof foe.terastallized === 'string' && foe.terastallized !== 'Stellar') {
      return [foe.terastallized];
    }
    if (foe.terastallized && foe.teraType && foe.teraType !== 'Stellar') {
      return [foe.teraType];
    }

    if (foe.types && foe.types.length) return foe.types;
    if (foe.speciesData && foe.speciesData.types) return foe.speciesData.types;

    var raw = (foe.species || foe.name || '').replace(/^p[12]:\\s*/i, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (window.BattlePokedex && BattlePokedex[raw] && BattlePokedex[raw].types) {
      return BattlePokedex[raw].types;
    }
    if (window.Dex && Dex.species && Dex.species.get(raw)) {
      return Dex.species.get(raw).types || [];
    }
    return [];
  }

  function getKnownMoves(pokemon) {
    if (!pokemon) return [];
    var list = [];
    var seen = Object.create(null);

    function add(m) {
      if (!m) return;
      var name = '';
      if (typeof m === 'string') name = m;
      else if (Array.isArray(m)) name = m[0] || '';
      else if (typeof m === 'object') name = m.name || m.move || m.id || '';
      name = String(name).trim();
      if (!name) return;
      var id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!id || seen[id]) return;
      seen[id] = true;
      list.push(name);
    }

    if (Array.isArray(pokemon.moveTrack)) pokemon.moveTrack.forEach(add);
    if (Array.isArray(pokemon.moves)) pokemon.moves.forEach(add);

    return list;
  }

  window.addEventListener('keyup', function(e) {
    var code = e.keyCode || e.which;
    var isHorizontal = (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || code === 37 || code === 39);
    if (isHorizontal) {
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('keydown', function(e) {
    var key = e.key || '';
    var code = e.keyCode || e.which || 0;
    var eventCode = e.code || '';

    var isCall = (key === 'Call' || code === 0 || code === 170);
    var isEnter = (key === 'Enter' || code === 13);
    var isHashOrEscape = (key === '#' || key === 'Hash' || key === 'Pound' || key === 'Escape' || code === 27);

    if (isCall) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    var isUp = (key === 'ArrowUp' || code === 38);
    var isDown = (key === 'ArrowDown' || code === 40);

    if (isChatModalOpen()) {
      var chatInput = document.getElementById('cp-chat-input');
      var contentEl = document.getElementById('cp-chat-content');

      if (document.activeElement === chatInput) {
        if (isEnter || isCall) {
          submitChatMessage();
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (isHashOrEscape) {
          chatInput.blur();
          hideChatModal();
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        return;
      }

      if (isUp && contentEl) {
        contentEl.scrollTop -= 35;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (isDown && contentEl) {
        contentEl.scrollTop += 35;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (isEnter || isCall) {
        if (chatInput) chatInput.focus();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (isHashOrEscape || key === '9' || code === 57 || eventCode === 'Digit9' || eventCode === 'Numpad9') {
        hideChatModal();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    var isLeft = (key === 'ArrowLeft' || code === 37);
    var isRight = (key === 'ArrowRight' || code === 39);

    if (activeInspectType && (isLeft || isRight || isUp || isDown)) {
      if (isLeft || isRight) {
        var delta = isRight ? 1 : -1;
        if (activeInspectType === 'move') {
          var nextMove = activeInspectIndex + delta;
          if (nextMove > 4) nextMove = 1;
          if (nextMove < 1) nextMove = 4;
          inspectMove(nextMove);
        } else if (activeInspectType === 'switch') {
          var validSlots = getValidSwitchSlots();
          var curIdx = validSlots.indexOf(activeInspectIndex);
          if (curIdx === -1) curIdx = 0;
          var nextIdx = curIdx + delta;
          if (nextIdx >= validSlots.length) nextIdx = 0;
          if (nextIdx < 0) nextIdx = validSlots.length - 1;
          inspectPokemon(validSlots[nextIdx]);
        } else if (activeInspectType === 'opponent') {
          var foeTeam = getFoeTeam();
          var nextFoe = activeInspectIndex + delta;
          if (nextFoe > foeTeam.length) nextFoe = 1;
          if (nextFoe < 1) nextFoe = foeTeam.length;
          inspectOpponent(nextFoe);
        } else if (activeInspectType === 'myteam') {
          var myTeam = getMyTeam();
          var nextMon = activeInspectIndex + delta;
          if (nextMon > myTeam.length) nextMon = 1;
          if (nextMon < 1) nextMon = myTeam.length;
          inspectMyTeam(nextMon);
        }
      } else if (isUp || isDown) {
        if (activeInspectType === 'move') {
          var switchSlots = getValidSwitchSlots();
          inspectPokemon(switchSlots[0] || 1);
        } else if (activeInspectType === 'switch') {
          inspectMove(1);
        }
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (isLeft || isRight) {
      e.stopImmediatePropagation();
    }

    if (isCall || isEnter) {
      if (activeInspectType === 'move') {
        var moveBtn = document.querySelector('button[name="chooseMove"][value="' + activeInspectIndex + '"]') ||
                      document.querySelectorAll('button[name="chooseMove"]')[activeInspectIndex - 1];
        if (moveBtn) moveBtn.click();
        hideInspector();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      } else if (activeInspectType === 'switch') {
        var req = getBattleRequest();
        var mon = req && req.side && req.side.pokemon && req.side.pokemon[activeInspectIndex - 1];

        if (mon && mon.condition && mon.condition.includes('fnt')) {
          hideInspector();
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        var monSpecies = mon ? mon.details.split(',')[0].trim().toLowerCase() : '';
        var switchBtns = document.querySelectorAll('button[name="chooseSwitch"], button.switchselect');
        var targetBtn = null;

        for (var s = 0; s < switchBtns.length; s++) {
          var btnText = switchBtns[s].innerText.toLowerCase();
          if (monSpecies && btnText.includes(monSpecies)) {
            targetBtn = switchBtns[s];
            break;
          }
        }

        if (!targetBtn) {
          for (var s = 0; s < switchBtns.length; s++) {
            var btnVal = parseInt(switchBtns[s].value, 10);
            if (btnVal === activeInspectIndex || btnVal === (activeInspectIndex - 1)) {
              targetBtn = switchBtns[s];
              break;
            }
          }
        }

        if (targetBtn) {
          targetBtn.click();
        } else {
          var room = getBattleRoom();
          if (room && typeof room.choose === 'function') {
            room.choose('switch', activeInspectIndex);
          } else if (room && typeof room.send === 'function') {
            room.send('/choose switch ' + activeInspectIndex);
          }
        }

        hideInspector();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    if (isHashOrEscape) {
      if (activeInspectType) {
        hideInspector();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      var undoBtn = document.querySelector('button[name="undo"], button[name="clearMove"], button[name="chooseUndo"], button[value="undo"], button[value="cancel"]');
      if (undoBtn) {
        undoBtn.click();
      } else {
        var room = getBattleRoom();
        if (room && typeof room.send === 'function') room.send('/undo');
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '0' || code === 48) {
      if (activeInspectType === 'move' || activeInspectType === 'switch') {
        hideInspector();
      } else {
        var focused = document.activeElement;
        if (focused && focused.name === 'chooseMove') {
          inspectMove(focused.value || '1');
        } else if (focused && (focused.name === 'chooseSwitch' || focused.classList.contains('switchselect'))) {
          var validSlots = getValidSwitchSlots();
          inspectPokemon(validSlots[0] || 1);
        } else {
          inspectMove('1');
        }
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '1' || code === 49) {
      if (activeInspectType === 'opponent') {
        hideInspector();
      } else {
        inspectOpponent(1);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '2' || code === 50 || eventCode === 'Digit2' || eventCode === 'Numpad2') {
      if (activeInspectType === 'myteam') {
        hideInspector();
      } else {
        inspectMyTeam(1);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '9' || code === 57 || eventCode === 'Digit9' || eventCode === 'Numpad9') {
      toggleChatModal();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '*' || code === 106 || eventCode === 'NumpadMultiply') {
      var tera = document.querySelector('input[name="terastallize"], input[name="megaEvolution"]');
      if (tera) {
        tera.click();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
  }, true);

  function inspectMove(index) {
    index = Number(index) || 1;
    var moveBtn = document.querySelector('button[name="chooseMove"][value="' + index + '"]') ||
                  document.querySelectorAll('button[name="chooseMove"]')[index - 1];

    var req = getBattleRequest();
    var activeMon = req && req.side && req.side.pokemon && (req.side.pokemon.find(function(p) { return p.active; }) || req.side.pokemon[0]);
    var reqMove = req && req.active && req.active[0] && req.active[0].moves && req.active[0].moves[index - 1];

    var rawName = (moveBtn && (moveBtn.getAttribute('data-move') || moveBtn.innerText.split('\\n')[0])) || (reqMove && reqMove.move) || ('Move ' + index);
    var moveId = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
    var dexData = (window.BattleMovedex && BattleMovedex[moveId]) ? BattleMovedex[moveId] : (window.Dex && Dex.moves ? Dex.moves.get(rawName) : null);

    var foeTypes = getOpponentTypes();
    var foe = getOpponentActive();
    var foeName = foe ? (foe.name || foe.species || 'Opponent').replace(/^p[12]:\\s*/i, '') : 'Opponent';

    var moveName = (dexData && dexData.name) || (reqMove && reqMove.move) || rawName;
    var type = (dexData && dexData.type) || 'Normal';
    var category = (dexData && dexData.category) || '';
    var bp = (dexData && (dexData.basePower || '—')) || '—';
    var acc = (dexData && (dexData.accuracy === true ? '—' : (dexData.accuracy + '%'))) || '—';
    var ppText = reqMove && reqMove.pp !== undefined ? (reqMove.pp + '/' + reqMove.maxpp) : '—';

    var mult = (category === 'Status') ? 1 : getEffectiveness(type, foeTypes);
    var effHtml = (category === 'Status') ? '<span class="eff-badge eff-neutral">Status</span>' : formatMultiplierBadge(mult);

    var activeSpecies = activeMon ? activeMon.details.split(',')[0] : 'Active';
    var activeSpeciesKey = activeSpecies.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var activeDex = (window.BattlePokedex && BattlePokedex[activeSpeciesKey]) || (window.Dex && Dex.species ? Dex.species.get(activeSpeciesKey) : null);
    var activeTypes = (activeMon && activeMon.types) || (activeDex && activeDex.types) || [];
    var activeSpeed = (activeMon && activeMon.stats && activeMon.stats.spe) ? activeMon.stats.spe : (activeDex && activeDex.baseStats ? activeDex.baseStats.spe : '—');

    var html = '';
    html += '<div style="background:rgba(255,255,255,0.06);padding:2px 4px;border-radius:3px;margin-bottom:3px;font-size:9.5px;">' +
            '<b>' + activeSpecies + '</b> (' + (activeTypes.join('/') || '—') + (activeMon && activeMon.teraType ? ' [' + activeMon.teraType + ']' : '') + ') &nbsp;|&nbsp; <b>Spe:</b> ' + activeSpeed + '</div>';

    html += '<div><b>Type:</b> ' + type + ' ' + (category ? '(' + category + ')' : '') + '</div>';
    html += '<div><b>BP:</b> ' + bp + ' &nbsp;|&nbsp; <b>Acc:</b> ' + acc + ' &nbsp;|&nbsp; <b>PP:</b> ' + ppText + '</div>';
    html += '<div style="margin: 3px 0;"><b>Vs ' + foeName + ' (' + (foeTypes.join('/') || '—') + '):</b><br>' + effHtml + '</div>';

    if (dexData && (dexData.shortDesc || dexData.desc)) {
      html += '<div style="margin-top:2px;color:#bbb;font-size:9px;">' + (dexData.shortDesc || dexData.desc) + '</div>';
    }

    if (reqMove && reqMove.disabled) {
      html += '<div style="color:#ff5555;font-weight:bold;margin-top:2px;">[DISABLED]</div>';
    }

    showInspector('⚡ Move ' + index + '/4: ' + moveName, html, 'move', index);
  }

  function inspectPokemon(slot) {
    slot = Number(slot) || 1;
    var req = getBattleRequest();
    var mon = req && req.side && req.side.pokemon && req.side.pokemon[slot - 1];

    var foeTypes = getOpponentTypes();
    var foe = getOpponentActive();
    var foeName = foe ? (foe.name || foe.species || 'Opponent').replace(/^p[12]:\\s*/i, '') : 'Opponent';

    var rawDetails = mon ? mon.details.split(',')[0] : ('Slot ' + slot);
    var speciesKey = rawDetails.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var pDex = (window.BattlePokedex && BattlePokedex[speciesKey]) || (window.Dex && Dex.species ? Dex.species.get(speciesKey) : null);

    var monTypes = (mon && mon.types) || (pDex && pDex.types) || [];
    var monSpeed = (mon && mon.stats && mon.stats.spe) ? mon.stats.spe : (pDex && pDex.baseStats ? pDex.baseStats.spe : '—');

    var html = '';
    if (mon) {
      var isDead = mon.condition && mon.condition.includes('fnt');
      html += '<div><b>Types:</b> ' + (monTypes.join(' / ') || 'Unknown') + (mon.teraType ? ' [Tera: ' + mon.teraType + ']' : '') + '</div>';
      html += '<div><b>Speed:</b> <span style="color:#00ffcc;font-weight:bold;">' + monSpeed + '</span> &nbsp;|&nbsp; <b>HP:</b> ' + mon.condition + '</div>';
      if (mon.item) html += '<div><b>Item:</b> ' + mon.item + '</div>';
      if (mon.ability) html += '<div><b>Ability:</b> ' + mon.ability + '</div>';

      if (mon.moves && mon.moves.length && !isDead) {
        html += '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Bench Moves vs ' + foeName + ':</b></div>';
        for (var i = 0; i < mon.moves.length; i++) {
          var mName = mon.moves[i];
          var mId = mName.toLowerCase().replace(/[^a-z0-9]/g, '');
          var mData = (window.BattleMovedex && BattleMovedex[mId]) || (window.Dex && Dex.moves ? Dex.moves.get(mName) : null);
          var mType = (mData && mData.type) || 'Normal';
          var mCategory = (mData && mData.category) || '';
          var mult = (mCategory === 'Status') ? 1 : getEffectiveness(mType, foeTypes);

          html += '<div style="font-size:9px;margin:1px 0;">• ' + mName + ' (' + mType + '): ' +
                  ((mCategory === 'Status') ? '<span style="color:#aaa;">Status</span>' : (mult + '×')) + '</div>';
        }
      }

      if (isDead) {
        html += '<div style="color:#ff5555;font-weight:bold;margin-top:3px;">[FAINTED]</div>';
      } else if (mon.active) {
        html += '<div style="color:#00ffcc;font-weight:bold;margin-top:3px;">[CURRENTLY IN BATTLE]</div>';
      }
    } else {
      html = '<div>No data available for Slot ' + slot + '</div>';
    }

    showInspector('🔄 Switch Slot ' + slot + '/6: ' + rawDetails, html, 'switch', slot);
  }

  function inspectOpponent(index) {
    index = Number(index) || 1;
    var foeTeam = getFoeTeam();
    if (!foeTeam.length) {
      showInspector('🎯 Opponent Team', '<div>No opponent team data found.</div>', 'opponent', 1);
      return;
    }

    if (index > foeTeam.length) index = 1;
    if (index < 1) index = foeTeam.length;

    var foe = foeTeam[index - 1];
    var foeTypes = getOpponentTypes(foe);

    var cleanName = (foe.name || foe.species || 'Unknown').replace(/^p[12]:\\s*/i, '');
    var speciesKey = cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var pDex = (window.BattlePokedex && BattlePokedex[speciesKey]) || (window.Dex && Dex.species ? Dex.species.get(speciesKey) : {});
    var baseSpe = (pDex.baseStats && pDex.baseStats.spe) || (pDex.spe) || 0;

    var level = 100;
    if (foe.level) {
      level = Number(foe.level);
    } else if (foe.details) {
      var lvlMatch = foe.details.match(/L(\\d+)/);
      if (lvlMatch) level = parseInt(lvlMatch[1], 10);
    }

    var speedText = '—';
    if (baseSpe > 0) {
      var minMin = Math.floor((Math.floor((2 * baseSpe) * level / 100) + 5) * 0.9);
      var minNeutral = Math.floor((2 * baseSpe + 31) * level / 100) + 5;
      var maxMax = Math.floor((Math.floor((2 * baseSpe + 94) * level / 100) + 5) * 1.1);

      var speBoost = (foe.boosts && foe.boosts.spe) ? foe.boosts.spe : 0;
      if (speBoost !== 0) {
        var mult = (speBoost > 0) ? (2 + speBoost) / 2 : 2 / (2 - speBoost);
        minMin = Math.floor(minMin * mult);
        minNeutral = Math.floor(minNeutral * mult);
        maxMax = Math.floor(maxMax * mult);
      }

      var boostLabel = speBoost !== 0 ? ' (' + (speBoost > 0 ? '+' : '') + speBoost + ')' : '';
      speedText = minNeutral + ' - ' + maxMax + boostLabel + ' <span style="color:#888;font-size:8.5px;">(Min ' + minMin + ', Base ' + baseSpe + ')</span>';
    }

    var rawItem = foe.item || (foe.prevItem ? (foe.prevItem + ' (Lost)') : '');
    var itemDesc = getItemDesc(rawItem);
    var itemText = rawItem || 'Unrevealed / None';

    var rawAbility = foe.ability || '';
    if (!rawAbility && pDex && pDex.abilities) {
      var abList = [];
      for (var k in pDex.abilities) abList.push(pDex.abilities[k]);
      rawAbility = abList.join(', ') + ' (Possible)';
    }
    var abilityDesc = getAbilityDesc(rawAbility.split(',')[0]);
    var abilityText = rawAbility || 'Unknown';

    var teraLabel = foe.terastallized ? ' <span style="color:#00ffcc;font-weight:bold;">[Tera: ' + (foe.teraType || foe.terastallized) + ']</span>' : '';
    var statusLabel = (foe.condition && foe.condition.includes('fnt')) ? ' <span style="color:#ff5555;font-weight:bold;">[FNT]</span>' : (foe.active ? ' <span style="color:#00ffcc;font-weight:bold;">[ACTIVE]</span>' : '');

    var moves = getKnownMoves(foe);

    var html = '';
    html += '<div><b>Types:</b> ' + (foeTypes.join(' / ') || 'Unknown') + teraLabel + statusLabel + '</div>';
    html += '<div><b>Speed (Lv ' + level + '):</b> ' + speedText + '</div>';
    html += '<div style="margin-top:2px;"><b>Item:</b> ' + itemText + '</div>';
    if (itemDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + itemDesc + '</div>';
    html += '<div><b>Ability:</b> ' + abilityText + '</div>';
    if (abilityDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + abilityDesc + '</div>';

    if (moves.length) {
      html += '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Revealed Moves:</b></div>';
      for (var m = 0; m < moves.length; m++) {
        var mName = moves[m];
        var mId = mName.toLowerCase().replace(/[^a-z0-9]/g, '');
        var mData = (window.BattleMovedex && BattleMovedex[mId]) || (window.Dex && Dex.moves ? Dex.moves.get(mName) : null);
        var mType = (mData && mData.type) || '—';
        var mCat = (mData && mData.category) ? '(' + mData.category[0] + ')' : '';
        var mBp = (mData && mData.basePower) ? mData.basePower : '—';
        html += '<div style="font-size:9px;margin:1px 0;">• ' + mName + ' <span style="color:#ffd700;">[' + mType + ' ' + mCat + ']</span> (BP: ' + mBp + ')</div>';
      }
    } else {
      html += '<div style="margin-top:3px;color:#888;font-size:9px;"><b>Revealed Moves:</b> None revealed yet</div>';
    }

    html += renderDefensiveProfile(foeTypes);

    showInspector('🎯 Opponent ' + index + '/' + foeTeam.length + ': ' + cleanName, html, 'opponent', index);
  }

  function inspectMyTeam(index) {
    index = Number(index) || 1;
    var myTeam = getMyTeam();
    if (!myTeam.length) {
      showInspector('🛡️ My Team Profile', '<div>No team data found.</div>', 'myteam', 1);
      return;
    }

    if (index > myTeam.length) index = 1;
    if (index < 1) index = myTeam.length;

    var mon = myTeam[index - 1];
    var rawName = mon ? (mon.details ? mon.details.split(',')[0] : (mon.name || mon.species || ('Slot ' + index))) : ('Slot ' + index);
    var speciesKey = rawName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var pDex = (window.BattlePokedex && BattlePokedex[speciesKey]) || (window.Dex && Dex.species ? Dex.species.get(speciesKey) : {});

    var monTypes = (mon && mon.types) || (pDex && pDex.types) || [];
    if (mon && mon.teraType) {
      monTypes = (mon.terastallized && mon.terastallized !== 'Stellar') ? [mon.terastallized] : monTypes;
    }

    var monSpeed = (mon && mon.stats && mon.stats.spe) ? mon.stats.spe : ((pDex && pDex.baseStats && pDex.baseStats.spe) ? (pDex.baseStats.spe + ' (Base)') : '—');
    var itemDesc = getItemDesc(mon ? mon.item : '');
    var abilityDesc = getAbilityDesc(mon ? mon.ability : '');

    var isDead = mon && mon.condition && mon.condition.includes('fnt');
    var statusBadge = isDead ? ' <span style="color:#ff5555;font-weight:bold;">[FNT]</span>' : (mon && mon.active ? ' <span style="color:#00ffcc;font-weight:bold;">[ACTIVE]</span>' : '');

    var html = '';
    html += '<div><b>Types:</b> ' + (monTypes.join(' / ') || 'Unknown') + (mon && mon.teraType ? ' [Tera: ' + mon.teraType + ']' : '') + statusBadge + '</div>';
    html += '<div><b>Speed:</b> <span style="color:#00ffcc;font-weight:bold;">' + monSpeed + '</span> &nbsp;|&nbsp; <b>HP:</b> ' + (mon ? (mon.condition || '—') : '—') + '</div>';
    html += '<div style="margin-top:2px;"><b>Item:</b> ' + (mon && mon.item ? mon.item : 'None') + '</div>';
    if (itemDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + itemDesc + '</div>';
    html += '<div><b>Ability:</b> ' + (mon && mon.ability ? mon.ability : 'Unknown') + '</div>';
    if (abilityDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + abilityDesc + '</div>';

    html += renderDefensiveProfile(monTypes);

    showInspector('🛡️ My Team ' + index + '/' + myTeam.length + ': ' + rawName, html, 'myteam', index);
  }

  function patchShowdown() {
    var chatElements = document.querySelectorAll('button[name="openChat"], button[name="openBattleLog"], button.battle-chat-toggle, .battle-chat-toggle, .chat-toggle');
    for (var i = 0; i < chatElements.length; i++) {
      chatElements[i].remove();
    }

    var tooltips = document.querySelectorAll('#tooltipwrapper, .tooltip, .tooltipwrapper, div[class*="tooltip"]');
    for (var j = 0; j < tooltips.length; j++) {
      tooltips[j].style.setProperty('display', 'none', 'important');
    }

    if (window.BattleTooltips) {
      BattleTooltips.prototype.showTooltip = function() {};
      BattleTooltips.prototype.showMoveTooltip = function() {};
      BattleTooltips.prototype.showPokemonTooltip = function() {};
      BattleTooltips.prototype.showCustomTooltip = function() {};
      BattleTooltips.prototype.showPinnedTooltip = function() {};
      BattleTooltips.prototype.hideTooltip = function() {};
    }

    if (window.app) {
      app.showTooltip = function() {};
      app.hideTooltip = function() {};
      app.focusPrevRoom = function() {};
      app.focusNextRoom = function() {};
    }
  }

  setInterval(patchShowdown, 200);

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
      if (window.app && typeof app.connect === 'function') {
        if (!app.connection) app.connect();
        return true;
      }
    } catch (err) {}
    return false;
  }

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

      text = text.replace("<head>", `<head>${injectedHead}`);
      text = text.includes("</body>")
        ? text.replace("</body>", `${injectedBody}</body>`)
        : text + injectedBody;

      body = Buffer.from(text, "utf8");
      proxyRes.headers["content-length"] = Buffer.byteLength(body);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    res.end(body);
  });
});

webProxy.on("error", (err, req, res) => {
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Web proxy connection error.");
  }
});

simProxy.on("error", (err, req, socket) => {
  if (socket && socket.destroy) socket.destroy();
});

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
    const currentHost = req.headers.host || "localhost";

    text += `
Config.server = Config.defaultserver = {
  id: 'showdown',
  host: 'sim3.psim.us',
  port: 443,
  httpport: 8000,
  altport: 80,
  ssl: true
};
Config.routes = Config.routes || {};
Config.routes.client = ${JSON.stringify(currentHost)};
`;

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(text);
  } catch (err) {
    return res.status(500).send(`// Config proxy error: ${err.message}`);
  }
});

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

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => {
  console.log(`Showdown proxy active on port ${PORT}`);
});
