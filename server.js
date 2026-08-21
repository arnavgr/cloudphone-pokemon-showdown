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
  /* 1. Suppress native hover tooltips */
  #tooltipwrapper, .tooltip, .tooltipwrapper, div[class*="tooltip"], .battle-log-tag {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    top: -9999px !important;
    position: absolute !important;
  }

  /* 2. Obliterate on-screen mobile chat buttons and side logs */
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

  /* 3. Hide background side chat log */
  .battle-log, .chat-log {
    display: none !important;
  }

  /* 4. Spatial focus indicator */
  button:focus, a:focus, input:focus, select:focus {
    outline: 2px solid #ffcc00 !important;
    outline-offset: 1px !important;
    box-shadow: 0 0 6px #ffcc00 !important;
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

  /* 6. Effectiveness Badges */
  .eff-badge {
    display: inline-block;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: bold;
    font-size: 10px;
    margin: 1px 2px;
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

  var activeInspectType = null; // 'move' | 'switch' | 'opponent'
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
    if (mult >= 2) return '<span class="eff-badge eff-super">Super Effective (' + mult + '×)</span>';
    if (mult <= 0.5) return '<span class="eff-badge eff-resist">Not Effective (' + mult + '×)</span>';
    return '<span class="eff-badge eff-neutral">Neutral (1×)</span>';
  }

  // --- INSPECTOR MODAL ---
  function getInspectorEl() {
    var el = document.getElementById('cp-inspector');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-inspector';
      el.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:224px!important;max-height:275px!important;background:#0e121a!important;border:2px solid #ffd700!important;border-radius:6px!important;color:#fff!important;padding:8px!important;z-index:2147483647!important;font-family:sans-serif!important;font-size:11px!important;line-height:1.35!important;box-shadow:0 0 20px rgba(0,0,0,0.95)!important;box-sizing:border-box!important;display:none;overflow-y:auto!important;';
      el.innerHTML = '<div id="cp-insp-title" style="font-size:12px;font-weight:bold;color:#ffd700;margin-bottom:4px;border-bottom:1px solid #333;padding-bottom:2px;"></div><div id="cp-insp-body" style="color:#e0e0e0;margin-bottom:6px;"></div><div id="cp-insp-footer" style="font-size:10px;color:#00ffcc;font-weight:bold;text-align:center;border-top:1px solid #333;padding-top:4px;">[CALL/OK] Use | [D-Pad] Cycle | [#] Close</div>';
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

  // --- FLOATING CHAT & LOG MODAL (KEY 9) ---
  function getChatModalEl() {
    var el = document.getElementById('cp-chat-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-chat-modal';
      el.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:228px!important;height:280px!important;background:#0c1016!important;border:2px solid #00ffcc!important;border-radius:6px!important;color:#e0e0e0!important;padding:6px!important;z-index:2147483646!important;font-family:sans-serif!important;font-size:10px!important;line-height:1.3!important;box-shadow:0 0 25px rgba(0,0,0,0.98)!important;box-sizing:border-box!important;display:none;flex-direction:column!important;';
      el.innerHTML = '<div style="font-size:11px;font-weight:bold;color:#00ffcc;border-bottom:1px solid #333;padding-bottom:2px;margin-bottom:4px;display:flex;justify-content:space-between;"><span>💬 Battle Chat & Log</span><span style="color:#888;font-size:9px;">[#] Close</span></div>' +
                     '<div id="cp-chat-content" style="flex:1!important;overflow-y:auto!important;margin-bottom:6px;padding-right:2px;word-break:break-word;"></div>' +
                     '<form id="cp-chat-form" style="display:flex;gap:3px;margin:0;padding:0;">' +
                       '<input type="text" id="cp-chat-input" placeholder="Type msg..." style="flex:1;min-width:0;background:#18202c;border:1px solid #00ffcc;border-radius:3px;color:#fff;font-size:10px;padding:3px 5px;box-sizing:border-box;" />' +
                       '<button type="submit" style="background:#00aa88;border:none;border-radius:3px;color:#fff;font-size:9px;font-weight:bold;padding:0 6px;cursor:pointer;">Send</button>' +
                     '</form>' +
                     '<div style="font-size:8px;color:#777;text-align:center;margin-top:3px;">[D-Pad Up/Down] Scroll &nbsp;|&nbsp; [OK] Type/Send</div>';
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
      var isNearBottom = (contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight) < 50;
      if (contentEl.innerHTML !== sourceEl.innerHTML) {
        contentEl.innerHTML = sourceEl.innerHTML;
        if (isNearBottom) {
          contentEl.scrollTop = contentEl.scrollHeight;
        }
      }
    } else if (contentEl.children.length === 0) {
      contentEl.innerHTML = '<div style="color:#777;padding:12px 0;text-align:center;">No battle log or messages yet.</div>';
    }
  }

  function submitChatMessage() {
    var input = document.getElementById('cp-chat-input');
    if (!input) return;
    var msg = input.value.trim();
    if (!msg) return;

    var room = getBattleRoom();
    if (room && typeof room.send === 'function') {
      room.send(msg);
    } else if (window.app && typeof app.send === 'function') {
      app.send(msg);
    }

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

  function getOpponentTypes() {
    var foe = getOpponentActive();
    if (!foe) return [];
    if (foe.terastallized || foe.teraType) return [foe.teraType || foe.terastallized];
    if (foe.types && foe.types.length) return foe.types;
    if (foe.speciesData && foe.speciesData.types) return foe.speciesData.types;

    var raw = (foe.species || foe.name || '').replace(/^p[12]:\s*/i, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (window.BattlePokedex && BattlePokedex[raw] && BattlePokedex[raw].types) {
      return BattlePokedex[raw].types;
    }
    if (window.Dex && Dex.species && Dex.species.get(raw)) {
      return Dex.species.get(raw).types || [];
    }
    return [];
  }

  // 1. Release Isolation
  window.addEventListener('keyup', function(e) {
    var code = e.keyCode || e.which;
    var isHorizontal = (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || code === 37 || code === 39);
    if (isHorizontal) {
      e.stopImmediatePropagation();
    }
  }, true);

  // 2. Hardware Controller
  window.addEventListener('keydown', function(e) {
    var key = e.key;
    var code = e.keyCode || e.which;
    var eventCode = e.code;

    var isLeft = (key === 'ArrowLeft' || code === 37);
    var isRight = (key === 'ArrowRight' || code === 39);
    var isUp = (key === 'ArrowUp' || code === 38);
    var isDown = (key === 'ArrowDown' || code === 40);
    var isCall = (key === 'Call' || code === 0);
    var isEnter = (key === 'Enter' || code === 13);
    var isHashOrEscape = (key === '#' || key === 'Hash' || key === 'Pound' || key === 'Escape' || code === 27);

    // --- CHAT MODAL INTERACTION ---
    if (isChatModalOpen()) {
      var chatInput = document.getElementById('cp-chat-input');
      var contentEl = document.getElementById('cp-chat-content');

      // If user is currently focused in chat input
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
        return; // Allow standard text typing
      }

      // If user is navigating the chat modal (not typed in input)
      if (isUp && contentEl) {
        contentEl.scrollTop -= 40;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (isDown && contentEl) {
        contentEl.scrollTop += 40;
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

    // Ignore other global shortcuts if user is typing elsewhere
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    // --- D-PAD IN-MODAL CYCLING ---
    if (activeInspectType && (isLeft || isRight || isUp || isDown)) {
      if (isLeft || isRight) {
        var delta = isRight ? 1 : -1;
        if (activeInspectType === 'move') {
          var nextMove = activeInspectIndex + delta;
          if (nextMove > 4) nextMove = 1;
          if (nextMove < 1) nextMove = 4;
          inspectMove(nextMove);
        } else if (activeInspectType === 'switch') {
          var nextSwitch = activeInspectIndex + delta;
          if (nextSwitch > 6) nextSwitch = 1;
          if (nextSwitch < 1) nextSwitch = 6;
          inspectPokemon(nextSwitch);
        }
      } else if (isUp || isDown) {
        if (activeInspectType === 'move') {
          inspectPokemon(1);
        } else if (activeInspectType === 'switch') {
          inspectOpponent();
        } else if (activeInspectType === 'opponent') {
          inspectMove(1);
        }
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Horizontal Spatial Navigation Isolation (Modal closed)
    if (isLeft || isRight) {
      e.stopImmediatePropagation();
    }

    // --- CALL / ENTER -> EXECUTE ACTION ---
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
        var switchBtn = document.querySelector('button[name="chooseSwitch"][value="' + activeInspectIndex + '"]') ||
                        document.querySelectorAll('button[name="chooseSwitch"]')[activeInspectIndex - 1];
        if (switchBtn) switchBtn.click();
        hideInspector();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    // --- # / ESCAPE -> CLOSE INSPECTOR OR UNDO ---
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

    // --- 0 -> UNIFIED MODAL TOGGLE ---
    if (key === '0' || code === 48) {
      if (activeInspectType) {
        hideInspector();
      } else {
        var focused = document.activeElement;
        if (focused && focused.name === 'chooseMove') {
          inspectMove(focused.value || '1');
        } else if (focused && focused.name === 'chooseSwitch') {
          inspectPokemon(focused.value || '1');
        } else {
          inspectMove('1');
        }
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // --- 1 -> OPPONENT INSPECTOR ---
    if (key === '1' || code === 49) {
      if (activeInspectType === 'opponent') {
        hideInspector();
      } else {
        inspectOpponent();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // --- 9 -> TOGGLE FLOATING CHAT & LOG MODAL ---
    if (key === '9' || code === 57 || eventCode === 'Digit9' || eventCode === 'Numpad9') {
      toggleChatModal();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // --- * -> TERA / GIMMICK ---
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

  // Extract Move Details & Multipliers
  function inspectMove(index) {
    index = Number(index) || 1;
    var moveBtn = document.querySelector('button[name="chooseMove"][value="' + index + '"]') ||
                  document.querySelectorAll('button[name="chooseMove"]')[index - 1];

    var req = getBattleRequest();
    var reqMove = req && req.active && req.active[0] && req.active[0].moves && req.active[0].moves[index - 1];

    var rawName = (moveBtn && (moveBtn.getAttribute('data-move') || moveBtn.innerText.split('\\n')[0])) || (reqMove && reqMove.move) || ('Move ' + index);
    var moveId = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
    var dexData = (window.BattleMovedex && BattleMovedex[moveId]) ? BattleMovedex[moveId] : (window.Dex && Dex.moves ? Dex.moves.get(rawName) : null);

    var foeTypes = getOpponentTypes();
    var foe = getOpponentActive();
    var foeName = foe ? (foe.name || foe.species || 'Opponent').replace(/^p[12]:\s*/i, '') : 'Opponent';

    var moveName = (dexData && dexData.name) || (reqMove && reqMove.move) || rawName;
    var type = (dexData && dexData.type) || 'Normal';
    var category = (dexData && dexData.category) || '';
    var bp = (dexData && (dexData.basePower || '—')) || '—';
    var acc = (dexData && (dexData.accuracy === true ? '—' : (dexData.accuracy + '%'))) || '—';
    var ppText = reqMove && reqMove.pp !== undefined ? (reqMove.pp + '/' + reqMove.maxpp) : '—';

    var mult = (category === 'Status') ? 1 : getEffectiveness(type, foeTypes);
    var effHtml = (category === 'Status') ? '<span class="eff-badge eff-neutral">Status</span>' : formatMultiplierBadge(mult);

    var html = '';
    html += '<div><b>Type:</b> ' + type + ' ' + (category ? '(' + category + ')' : '') + '</div>';
    html += '<div><b>Power:</b> ' + bp + ' &nbsp;|&nbsp; <b>Acc:</b> ' + acc + ' &nbsp;|&nbsp; <b>PP:</b> ' + ppText + '</div>';
    html += '<div style="margin: 4px 0;"><b>Vs ' + foeName + ' (' + (foeTypes.join('/') || 'Unknown') + '):</b><br>' + effHtml + '</div>';

    if (dexData && (dexData.shortDesc || dexData.desc)) {
      html += '<div style="margin-top:4px;color:#bbb;font-size:10px;">' + (dexData.shortDesc || dexData.desc) + '</div>';
    }

    if (reqMove && reqMove.disabled) {
      html += '<div style="color:#ff5555;font-weight:bold;margin-top:2px;">[DISABLED]</div>';
    }

    showInspector('⚡ Move ' + index + '/4: ' + moveName, html, 'move', index);
  }

  // Extract Switch Slot Details & Matchups
  function inspectPokemon(slot) {
    slot = Number(slot) || 1;
    var switchBtn = document.querySelector('button[name="chooseSwitch"][value="' + slot + '"]') ||
                    document.querySelectorAll('button[name="chooseSwitch"]')[slot - 1];

    var req = getBattleRequest();
    var mon = req && req.side && req.side.pokemon && req.side.pokemon[slot - 1];

    var foeTypes = getOpponentTypes();
    var foe = getOpponentActive();
    var foeName = foe ? (foe.name || foe.species || 'Opponent').replace(/^p[12]:\s*/i, '') : 'Opponent';

    var name = mon ? mon.details.split(',')[0] : (switchBtn ? switchBtn.innerText.split('\\n')[0] : ('Slot ' + slot));
    var html = '';

    if (mon) {
      html += '<div><b>HP:</b> ' + mon.condition + '</div>';
      if (mon.item) html += '<div><b>Item:</b> ' + mon.item + '</div>';
      if (mon.ability) html += '<div><b>Ability:</b> ' + mon.ability + '</div>';
      if (mon.teraType) html += '<div><b>Tera Type:</b> ' + mon.teraType + '</div>';

      if (mon.moves && mon.moves.length) {
        html += '<div style="margin-top:4px;border-top:1px solid #333;padding-top:3px;"><b>Bench Moves vs ' + foeName + ':</b></div>';
        for (var i = 0; i < mon.moves.length; i++) {
          var mName = mon.moves[i];
          var mId = mName.toLowerCase().replace(/[^a-z0-9]/g, '');
          var mData = (window.BattleMovedex && BattleMovedex[mId]) || (window.Dex && Dex.moves ? Dex.moves.get(mName) : null);
          var mType = (mData && mData.type) || 'Normal';
          var mCategory = (mData && mData.category) || '';
          var mult = (mCategory === 'Status') ? 1 : getEffectiveness(mType, foeTypes);

          html += '<div style="font-size:10px;margin:1px 0;">• ' + mName + ' (' + mType + '): ' +
                  ((mCategory === 'Status') ? '<span style="color:#aaa;">Status</span>' : (mult + '×')) + '</div>';
        }
      }

      if (mon.active) html += '<div style="color:#00ffcc;font-weight:bold;margin-top:2px;">[CURRENTLY ACTIVE]</div>';
    } else if (switchBtn) {
      html = '<div>' + switchBtn.innerText.replace(/\\n/g, '<br>') + '</div>';
    } else {
      html = '<div>No data available for Slot ' + slot + '</div>';
    }

    showInspector('🔄 Switch Slot ' + slot + '/6: ' + name, html, 'switch', slot);
  }

  // Extract Opponent Profile & Speed Range
  function inspectOpponent() {
    var foe = getOpponentActive();
    var foeTypes = getOpponentTypes();

    if (!foe) {
      showInspector('🎯 Opponent', '<div>No active opponent data found in battle state.</div>', 'opponent', 1);
      return;
    }

    var cleanName = (foe.name || foe.species || 'Unknown').replace(/^p[12]:\s*/i, '');
    var speciesKey = cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var pDex = (window.BattlePokedex && BattlePokedex[speciesKey]) || (window.Dex && Dex.species ? Dex.species.get(speciesKey) : {});
    var baseSpe = (pDex.baseStats && pDex.baseStats.spe) || (pDex.spe) || '—';

    var speedRange = '—';
    if (typeof baseSpe === 'number') {
      var minSpe = Math.floor((2 * baseSpe + 5) * 0.9);
      var maxSpe = Math.floor((2 * baseSpe + 99) * 1.1);
      speedRange = minSpe + ' - ' + maxSpe + ' (Base: ' + baseSpe + ')';
    }

    var weak = [], resist = [], immune = [];
    for (var i = 0; i < TYPE_LIST.length; i++) {
      var atkT = TYPE_LIST[i];
      var m = getEffectiveness(atkT, foeTypes);
      if (m === 0) immune.push(atkT);
      else if (m > 1) weak.push(atkT + ' (' + m + '×)');
      else if (m < 1) resist.push(atkT + ' (' + m + '×)');
    }

    var html = '';
    html += '<div><b>Types:</b> ' + (foeTypes.join(' / ') || 'Unknown') + '</div>';
    html += '<div><b>Estimated Speed (Lv100):</b> ' + speedRange + '</div>';
    if (foe.item) html += '<div><b>Known Item:</b> ' + foe.item + '</div>';
    if (foe.ability) html += '<div><b>Ability:</b> ' + foe.ability + '</div>';

    if (foe.moves && foe.moves.length) {
      html += '<div style="margin-top:4px;"><b>Revealed Moves:</b> ' + foe.moves.join(', ') + '</div>';
    }

    html += '<div style="margin-top:4px;border-top:1px solid #333;padding-top:3px;"><b>Defensive Profile:</b></div>';
    if (weak.length) html += '<div style="margin:1px 0;"><span style="color:#a5d6a7;font-weight:bold;">Weak:</span> ' + weak.join(', ') + '</div>';
    if (resist.length) html += '<div style="margin:1px 0;"><span style="color:#ef9a9a;font-weight:bold;">Resist:</span> ' + resist.join(', ') + '</div>';
    if (immune.length) html += '<div style="margin:1px 0;"><span style="color:#9e9e9e;font-weight:bold;">Immune:</span> ' + immune.join(', ') + '</div>';

    showInspector('🎯 Opponent: ' + cleanName, html, 'opponent', 1);
  }

  // 3. Automated DOM Sweeper & Tooltip Neutralization
  function patchShowdown() {
    var chatElements = document.querySelectorAll('button[name="openChat"], button[name="openBattleLog"], button.battle-chat-toggle, .battle-chat-toggle, .chat-toggle');
    for (var i = 0; i < chatElements.length; i++) {
      chatElements[i].remove();
    }

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

  setInterval(patchShowdown, 250);

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
// 4. WebSocket Upgrade Listener
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
