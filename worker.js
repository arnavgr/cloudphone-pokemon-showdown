const TARGET_WEB = "https://play.pokemonshowdown.com";
const TARGET_SIM = "https://sim3.psim.us";

const AD_TRACKER_PATTERN = /(analytics\.js|gtag\/js|ga\.js|ad-manager\.js|pubads.*\.js|adx-floors\.js|afihbs\.js)/i;

const INJECTED_HEAD = `
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

  /* 7. Doubles Target Bar & Focus Highlighting */
  #cp-targetbar {
    position: fixed !important;
    bottom: 5px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 226px !important;
    background: #0e121a !important;
    border: 2px solid #00ffcc !important;
    border-radius: 4px !important;
    color: #fff !important;
    padding: 4px 6px !important;
    z-index: 2147483647 !important;
    font-family: sans-serif !important;
    font-size: 9px !important;
    line-height: 1.25 !important;
    box-shadow: 0 0 15px rgba(0,0,0,0.95) !important;
    box-sizing: border-box !important;
    text-align: center !important;
    display: none;
  }
  .cp-target-sel {
    outline: 2px solid #00ffcc !important;
    box-shadow: 0 0 8px #00ffcc !important;
  }
</style>
`;

const INJECTED_BODY = `
<script>
(function() {
  try {
    window.localStorage.setItem('showdown_crossteams', 'false');
  } catch (e) {}

  var activeInspectType = null;
  var activeInspectIndex = 1;
  var activeMoveLevel = 1;
  var chatSyncTimer = null;
  var targetState = { active: false, buttons: [], index: 0 };

  var BATTLE_CTX = {};

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

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveSpeciesData(name) {
    if (!name) return null;
    var clean = String(name).replace(/^p[12][abc]?:\\s*/i, '').trim();
    var tries = [clean, clean.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(), clean.toLowerCase().replace(/\\s+/g, '-')];
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i];
      if (!t) continue;
      var d = null;
      if (window.BattlePokedex && BattlePokedex[t]) d = BattlePokedex[t];
      if (!d && window.Dex && Dex.species) {
        try { var s = Dex.species.get(t); if (s && s.exists && s.baseStats) d = s; } catch (e) {}
      }
      if (d && (d.types || d.baseStats)) return d;
    }
    return null;
  }

  function resolveMoveData(name) {
    if (!name) return null;
    var clean = String(name).trim();
    var id = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (id.indexOf('hiddenpower') === 0) {
      var hpType = clean.replace(/hidden\\s*power\\s*/i, '').trim() || 'Normal';
      var baseHp = (window.BattleMovedex && BattleMovedex['hiddenpower']) || (window.Dex && Dex.moves ? Dex.moves.get('hiddenpower') : null);
      if (baseHp) {
        var copy = Object.assign({}, baseHp);
        copy.type = hpType.charAt(0).toUpperCase() + hpType.slice(1).toLowerCase();
        return copy;
      }
    }
    if (window.BattleMovedex && BattleMovedex[id]) return BattleMovedex[id];
    if (window.Dex && Dex.moves) {
      try { var m = Dex.moves.get(clean); if (m && m.exists) return m; } catch (e) {}
    }
    return null;
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

  function isMonAlive(p) {
    if (!p) return false;
    if (p.fainted) return false;
    if (p.status === 'fnt') return false;
    if (p.condition && (p.condition.includes('fnt') || p.condition === '0 fnt')) return false;
    if (p.hp !== undefined && p.maxhp && p.hp === 0) return false;
    return true;
  }

  function cleanIdent(s) { return String(s == null ? '' : s).replace(/^p[12][abc]?:\\s*/, ''); }

  function parseLevel(p) {
    if (!p) return 0;
    if (p.level) return Number(p.level) || 0;
    if (p.details) { var m = String(p.details).match(/L(\\d+)/); if (m) return parseInt(m[1], 10); }
    return 0;
  }

  function monStatus(p) {
    if (!p) return '—';
    if (p.status === 'fnt') return 'Fainted';
    if (p.status) return String(p.status).toUpperCase();
    if (p.condition) {
      var parts = String(p.condition).split(' ');
      if (parts[1]) return parts[1].toUpperCase();
    }
    return 'None';
  }

  function boostsText(p) {
    var b = (p && p.boosts) || null;
    if (!b) return 'None';
    var out = [];
    var map = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
    for (var k in map) {
      if (b[k]) out.push(map[k] + ' ' + (b[k] > 0 ? '+' : '') + b[k]);
    }
    return out.length ? out.join(', ') : 'None';
  }

  function hpPctText(cond) {
    var m = /^(-?\\d+)\\/(\\d+)/.exec(String(cond || ''));
    if (!m) return '';
    var cur = parseInt(m[1], 10), max = parseInt(m[2], 10);
    if (!max) return '';
    return Math.max(0, Math.round(cur / max * 100)) + '%';
  }

  function boostMul(st) {
    st = Math.max(-6, Math.min(6, st | 0));
    return st >= 0 ? (2 + st) / 2 : 2 / (2 - st);
  }

  function estimateStatRange(base, level) {
    base = base || 100; level = level || 100;
    var min = Math.floor((Math.floor((2 * base + 31) * level / 100) + 5) * 0.9);
    var max = Math.floor((Math.floor((2 * base + 31 + 63) * level / 100) + 5) * 1.1);
    return [min, max];
  }

  function getInspectorEl() {
    var el = document.getElementById('cp-inspector');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-inspector';
      el.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:226px!important;max-height:270px!important;background:#0e121a!important;border:2px solid #ffd700!important;border-radius:6px!important;color:#fff!important;padding:5px 6px!important;z-index:2147483647!important;font-family:sans-serif!important;font-size:9.5px!important;line-height:1.25!important;box-shadow:0 0 20px rgba(0,0,0,0.95)!important;box-sizing:border-box!important;display:none;flex-direction:column!important;';
      el.innerHTML = '<div id="cp-insp-title" style="font-size:10.5px;font-weight:bold;color:#ffd700;margin-bottom:2px;border-bottom:1px solid #333;padding-bottom:2px;"></div>' +
                     '<div id="cp-insp-body" style="color:#e0e0e0;flex:1!important;max-height:205px!important;overflow-y:auto!important;margin-bottom:3px;padding-right:2px;word-break:break-word;"></div>' +
                     '<div id="cp-insp-footer" style="font-size:8.5px;color:#00ffcc;font-weight:bold;text-align:center;border-top:1px solid #333;padding-top:2px;"></div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideInspector() {
    var el = getInspectorEl();
    el.style.setProperty('display', 'none', 'important');
    activeInspectType = null;
  }

  function showInspector(title, bodyHtml, type, index, isSelfActive) {
    hideChatModal();
    var el = getInspectorEl();
    var titleEl = document.getElementById('cp-insp-title');
    var bodyEl = document.getElementById('cp-insp-body');
    var footEl = document.getElementById('cp-insp-footer');

    if (titleEl) titleEl.innerHTML = title;
    if (bodyEl) {
      bodyEl.innerHTML = bodyHtml;
      bodyEl.scrollTop = 0;
    }
    if (footEl) {
      if (type === 'move') {
        if (activeMoveLevel === 1) {
          footEl.innerHTML = '[CALL/OK] Use Move | [◄►] Cycle | [▼ at end] Desc | [#] Close';
        } else if (activeMoveLevel === 2) {
          footEl.innerHTML = '[▼ at end] Dmg | [▲ at top] Sum | [◄►] Cycle | [#] Back';
        } else {
          footEl.innerHTML = '[▲ at top] Desc | [◄►] Cycle | [#] Back';
        }
      } else if (type === 'opponent') {
        footEl.innerHTML = '[◄►] Cycle Foe | [▲▼] Scroll | [#] Close';
      } else if (type === 'myteam') {
        if (isSelfActive) {
          footEl.innerHTML = '<span style="color:#ffcc00;">[CURRENTLY IN BATTLE]</span> | [◄►] Cycle | [▲▼] Scroll | [#] Close';
        } else {
          footEl.innerHTML = '[CALL/OK] Switch In | [◄►] Cycle | [▲▼] Scroll | [#] Close';
        }
      } else {
        footEl.innerHTML = '[▲▼] Scroll | [#] Close';
      }
    }

    el.style.setProperty('display', 'flex', 'important');
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
                     '<div id="cp-chat-roomid" style="font-size:8px;color:#666;margin:-2px 0 2px 0;"></div>' +
                     '<div id="cp-chat-content" style="flex:1!important;overflow-y:auto!important;margin-bottom:4px;padding-right:2px;word-break:break-word;"></div>' +
                     '<form id="cp-chat-form" style="display:flex;gap:3px;margin:0;padding:0;">' +
                       '<input type="text" id="cp-chat-input" placeholder="Type msg..." style="flex:1;min-width:0;background:#18202c;border:1px solid #00ffcc;border-radius:3px;color:#fff;font-size:9.5px;padding:2px 4px;box-sizing:border-box;" />' +
                       '<button type="submit" style="background:#00aa88;border:none;border-radius:3px;color:#fff;font-size:9px;font-weight:bold;padding:0 6px;cursor:pointer;">Send</button>' +
                     '</form>' +
                     '<div style="font-size:8px;color:#777;text-align:center;margin-top:2px;">[D-Pad Up/Down] Scroll &nbsp;|&nbsp; [OK/Enter] Type/Send</div>';
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

  function getBattleLogSource() {
    var room = getBattleRoom();
    var roots = [];
    if (room && room.el) roots.push(room.el);
    else if (room && room.$el && room.$el[0]) roots.push(room.$el[0]);
    roots.push(document);
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      if (!root || !root.querySelector) continue;
      var s = root.querySelector('.battle-log .inner') || root.querySelector('.battle-log') ||
              root.querySelector('.chat-log .inner') || root.querySelector('.chat-log');
      if (s && s.innerHTML && s.innerHTML.trim().length > 0) return s;
    }
    return null;
  }

  function syncChatContent() {
    var contentEl = document.getElementById('cp-chat-content');
    if (!contentEl) return;

    var sourceEl = getBattleLogSource();
    if (sourceEl) {
      var isNearBottom = (contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight) < 45;
      if (contentEl.innerHTML !== sourceEl.innerHTML) {
        contentEl.innerHTML = sourceEl.innerHTML;
        if (isNearBottom) {
          contentEl.scrollTop = contentEl.scrollHeight;
        }
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

    var room = getBattleRoom();
    var ridEl = document.getElementById('cp-chat-roomid');
    if (ridEl) ridEl.textContent = room && room.id ? ('room: ' + room.id.replace('battle-', '')) : '';

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

  function getCtx(rid) {
    if (!BATTLE_CTX[rid]) BATTLE_CTX[rid] = { turn: 0, events: [], revealed: {} };
    return BATTLE_CTX[rid];
  }

  function ctxAddEvent(c, turn, text) {
    c.events.push({ t: turn, s: text });
    if (c.events.length > 400) c.events.splice(0, c.events.length - 400);
  }

  function ctxReveal(c, ident) {
    var k = ident || '?';
    if (!c.revealed[k]) c.revealed[k] = { species: null, item: null, ability: null, tera: null, moves: {}, firstTurn: c.turn };
    return c.revealed[k];
  }

  function handleProtocolLine(rid, line) {
    if (!line || line.charAt(0) !== '|') return;
    var parts = line.substr(1).split('|');
    var ty = parts[0];
    var c = getCtx(rid);
    var t = c.turn, r, sp;

    if (ty === 'init') {
      if ((parts[1] || '').indexOf('battle') === 0) BATTLE_CTX[rid] = { turn: 0, events: [], revealed: {} };
      return;
    }

    switch (ty) {
      case 'turn':
        c.turn = parseInt(parts[1], 10) || 0;
        break;
      case 'move':
        r = ctxReveal(c, parts[1]);
        if (parts[2]) r.moves[parts[2]] = 1;
        var targetStr = parts[3] && parts[3].charAt(0) !== '[' ? ' → ' + cleanIdent(parts[3]) : '';
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' used ' + (parts[2] || '') + targetStr);
        break;
      case 'switch': case 'drag': case 'replace':
        sp = (parts[2] || '').split(',')[0];
        r = ctxReveal(c, parts[1]);
        if (sp) r.species = sp;
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' sent out ' + sp);
        break;
      case 'detailschange': case '-formechange':
        sp = (parts[2] || '').split(',')[0];
        r = ctxReveal(c, parts[1]);
        if (sp) r.species = sp;
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' form change → ' + (sp || parts[2] || '?'));
        break;
      case '-damage':
        if ((parts[2] || '').indexOf('fnt') >= 0) ctxAddEvent(c, t, cleanIdent(parts[1]) + ' took fatal damage');
        else ctxAddEvent(c, t, cleanIdent(parts[1]) + ' lost ' + (hpPctText(parts[2]) || 'HP'));
        break;
      case '-heal':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' recovered ' + (hpPctText(parts[2]) || 'HP'));
        break;
      case '-status':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' → status: ' + String(parts[2] || '').toUpperCase());
        break;
      case '-curestatus':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' cured ' + String(parts[2] || '').toUpperCase());
        break;
      case '-boost':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' ' + (parts[2] || '') + ' +' + (parts[3] || ''));
        break;
      case '-unboost':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' ' + (parts[2] || '') + ' −' + (parts[3] || ''));
        break;
      case '-ability':
        r = ctxReveal(c, parts[1]); r.ability = parts[2] || null;
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' ability: ' + (parts[2] || ''));
        break;
      case '-item':
        r = ctxReveal(c, parts[1]); r.item = parts[2] || null;
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' item: ' + (parts[2] || ''));
        break;
      case '-enditem':
        r = ctxReveal(c, parts[1]); if (parts[2]) r.item = parts[2];
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' lost item ' + (parts[2] || ''));
        break;
      case 'faint':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' fainted');
        break;
      case '-terastallize':
        r = ctxReveal(c, parts[1]); r.tera = parts[2] || null;
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' Terastallized (' + (parts[2] || '') + ')');
        break;
      case '-mega':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' Mega Evolved');
        break;
      case '-primal':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' Primal Reverted');
        break;
      case '-burst':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' Ultra Burst');
        break;
      case '-zpower':
        ctxAddEvent(c, t, cleanIdent(parts[1]) + ' used a Z-Move');
        break;
      case '-weather':
        ctxAddEvent(c, t, 'Weather: ' + (parts[1] || ''));
        break;
      case '-sidestart':
        ctxAddEvent(c, t, 'Side effect: ' + (parts[2] || ''));
        break;
      case 'c':
        ctxAddEvent(c, t, '💬 ' + cleanIdent(parts[1]) + ': ' + (parts[2] || ''));
        break;
      case 'c:':
        ctxAddEvent(c, t, '💬 ' + cleanIdent(parts[2]) + ': ' + (parts[3] || ''));
        break;
      case 'chat':
        ctxAddEvent(c, t, '💬 ' + (parts[1] || ''));
        break;
    }
  }

  function cancelSelectedMove() {
    var undoBtn = document.querySelector('button[name="undo"], button[name="clearMove"], button[name="chooseUndo"], button[value="undo"], button[value="cancel"]');
    if (undoBtn) {
      undoBtn.click();
      return true;
    }
    var room = getBattleRoom();
    if (room) {
      if (typeof room.undo === 'function') {
        room.undo();
        return true;
      }
      if (typeof room.send === 'function') {
        room.send('/undo');
        return true;
      }
    }
    return false;
  }

  function executeSwitch(mon, slot) {
    var monSpecies = mon ? (mon.details ? mon.details.split(',')[0].trim().toLowerCase() : (mon.name || mon.species || '').trim().toLowerCase()) : '';
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
      for (var s2 = 0; s2 < switchBtns.length; s2++) {
        var btnVal = parseInt(switchBtns[s2].value, 10);
        if (btnVal === slot || btnVal === (slot - 1)) {
          targetBtn = switchBtns[s2];
          break;
        }
      }
    }

    if (targetBtn) {
      targetBtn.click();
    } else {
      var room = getBattleRoom();
      if (room && typeof room.choose === 'function') {
        room.choose('switch', slot);
      } else if (room && typeof room.send === 'function') {
        room.send('/choose switch ' + slot);
      }
    }
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
    if (active && isMonAlive(active)) list.push(active);

    if (foeSide.pokemon && foeSide.pokemon.length) {
      for (var i = 0; i < foeSide.pokemon.length; i++) {
        var p = foeSide.pokemon[i];
        if (p && p !== active && list.indexOf(p) === -1 && isMonAlive(p)) {
          list.push(p);
        }
      }
    }
    return list;
  }

  function getMyAliveTeam() {
    var req = getBattleRequest();
    var list = [];
    if (req && req.side && req.side.pokemon && req.side.pokemon.length) {
      for (var i = 0; i < req.side.pokemon.length; i++) {
        var p = req.side.pokemon[i];
        if (isMonAlive(p)) {
          list.push({ mon: p, slot: i + 1 });
        }
      }
      return list;
    }
    var room = getBattleRoom();
    if (room && room.battle) {
      var b = room.battle;
      var mySide = b.yourSide || (b.sides && (b.mySide && b.mySide.n !== undefined ? b.sides[b.mySide.n] : b.sides[0])) || b.mySide;
      if (mySide && mySide.pokemon) {
        for (var j = 0; j < mySide.pokemon.length; j++) {
          var mon = mySide.pokemon[j];
          if (isMonAlive(mon)) {
            list.push({ mon: mon, slot: j + 1 });
          }
        }
      }
    }
    return list;
  }

  function getMyFullTeam() {
    var req = getBattleRequest();
    var out = [];
    if (req && req.side && req.side.pokemon && req.side.pokemon.length) {
      for (var i = 0; i < req.side.pokemon.length; i++) out.push({ mon: req.side.pokemon[i], slot: i + 1 });
      return out;
    }
    var room = getBattleRoom();
    var side = room && room.battle && (room.battle.yourSide || room.battle.mySide);
    if (side && side.pokemon) {
      for (var j = 0; j < side.pokemon.length; j++) out.push({ mon: side.pokemon[j], slot: j + 1 });
    }
    return out;
  }

  function getFoeFullTeam() {
    var room = getBattleRoom();
    if (!room || !room.battle) return [];
    var b = room.battle;
    var foeSide = (b.mySide && b.mySide.foe) || b.farSide || b.foe;
    return (foeSide && foeSide.pokemon) ? foeSide.pokemon : [];
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

    var baseName = foe.details ? foe.details.split(',')[0] : (foe.species || foe.name || '');
    var dex = resolveSpeciesData(baseName);
    if (dex && dex.types) return dex.types;
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

  function getTargetButtons() {
    var room = getBattleRoom();
    var root = (room && room.el) ? room.el : document;
    var btns = root.querySelectorAll('button.movetarget, .movetarget button, button[name="chooseTarget"]');
    var out = [];
    for (var i = 0; i < btns.length; i++) {
      if (!btns[i].disabled && btns[i].offsetParent !== null && btns[i].offsetWidth > 0) {
        out.push(btns[i]);
      }
    }
    return out;
  }

  function ensureTargetBar() {
    var bar = document.getElementById('cp-targetbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cp-targetbar';
      document.body.appendChild(bar);
    }
    return bar;
  }

  function updateTargetBar() {
    var bar = ensureTargetBar();
    if (!targetState.active || !targetState.buttons.length) {
      bar.style.display = 'none';
      return;
    }
    var b = targetState.buttons[targetState.index];
    var label = b ? (b.getAttribute('data-target') || b.innerText.replace(/\\n/g, ' ') || ('Target ' + (targetState.index + 1))) : '';
    bar.innerHTML = '🎯 Target: <b>' + escHtml(label) + '</b> (' + (targetState.index + 1) + '/' + targetState.buttons.length + ') &nbsp;[◄►] Cycle | [OK] Confirm | [#] Cancel';
    bar.style.display = 'block';
  }

  function highlightTarget() {
    for (var i = 0; i < targetState.buttons.length; i++) {
      if (i === targetState.index) targetState.buttons[i].classList.add('cp-target-sel');
      else targetState.buttons[i].classList.remove('cp-target-sel');
    }
    updateTargetBar();
  }

  function enterTargetModeIfAvailable() {
    if (targetState.active) return;
    var btns = getTargetButtons();
    if (btns.length >= 1) {
      targetState.active = true;
      targetState.buttons = btns;
      targetState.index = 0;
      highlightTarget();
    }
  }

  function exitTargetMode() {
    for (var i = 0; i < targetState.buttons.length; i++) {
      targetState.buttons[i].classList.remove('cp-target-sel');
    }
    targetState.active = false;
    targetState.buttons = [];
    targetState.index = 0;
    updateTargetBar();
  }

  function cycleTarget(d) {
    var n = targetState.buttons.length;
    if (!n) return;
    targetState.index = (targetState.index + d + n) % n;
    highlightTarget();
  }

  function confirmTarget() {
    var b = targetState.buttons[targetState.index];
    exitTargetMode();
    if (b) b.click();
  }

  function cancelTargetMode() {
    exitTargetMode();
    cancelSelectedMove();
  }

  function buildDamageEstimate(dexData, activeMon, reqActive) {
    if (!dexData) return '<div style="color:#ff5555;">Move data unavailable for estimate.</div>';
    if (dexData.category === 'Status' || !dexData.basePower) {
      return '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Damage Estimate:</b> Status move — no direct damage.</div>';
    }

    var foe = getOpponentActive();
    if (!foe) return '<div style="margin-top:3px;"><b>Damage Estimate:</b> No active opponent.</div>';

    var room = getBattleRoom();
    var level = parseLevel(activeMon) || parseLevel(reqActive) || 100;
    var foeLevel = parseLevel(foe) || 100;
    var atkKey = dexData.category === 'Physical' ? 'atk' : 'spa';
    var defKey = dexData.category === 'Physical' ? 'def' : 'spd';

    var myBattleMon = room && room.battle && room.battle.mySide && room.battle.mySide.active && room.battle.mySide.active[0];
    var myStats = (activeMon && activeMon.stats) || (myBattleMon && myBattleMon.stats) || null;
    var myBoosts = (myBattleMon && myBattleMon.boosts) || (activeMon && activeMon.boosts) || {};
    var A;
    if (myStats && myStats[atkKey]) {
      A = [myStats[atkKey], myStats[atkKey]];
    } else {
      var myBaseName = activeMon ? (activeMon.details ? activeMon.details.split(',')[0] : (activeMon.name || '')) : '';
      var myDex = resolveSpeciesData(myBaseName);
      var myBase = (myDex && myDex.baseStats && myDex.baseStats[atkKey]) || 100;
      A = estimateStatRange(myBase, level);
    }

    var foeDex = resolveSpeciesData(foe.details ? foe.details.split(',')[0] : (foe.species || foe.name));
    var foeBase = (foeDex && foeDex.baseStats && foeDex.baseStats[defKey]) || 100;
    var Dest = estimateStatRange(foeBase, foeLevel);
    var foeBoosts = foe.boosts || {};
    var Dm = boostMul(foeBoosts[defKey] || 0);
    var D = [Math.floor(Dest[0] * Dm), Math.floor(Dest[1] * Dm)];

    var foeBaseHP = (foeDex && foeDex.baseStats && foeDex.baseStats.hp) || 80;
    var estFoeMaxHP = Math.floor((2 * foeBaseHP + 31 + 63) * foeLevel / 100) + foeLevel + 10;

    var foeTypes = getOpponentTypes(foe);
    var myTypes = (activeMon && activeMon.types) || [];
    if (!myTypes.length) {
      var ad = resolveSpeciesData(activeMon ? (activeMon.details ? activeMon.details.split(',')[0] : (activeMon.name || '')) : '');
      myTypes = (ad && ad.types) || [];
    }
    if (activeMon && activeMon.terastallized && activeMon.teraType && activeMon.terastallized !== 'Stellar') {
      myTypes = [activeMon.teraType];
    }

    var eff = getEffectiveness(dexData.type, foeTypes);
    if (eff === 0) {
      return '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Damage Estimate:</b> <span class="eff-badge eff-immune">Immune (0×)</span></div>';
    }

    var mid = dexData.id || String(dexData.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var notes = [];

    var fixedDmg = 0;
    if (mid === 'seismictoss' || mid === 'nightshade') fixedDmg = level;
    else if (mid === 'dragonrage') fixedDmg = 40;
    else if (mid === 'sonicboom') fixedDmg = 20;
    if (fixedDmg > 0) {
      var fTxt = fixedDmg + ' HP (' + Math.round(fixedDmg * 100 / estFoeMaxHP) + '%)';
      return '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b style="color:#00ffcc;">Damage Estimate:</b> <b>' + fTxt + '</b> <span style="color:#888;font-size:8.5px;">(fixed)</span></div>';
    }

    var bp = dexData.basePower;
    if (mid === 'return' || mid === 'frustration') bp = 102;
    if (mid.indexOf('hiddenpower') === 0) bp = 60;

    var stab = 1;
    if (myTypes.indexOf(dexData.type) >= 0) { stab = 1.5; notes.push('STAB'); }

    var itemM = 1;
    var myItem = (activeMon && activeMon.item) || '';
    if (myItem) {
      var iid = String(myItem).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (dexData.category === 'Physical' && iid === 'choiceband') { itemM = 1.5; notes.push('Choice Band'); }
      else if (dexData.category === 'Special' && iid === 'choicespecs') { itemM = 1.5; notes.push('Choice Specs'); }
      else if (iid === 'lifeorb') { itemM = 1.3; notes.push('Life Orb'); }
    }

    var wx = 1;
    var weather = room && room.battle && room.battle.weather;
    var wid = weather ? String(weather).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    if (wid === 'raindance' || wid === 'primordialsea') {
      if (dexData.type === 'Water') { wx = 1.5; notes.push('Rain'); }
      if (dexData.type === 'Fire') { wx = (wid === 'primordialsea') ? 0 : 0.5; notes.push('Rain'); }
    } else if (wid === 'sunnyday' || wid === 'desolateland') {
      if (dexData.type === 'Fire') { wx = 1.5; notes.push('Sun'); }
      if (dexData.type === 'Water') { wx = (wid === 'desolateland') ? 0 : 0.5; notes.push('Sun'); }
    }
    if (wx === 0) {
      return '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Damage Estimate:</b> Blocked by weather (0 damage).</div>';
    }

    var burnM = 1;
    if (dexData.category === 'Physical' && activeMon && activeMon.status === 'brn') { burnM = 0.5; notes.push('Burn'); }

    var scrM = 1;
    var farSide = room && room.battle && (room.battle.farSide || room.battle.p2);
    var sc = farSide && farSide.sideConditions;
    if (sc) {
      if (dexData.category === 'Physical' && sc.reflect) { scrM = 0.5; notes.push('Reflect'); }
      if (dexData.category === 'Special' && sc.lightscreen) { scrM = 0.5; notes.push('Light Screen'); }
      if (sc.auroraveil) { scrM = 0.5; notes.push('Aurora Veil'); }
    }

    var Am = boostMul(myBoosts[atkKey] || 0);
    var Alo = Math.floor(A[0] * Am), Ahi = Math.floor(A[1] * Am);

    function dmg(Av, Dv, roll) {
      var base = Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * bp * Av / Dv) / 50) + 2;
      var d = Math.floor(base * stab);
      d = Math.floor(d * itemM);
      d = Math.floor(d * wx);
      d = Math.floor(d * burnM);
      d = Math.floor(d * scrM);
      d = Math.floor(d * eff);
      return Math.max(1, Math.floor(d * roll));
    }

    var minDmg = dmg(Alo, D[1], 0.85);
    var maxDmg = dmg(Ahi, D[0], 1.0);
    var minPct = Math.round(minDmg * 100 / estFoeMaxHP);
    var maxPct = Math.round(maxDmg * 100 / estFoeMaxHP);

    var text = minPct + '–' + maxPct + '% HP (' + minDmg + '–' + maxDmg + ' dmg)';

    var html = '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;background:rgba(0,255,204,0.05);padding:3px;border-radius:3px;">';
    html += '<b style="color:#00ffcc;">Damage vs ' + escHtml(cleanIdent(foe.name || foe.species || 'Foe')) + ':</b><br>';
    html += '<span style="font-size:11px;font-weight:bold;">' + text + '</span><br>';
    html += '<span style="color:#888;font-size:8.5px;">Est. vs ' + estFoeMaxHP + ' max HP' + (notes.length ? ' · ' + escHtml(notes.join(', ')) : '') + '</span></div>';
    return html;
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
    var isHash = (key === '#' || key === 'Hash' || key === 'Pound' || code === 192);
    var isEscape = (key === 'Escape' || code === 27);

    if (isCall) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    var isUp = (key === 'ArrowUp' || code === 38);
    var isDown = (key === 'ArrowDown' || code === 40);
    var isLeft = (key === 'ArrowLeft' || code === 37);
    var isRight = (key === 'ArrowRight' || code === 39);

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
        if (isHash || isEscape) {
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
      if (isHash || isEscape || key === '9' || code === 57 || eventCode === 'Digit9' || eventCode === 'Numpad9') {
        hideChatModal();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (targetState.active) {
      if (isLeft) cycleTarget(-1);
      else if (isRight) cycleTarget(1);
      else if (isEnter || isCall) confirmTarget();
      else if (isHash || isEscape) cancelTargetMode();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (activeInspectType && (isLeft || isRight || isUp || isDown)) {
      if (isLeft || isRight) {
        var delta = isRight ? 1 : -1;
        if (activeInspectType === 'move') {
          var nextMove = activeInspectIndex + delta;
          if (nextMove > 4) nextMove = 1;
          if (nextMove < 1) nextMove = 4;
          inspectMove(nextMove);
        } else if (activeInspectType === 'opponent') {
          var foeTeam = getFoeTeam();
          if (foeTeam.length > 0) {
            var nextFoe = activeInspectIndex + delta;
            if (nextFoe > foeTeam.length) nextFoe = 1;
            if (nextFoe < 1) nextFoe = foeTeam.length;
            inspectOpponent(nextFoe);
          }
        } else if (activeInspectType === 'myteam') {
          var aliveTeam = getMyAliveTeam();
          if (aliveTeam.length > 0) {
            var nextMon = activeInspectIndex + delta;
            if (nextMon > aliveTeam.length) nextMon = 1;
            if (nextMon < 1) nextMon = aliveTeam.length;
            inspectMyTeam(nextMon);
          }
        }
      } else if (isUp || isDown) {
        var bodyEl = document.getElementById('cp-insp-body');
        if (activeInspectType === 'move' && bodyEl) {
          var atBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight <= 2;
          var atTop = bodyEl.scrollTop <= 2;
          if (isDown) {
            if (!atBottom) {
              bodyEl.scrollTop += 35;
            } else if (activeMoveLevel < 3) {
              activeMoveLevel++;
              inspectMove(activeInspectIndex);
            }
          } else {
            if (!atTop) {
              bodyEl.scrollTop -= 35;
            } else if (activeMoveLevel > 1) {
              activeMoveLevel--;
              inspectMove(activeInspectIndex);
            }
          }
        } else if (bodyEl) {
          bodyEl.scrollTop += isDown ? 35 : -35;
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
        setTimeout(enterTargetModeIfAvailable, 200);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      } else if (activeInspectType === 'myteam') {
        var aliveTeam2 = getMyAliveTeam();
        var target = aliveTeam2[activeInspectIndex - 1];
        if (target && target.mon && !target.mon.active) {
          executeSwitch(target.mon, target.slot);
          hideInspector();
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    if (isHash) {
      if (activeInspectType === 'move' && activeMoveLevel > 1) {
        activeMoveLevel--;
        inspectMove(activeInspectIndex);
      } else if (activeInspectType) {
        hideInspector();
      } else {
        cancelSelectedMove();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (isEscape) {
      if (activeInspectType === 'move' && activeMoveLevel > 1) {
        activeMoveLevel--;
        inspectMove(activeInspectIndex);
      } else if (activeInspectType) {
        hideInspector();
      } else {
        cancelSelectedMove();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '0' || code === 48) {
      if (activeInspectType === 'move') {
        hideInspector();
      } else {
        activeMoveLevel = 1;
        var focused = document.activeElement;
        if (focused && focused.name === 'chooseMove') {
          inspectMove(focused.value || '1');
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

    if (key === '3' || code === 51 || eventCode === 'Digit3' || eventCode === 'Numpad3') {
      if (activeInspectType === 'guide') {
        hideInspector();
      } else {
        inspectGuide();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '4' || code === 52 || eventCode === 'Digit4' || eventCode === 'Numpad4') {
      if (activeInspectType === 'preview') {
        hideInspector();
      } else {
        inspectPreview();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '5' || code === 53 || eventCode === 'Digit5' || eventCode === 'Numpad5') {
      if (activeInspectType === 'history') {
        hideInspector();
      } else {
        inspectHistory();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (key === '6' || code === 54 || eventCode === 'Digit6' || eventCode === 'Numpad6') {
      if (activeInspectType === 'revealed') {
        hideInspector();
      } else {
        inspectRevealed();
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
      var gimmick = document.querySelector('input[name="terastallize"], input[name="megaEvolution"], input[name="dynamax"], input[name="zmove"], input[name="ultraBurst"], button[name="terastallize"], button[name="megaEvolution"], button[name="dynamax"], button[name="zmove"], button[name="ultraBurst"]');
      if (gimmick) {
        gimmick.click();
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }, true);

  function inspectMove(index) {
    index = Number(index) || 1;
    var moveBtn = document.querySelector('button[name="chooseMove"][value="' + index + '"]') ||
                  document.querySelectorAll('button[name="chooseMove"]')[index - 1];

    var req = getBattleRequest();
    var activeMon = req && req.side && req.side.pokemon && (req.side.pokemon.find(function(p) { return p.active; }) || req.side.pokemon[0]);
    var reqActive = req && req.active && req.active[0];
    var reqMove = reqActive && reqActive.moves && reqActive.moves[index - 1];

    var rawName = (moveBtn && (moveBtn.getAttribute('data-move') || moveBtn.innerText.split('\\n')[0])) || (reqMove && reqMove.move) || ('Move ' + index);
    var dexData = resolveMoveData(rawName) || (reqMove && reqMove.move ? resolveMoveData(reqMove.move) : null);

    var foeTypes = getOpponentTypes();
    var foe = getOpponentActive();
    var foeName = foe ? cleanIdent(foe.name || foe.species || 'Opponent') : 'Opponent';

    var moveName = (dexData && dexData.name) || (reqMove && reqMove.move) || rawName;
    var type = (dexData && dexData.type) || 'Normal';
    var category = (dexData && dexData.category) || '';
    var bp = dexData && dexData.basePower ? dexData.basePower : '—';
    var acc = dexData ? (dexData.accuracy === true ? '—' : dexData.accuracy + '%') : '—';
    var ppText = reqMove && reqMove.pp !== undefined ? (reqMove.pp + '/' + reqMove.maxpp) : '—';

    var mult = (category === 'Status') ? 1 : getEffectiveness(type, foeTypes);
    var effHtml = (category === 'Status') ? '<span class="eff-badge eff-neutral">Status</span>' : formatMultiplierBadge(mult);

    var activeSpecies = activeMon ? (activeMon.details ? activeMon.details.split(',')[0] : (activeMon.name || 'Active')) : 'Active';
    var activeDex = resolveSpeciesData(activeSpecies);
    var activeTypes = (activeMon && activeMon.types) || (activeDex && activeDex.types) || [];
    if (activeMon && activeMon.terastallized && activeMon.teraType && activeMon.terastallized !== 'Stellar') {
      activeTypes = [activeMon.teraType];
    }
    var activeSpeed = (activeMon && activeMon.stats && activeMon.stats.spe) ? activeMon.stats.spe :
                      (reqActive && reqActive.stats && reqActive.stats.spe) ||
                      (activeDex && activeDex.baseStats ? activeDex.baseStats.spe : '—');

    var html = '';
    html += '<div style="background:rgba(255,255,255,0.06);padding:2px 4px;border-radius:3px;margin-bottom:3px;font-size:9.5px;">' +
            '<b>' + escHtml(activeSpecies) + '</b> (' + (activeTypes.join('/') || '—') + (activeMon && activeMon.teraType ? ' [' + activeMon.teraType + ']' : '') + ') &nbsp;|&nbsp; <b>Spe:</b> ' + activeSpeed + '</div>';

    html += '<div><b>Type:</b> ' + type + ' ' + (category ? '(' + category + ')' : '') + '</div>';
    html += '<div><b>BP:</b> ' + bp + ' &nbsp;|&nbsp; <b>Acc:</b> ' + acc + ' &nbsp;|&nbsp; <b>PP:</b> ' + ppText + '</div>';
    html += '<div style="margin: 3px 0;"><b>Vs ' + escHtml(foeName) + ' (' + (foeTypes.join('/') || '—') + '):</b><br>' + effHtml + '</div>';

    if (activeMoveLevel >= 2 && dexData) {
      html += '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Full Description:</b><br>' +
              '<span style="color:#ccc;font-size:9px;">' + escHtml(dexData.desc || dexData.shortDesc || 'No description available.') + '</span></div>';
    }

    if (activeMoveLevel >= 3) {
      html += buildDamageEstimate(dexData, activeMon, reqActive);
    }

    if (activeMoveLevel === 1 && dexData && (dexData.shortDesc || dexData.desc)) {
      html += '<div style="margin-top:2px;color:#bbb;font-size:9px;">' + escHtml(dexData.shortDesc || dexData.desc) + '</div>';
    }

    if (reqMove && reqMove.disabled) {
      html += '<div style="color:#ff5555;font-weight:bold;margin-top:2px;">[DISABLED]</div>';
    }

    var lvlTag = ' <span style="color:#888;">[Detail ' + activeMoveLevel + '/3]</span>';
    showInspector('⚡ Move ' + index + '/4: ' + escHtml(moveName) + lvlTag, html, 'move', index, false);
  }

  function inspectOpponent(index) {
    index = Number(index) || 1;
    var foeTeam = getFoeTeam();
    if (!foeTeam.length) {
      showInspector('🎯 Opponent Team', '<div>No alive opponent Pokémon revealed yet.</div>', 'opponent', 1, false);
      return;
    }

    if (index > foeTeam.length) index = 1;
    if (index < 1) index = foeTeam.length;

    var foe = foeTeam[index - 1];
    var foeTypes = getOpponentTypes(foe);

    var cleanName = cleanIdent(foe.name || foe.species || 'Unknown');
    var pDex = resolveSpeciesData(foe.details ? foe.details.split(',')[0] : cleanName) || {};
    var baseSpe = (pDex.baseStats && pDex.baseStats.spe) || 0;

    var level = parseLevel(foe) || 100;

    var speedText = '—';
    if (baseSpe > 0) {
      var minMin = Math.floor((Math.floor((2 * baseSpe) * level / 100) + 5) * 0.9);
      var minNeutral = Math.floor((2 * baseSpe + 31) * level / 100) + 5;
      var maxMax = Math.floor((Math.floor((2 * baseSpe + 94) * level / 100) + 5) * 1.1);

      var speBoost = (foe.boosts && foe.boosts.spe) ? foe.boosts.spe : 0;
      if (speBoost !== 0) {
        var bmul = boostMul(speBoost);
        minMin = Math.floor(minMin * bmul);
        minNeutral = Math.floor(minNeutral * bmul);
        maxMax = Math.floor(maxMax * bmul);
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
    var statusLabel = foe.active ? ' <span style="color:#00ffcc;font-weight:bold;">[ACTIVE]</span>' : '';

    var moves = getKnownMoves(foe);

    var html = '';
    html += '<div><b>Types:</b> ' + (foeTypes.join(' / ') || 'Unknown') + teraLabel + statusLabel + '</div>';
    html += '<div><b>Status:</b> ' + monStatus(foe) + ' &nbsp;|&nbsp; <b>Boosts:</b> ' + escHtml(boostsText(foe)) + '</div>';
    html += '<div><b>Speed (Lv ' + level + '):</b> ' + speedText + '</div>';
    html += '<div style="margin-top:2px;"><b>Item:</b> ' + escHtml(itemText) + '</div>';
    if (itemDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + escHtml(itemDesc) + '</div>';
    html += '<div><b>Ability:</b> ' + escHtml(abilityText) + '</div>';
    if (abilityDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + escHtml(abilityDesc) + '</div>';

    if (moves.length) {
      html += '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Revealed Moves:</b></div>';
      for (var m = 0; m < moves.length; m++) {
        var mName = moves[m];
        var mData = resolveMoveData(mName);
        var mType = (mData && mData.type) || '—';
        var mCat = (mData && mData.category) ? '(' + mData.category[0] + ')' : '';
        var mBp = (mData && mData.basePower) ? mData.basePower : '—';
        html += '<div style="font-size:9px;margin:1px 0;">• ' + escHtml(mName) + ' <span style="color:#ffd700;">[' + mType + ' ' + mCat + ']</span> (BP: ' + mBp + ')</div>';
      }
    } else {
      html += '<div style="margin-top:3px;color:#888;font-size:9px;"><b>Revealed Moves:</b> None revealed yet</div>';
    }

    html += renderDefensiveProfile(foeTypes);

    showInspector('🎯 Opponent ' + index + '/' + foeTeam.length + ': ' + escHtml(cleanName), html, 'opponent', index, false);
  }

  function inspectMyTeam(index) {
    index = Number(index) || 1;
    var aliveTeam = getMyAliveTeam();
    if (!aliveTeam.length) {
      showInspector('🛡️ My Team & Switch', '<div>No alive Pokémon available.</div>', 'myteam', 1, false);
      return;
    }

    if (index > aliveTeam.length) index = 1;
    if (index < 1) index = aliveTeam.length;

    var item = aliveTeam[index - 1];
    var mon = item.mon;
    var slot = item.slot;

    var rawName = mon ? (mon.details ? mon.details.split(',')[0] : (mon.name || mon.species || ('Slot ' + slot))) : ('Slot ' + slot);
    var pDex = resolveSpeciesData(rawName) || {};

    var monTypes = (mon && mon.types && mon.types.length) ? mon.types : (pDex.types || []);
    if (mon && mon.teraType) {
      monTypes = (mon.terastallized && mon.terastallized !== 'Stellar') ? [mon.terastallized] : monTypes;
    }

    var s = (mon && mon.stats) ? mon.stats : ((pDex && pDex.baseStats) ? pDex.baseStats : {});
    var itemDesc = getItemDesc(mon ? mon.item : '');
    var abilityDesc = getAbilityDesc(mon ? mon.ability : '');

    var statusBadge = mon.active
      ? ' <span style="color:#00ffcc;font-weight:bold;">[ACTIVE IN BATTLE]</span>'
      : ' <span style="color:#ffd700;font-weight:bold;">[BENCH - PRESS CALL/OK TO SWITCH]</span>';

    var html = '';
    html += '<div><b>Types:</b> ' + (monTypes.join(' / ') || 'Unknown') + (mon && mon.teraType ? ' [Tera: ' + mon.teraType + ']' : '') + statusBadge + '</div>';
    html += '<div><b>Status:</b> ' + monStatus(mon) + ' &nbsp;|&nbsp; <b>Boosts:</b> ' + escHtml(boostsText(mon)) + '</div>';

    html += '<div style="background:rgba(255,255,255,0.06);padding:2px 4px;border-radius:3px;margin:2px 0;font-size:9px;">' +
            '<b>HP:</b> ' + (mon ? (mon.condition || '—') : '—') + ' &nbsp;|&nbsp; <b>Spe:</b> <span style="color:#00ffcc;font-weight:bold;">' + (s.spe || '—') + '</span><br>' +
            '<b>Atk:</b> ' + (s.atk || '—') + ' | <b>Def:</b> ' + (s.def || '—') + ' | <b>SpA:</b> ' + (s.spa || '—') + ' | <b>SpD:</b> ' + (s.spd || '—') +
            '</div>';

    html += '<div style="margin-top:2px;"><b>Item:</b> ' + (mon && mon.item ? escHtml(mon.item) : 'None') + '</div>';
    if (itemDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + escHtml(itemDesc) + '</div>';
    html += '<div><b>Ability:</b> ' + (mon && mon.ability ? escHtml(mon.ability) : 'Unknown') + '</div>';
    if (abilityDesc) html += '<div style="color:#aaa;font-size:8.5px;margin-bottom:2px;">↳ ' + escHtml(abilityDesc) + '</div>';

    var foe = getOpponentActive();
    var foeTypes = getOpponentTypes(foe);
    var foeName = foe ? cleanIdent(foe.name || foe.species || 'Opponent') : 'Opponent';

    if (mon.moves && mon.moves.length) {
      html += '<div style="margin-top:3px;border-top:1px solid #333;padding-top:2px;"><b>Moves vs ' + escHtml(foeName) + ' (' + (foeTypes.join('/') || '—') + '):</b></div>';
      for (var i = 0; i < mon.moves.length; i++) {
        var mName = mon.moves[i];
        var mData = resolveMoveData(mName);
        var mType = (mData && mData.type) || 'Normal';
        var mCategory = (mData && mData.category) || '';
        var mBp = (mData && mData.basePower) ? mData.basePower : '—';
        var mult = (mCategory === 'Status') ? 1 : getEffectiveness(mType, foeTypes);
        var effBadge = (mCategory === 'Status') ? '<span class="eff-badge eff-neutral">Status</span>' : formatMultiplierBadge(mult);

        html += '<div style="font-size:9px;margin:2px 0;">• <b>' + escHtml(mName) + '</b> <span style="color:#ffd700;">[' + mType + (mCategory ? ' ' + mCategory[0] : '') + ']</span> (BP: ' + mBp + ') ' + effBadge + '</div>';
      }
    }

    html += renderDefensiveProfile(monTypes);

    var titlePrefix = mon.active ? '🛡️ [Active] ' : '🔄 [Switch] ';
    showInspector(titlePrefix + 'Slot ' + slot + ' (' + index + '/' + aliveTeam.length + '): ' + escHtml(rawName), html, 'myteam', index, mon.active);
  }

  function renderTeamLine(p, i, foeActive) {
    var name = cleanIdent(p.name || p.species || '?');
    var sp = resolveSpeciesData(p.details ? p.details.split(',')[0] : name);
    var types = (p.types && p.types.length) ? p.types : ((sp && sp.types) || []);
    var active = p.active || (foeActive && foeActive === p);
    var fainted = !isMonAlive(p);
    var hpTxt = fainted ? '' : (p.condition ? hpPctText(p.condition) || p.condition : '');
    return '<div style="font-size:9px;margin:1px 0;">' + (i + 1) + '. <b>' + escHtml(name) + '</b>' +
      (fainted ? ' <span style="color:#ff5555;">[FNT]</span>' : (active ? ' <span style="color:#00ffcc;">[ACTIVE]</span>' : '')) +
      ' <span style="color:#888;">' + escHtml(hpTxt) + (hpTxt && types.length ? ' · ' : '') + types.join('/') + '</span></div>';
  }

  function inspectPreview() {
    var mine = getMyFullTeam();
    var foes = getFoeFullTeam();
    var foeActive = getOpponentActive();

    var html = '<div style="font-weight:bold;color:#00ffcc;">Your Team (' + mine.length + ')</div>';
    for (var i = 0; i < mine.length; i++) html += renderTeamLine(mine[i].mon, i, null);

    html += '<div style="border-top:1px solid #333;margin:4px 0 2px;padding-top:3px;font-weight:bold;color:#00ffcc;">Opponent — revealed only (' + foes.length + ')</div>';
    if (!foes.length) html += '<div style="color:#888;font-size:9px;">Nothing revealed yet — no guessing.</div>';
    for (var j = 0; j < foes.length; j++) html += renderTeamLine(foes[j], j, foeActive);

    showInspector('🗂 Team Preview', html, 'preview', 1, false);
  }

  function inspectHistory() {
    var room = getBattleRoom();
    var c = (room && room.id) ? BATTLE_CTX[room.id] : null;
    var html = '';

    if (!c || !c.events.length) {
      html = '<div style="color:#888;">No turn history recorded yet.</div>';
    } else {
      var lastT = -1;
      for (var i = 0; i < c.events.length; i++) {
        var ev = c.events[i];
        if (ev.t !== lastT) {
          html += '<div style="border-top:1px solid #333;margin:3px 0 1px;padding-top:2px;font-weight:bold;color:#00ffcc;">Turn ' + ev.t + '</div>';
          lastT = ev.t;
        }
        html += '<div style="font-size:9px;">' + escHtml(ev.s) + '</div>';
      }
    }
    showInspector('📜 Turn History', html, 'history', 1, false);
  }

  function inspectRevealed() {
    var room = getBattleRoom();
    var c = (room && room.id) ? BATTLE_CTX[room.id] : null;
    var entries = [];

    if (c) {
      var myId = (room.battle && room.battle.mySide && room.battle.mySide.id) || 'p1';
      var foeId = (myId === 'p1') ? 'p2' : 'p1';
      for (var k in c.revealed) {
        if (String(k).indexOf(foeId) === 0) entries.push({ ident: cleanIdent(k), r: c.revealed[k] });
      }
    }

    var html = '';
    if (!entries.length) {
      html = '<div style="color:#888;">No opponent information revealed yet.</div>';
    }
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], r = e.r;
      html += '<div style="border-top:1px solid #333;margin:3px 0 1px;padding-top:2px;"><b>' + escHtml(e.ident) + '</b>' +
        (r.species ? ' <span style="color:#888;">(' + escHtml(r.species) + ' · since Turn ' + r.firstTurn + ')</span>' : '') + '</div>';
      if (r.ability) html += '<div style="font-size:9px;">Ability: ' + escHtml(r.ability) + '</div>';
      if (r.item) html += '<div style="font-size:9px;">Item: ' + escHtml(r.item) + '</div>';
      if (r.tera) html += '<div style="font-size:9px;">Tera: ' + escHtml(r.tera) + '</div>';
      var mv = Object.keys(r.moves);
      if (mv.length) html += '<div style="font-size:9px;">Moves: ' + escHtml(mv.join(', ')) + '</div>';
    }
    showInspector('🔎 Revealed Info (History)', html, 'revealed', 1, false);
  }

  function inspectGuide() {
    var html = '';
    html += '<div style="font-weight:bold;color:#00ffcc;margin-bottom:3px;">Keypad Controls:</div>';
    html += '<div style="margin:2px 0;"><b>[0]</b> Move Analysis ([▼ at end] Desc → Dmg)</div>';
    html += '<div style="margin:2px 0;"><b>[1]</b> Opponent Analysis (Alive Only)</div>';
    html += '<div style="margin:2px 0;"><b>[2]</b> My Team & Switch (Alive Only)</div>';
    html += '<div style="margin:2px 0;"><b>[3]</b> Controls Guide (This Menu)</div>';
    html += '<div style="margin:2px 0;"><b>[4]</b> Team Preview (Revealed Only)</div>';
    html += '<div style="margin:2px 0;"><b>[5]</b> Turn History (Per-Battle)</div>';
    html += '<div style="margin:2px 0;"><b>[6]</b> Revealed Info History</div>';
    html += '<div style="margin:2px 0;"><b>[9]</b> Battle Chat & Log Overlay</div>';
    html += '<div style="margin:2px 0;"><b>[*]</b> Tera / Mega / Dynamax / Z-Move</div>';
    html += '<div style="margin:2px 0;"><b>[#]</b> Back / Cancel / Undo Move</div>';
    html += '<div style="margin:2px 0;"><b>[CALL / OK]</b> Use Move / Switch / Send / Confirm</div>';
    html += '<div style="border-top:1px solid #333;margin-top:4px;padding-top:3px;font-weight:bold;color:#00ffcc;">D-Pad Navigation:</div>';
    html += '<div style="margin:2px 0;"><b>[◄ / ►]</b> Cycle Entries (Moves, Foe, Team)</div>';
    html += '<div style="margin:2px 0;"><b>[▲ / ▼]</b> Scroll • In [0]: Subview at bounds</div>';
    html += '<div style="margin:2px 0;"><b>[Doubles]</b> ◄► pick target • OK confirm • # cancel</div>';
    showInspector('📖 Battle Controls Guide', html, 'guide', 1, false);
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

      if (typeof app.receive === 'function' && !app.__cpTapped) {
        app.__cpTapped = true;
        var origReceive = app.receive;
        app.receive = function(data) {
          try {
            var lines = String(data).split('\\n');
            var rid = null;
            for (var li = 0; li < lines.length; li++) {
              var ln = lines[li];
              if (ln.charAt(0) === '>') { rid = ln.substr(1).trim(); continue; }
              if (rid && rid.indexOf('battle-') === 0) {
                try { handleProtocolLine(rid, ln); } catch (err) {}
              }
            }
          } catch (err) {}
          return origReceive.apply(this, arguments);
        };
      }
    }

    if (targetState.active) {
      var tb = getTargetButtons();
      if (!tb.length) {
        exitTargetMode();
      } else {
        var changed = tb.length !== targetState.buttons.length;
        if (!changed) {
          for (var q = 0; q < tb.length; q++) {
            if (tb[q] !== targetState.buttons[q]) { changed = true; break; }
          }
        }
        if (changed) {
          targetState.buttons = tb;
          if (targetState.index >= tb.length) targetState.index = 0;
          highlightTarget();
        }
      }
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
</script>
`;

function sanitizeResponseHeaders(originalHeaders) {
  const headers = new Headers(originalHeaders);
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  headers.delete("x-frame-options");
  headers.delete("cross-origin-opener-policy");
  headers.delete("cross-origin-embedder-policy");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-credentials", "true");
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicHost = request.headers.get("host") || url.host;

    if (AD_TRACKER_PATTERN.test(url.pathname)) {
      return new Response("// Ad/Analytics disabled by proxy", {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    if (url.pathname === "/config/config.js") {
      try {
        const upstreamReq = new Request(`${TARGET_WEB}/config/config.js`, {
          headers: {
            "User-Agent": request.headers.get("user-agent") || "Mozilla/5.0",
            Referer: `${TARGET_WEB}/`,
            Origin: TARGET_WEB,
          },
        });
        const resp = await fetch(upstreamReq);
        let configText = await resp.text();

        configText += `
Config.server = Config.defaultserver = {
  id: 'showdown',
  host: 'sim3.psim.us',
  port: 443,
  httpport: 8000,
  altport: 80,
  ssl: true
};
Config.routes = Config.routes || {};
Config.routes.client = ${JSON.stringify(publicHost)};
`;

        return new Response(configText, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(`// Config proxy error: ${err.message}`, {
          status: 500,
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      }
    }

    const isSim = url.pathname.startsWith("/showdown");
    const targetBase = isSim ? TARGET_SIM : TARGET_WEB;
    const targetUrl = new URL(url.pathname + url.search, targetBase);

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set("Host", targetUrl.host);
    forwardHeaders.set("Origin", TARGET_WEB);
    forwardHeaders.set("Referer", `${TARGET_WEB}/`);

    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for");
    if (clientIp) {
      forwardHeaders.set("x-forwarded-for", clientIp);
      forwardHeaders.set("x-real-ip", clientIp.split(",")[0].trim());
    }

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: "manual",
    });

    const response = await fetch(proxyRequest);

    if (response.status === 101) {
      return response;
    }

    const resHeaders = sanitizeResponseHeaders(response.headers);

    const location = resHeaders.get("location");
    if (location && publicHost) {
      resHeaders.set(
        "location",
        location
          .replace("https://play.pokemonshowdown.com", `https://${publicHost}`)
          .replace("http://play.pokemonshowdown.com", `https://${publicHost}`)
      );
    }

    const setCookie = resHeaders.get("set-cookie");
    if (setCookie) {
      resHeaders.set("set-cookie", setCookie.replace(/;\s*Domain=[^;]+/gi, ""));
    }

    const contentType = resHeaders.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await response.text();

      html = html
        .split("//play.pokemonshowdown.com/config/config.js")
        .join(`//${publicHost}/config/config.js`);

      html = html.replace("<head>", `<head>${INJECTED_HEAD}`);
      html = html.includes("</body>")
        ? html.replace("</body>", `${INJECTED_BODY}</body>`)
        : html + INJECTED_BODY;

      resHeaders.delete("content-length");
      resHeaders.delete("content-encoding");

      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  },
};
