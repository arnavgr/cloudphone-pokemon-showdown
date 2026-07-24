/**
 * ============================================================================
 * POKÉMON SHOWDOWN — QVGA FEATURE PHONE PROXY
 * ============================================================================
 * Cloudflare Worker: Transparent reverse proxy for play.pokemonshowdown.com
 * Target: CloudMosa CloudPhone on 240×320 QVGA displays (D-Pad only input)
 *
 * Architecture:
 *   Browser (240×320) → Cloudflare Worker → play.pokemonshowdown.com
 *
 * Features:
 *   - Full HTTP/HTTPS + WebSocket (SockJS) transparent proxying
 *   - Header spoofing (Host, Origin, Referer) to bypass CORS/anti-proxy
 *   - Security header stripping (X-Frame-Options, CSP)
 *   - HTMLRewriter CSS injection for 240×320 single-column layout
 *   - D-Pad focus engineering with high-contrast :focus states
 *   - Battle viewport CSS transform scaling (640→240px)
 *
 * Deployment:
 *   wrangler deploy worker.js
 *   (or paste into Cloudflare Dashboard → Workers → Create Worker)
 * ============================================================================
 */

const TARGET_HOST = 'play.pokemonshowdown.com';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;

// ─── Scale Constants ──────────────────────────────────────────────────────────
// Native battle viewport: 640×360px (from battle.css)
// Target screen width: 240px
// Scale factor: 240 / 640 = 0.375
// Scaled battle height: 360 × 0.375 = 135px
// Remaining vertical budget: 320 - 135 = 185px for controls + log
const BATTLE_SCALE = 0.375;

// ─── Injected CSS ─────────────────────────────────────────────────────────────
const INJECTED_CSS = `
/* ═══════════════════════════════════════════════════════════════════════════
   POKÉMON SHOWDOWN — QVGA 240×320 FEATURE PHONE OVERRIDE
   Target: CloudMosa CloudPhone (Chromium-based remote browser)
   Input: D-Pad only (ArrowUp/Down/Left/Right + Enter, keyCode 37-40, 13)
   Screen: 240×320 QVGA, 102-200 ppi, TFT/IPS LCD
   Ref: developer.cloudfone.com/docs/guides/cloud-phone-design/
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 1. GLOBAL RESET & VIEWPORT LOCK ────────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box !important;
}

html, body {
  width: 240px !important;
  max-width: 240px !important;
  height: 320px !important;
  max-height: 320px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  font-size: 11px !important;
  -webkit-text-size-adjust: none !important;
}

/* Force single-column flexbox on the entire document */
body {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
}

/* ── 2. HEADER & TAB BAR (wrap to prevent horizontal overflow) ──────────── */
#header, .header {
  width: 240px !important;
  max-width: 240px !important;
  height: auto !important;
  min-height: 28px !important;
  padding: 2px 4px !important;
  overflow: hidden !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  flex-shrink: 0 !important;
}

.header .logo {
  height: 18px !important;
  width: auto !important;
}

.maintabbarbottom, .tabbar, .maintabbar {
  width: 240px !important;
  max-width: 240px !important;
  display: flex !important;
  flex-wrap: wrap !important;
  overflow: hidden !important;
  font-size: 9px !important;
}

.tabbar button, .maintabbar button, .maintabbarbottom button {
  font-size: 9px !important;
  padding: 3px 5px !important;
  min-height: 22px !important;
  white-space: nowrap !important;
}

/* ── 3. MAIN MENU — SINGLE COLUMN FLEXBOX ───────────────────────────────── */
.ps-room, #mainmenu, .mainmenuwrapper {
  width: 240px !important;
  max-width: 240px !important;
  display: flex !important;
  flex-direction: column !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  position: relative !important;
}

.leftmenu, .rightmenu, .activitymenu {
  position: static !important;
  width: 240px !important;
  max-width: 240px !important;
  padding: 0 !important;
  float: none !important;
}

.mainmenu {
  width: 240px !important;
  padding: 4px !important;
}

.mainmenufooter {
  width: 240px !important;
  font-size: 9px !important;
  padding: 4px !important;
}

.mainmenufooter a {
  font-size: 9px !important;
}

/* ── 4. BATTLE VIEWPORT — CSS TRANSFORM SCALING ─────────────────────────── */
/*
 * Native .battle is 640×360 (position:absolute in client.css).
 * We scale it to 240×135 using transform: scale(0.375) anchored top-left.
 * The negative margin-bottom reclaims the dead space from the unscaled
 * layout box (360 - 135 = 225px).
 * Internal absolute-positioned elements (sprites, statbars) remain intact
 * because they are children of the scaled container.
 */
.ps-room .battle, .battle {
  width: 640px !important;
  height: 360px !important;
  transform: scale(${BATTLE_SCALE}) !important;
  transform-origin: top left !important;
  -webkit-transform: scale(${BATTLE_SCALE}) !important;
  -webkit-transform-origin: top left !important;
  position: relative !important;
  top: 0 !important;
  left: 0 !important;
  border: 1px solid #555 !important;
  margin-bottom: -225px !important;
  flex-shrink: 0 !important;
}

.innerbattle {
  width: 640px !important;
  height: 360px !important;
  transform: none !important;
}

/* Clip container: ensures the scaled battle occupies exactly 240×135 */
.ps-room .battle-wrapper, .battle-wrapper {
  width: 240px !important;
  height: 135px !important;
  overflow: hidden !important;
  position: relative !important;
  flex-shrink: 0 !important;
}

/* ── 5. BATTLE LOG — REPOSITIONED BELOW BATTLE ──────────────────────────── */
.ps-room .battle-log {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 240px !important;
  max-width: 240px !important;
  height: 72px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  font-size: 9px !important;
  border: 1px solid #AAA !important;
  border-top: none !important;
}

.ps-room .battle-log .inner, .battle-log .inner {
  padding: 2px 4px !important;
  font-size: 9px !important;
}

.ps-room .battle-log-add {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 240px !important;
  min-height: 22px !important;
}

/* ── 6. BATTLE CONTROLS — 2-COLUMN BUTTON GRID ──────────────────────────── */
.ps-room .battle-controls, .battle-controls {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  width: 240px !important;
  max-width: 240px !important;
  padding: 2px !important;
  background: #EEF2F5 !important;
}

/* Move buttons: 2 per row (114px each + 2px margins = 236px) */
.moveselect, .movecontrols {
  width: 240px !important;
  max-width: 240px !important;
}

.movebutton {
  width: 114px !important;
  height: 34px !important;
  margin: 1px !important;
  padding: 3px 2px !important;
  font-size: 9px !important;
  line-height: 1.1 !important;
  float: left !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

/* Switch buttons: 2 per row */
.switchselect, .switchcontrols, .switchmenu {
  width: 240px !important;
  max-width: 240px !important;
}

.switchmenu button, .allyparty button {
  width: 114px !important;
  min-height: 28px !important;
  margin: 1px !important;
  padding: 3px 2px !important;
  font-size: 9px !important;
  float: left !important;
  overflow: hidden !important;
}

/* Shift/position controls */
.shiftselect, .shiftcontrols {
  width: 240px !important;
  max-width: 240px !important;
}

.allyTeam button,
.shiftselect button,
.moveselect button,
.switchselect button {
  font-size: 10px !important;
  padding: 5px 4px !important;
  min-height: 24px !important;
}

/* ── 7. PM WINDOWS & CHAT ───────────────────────────────────────────────── */
.pmbox, .pm-window, .chatbox {
  width: 240px !important;
  max-width: 240px !important;
}

.pm-log {
  max-height: 100px !important;
  font-size: 9px !important;
}

.chatbox textarea, .chatbox input {
  width: 196px !important;
  font-size: 10px !important;
  min-height: 22px !important;
}

/* ── 8. TEAMBUILDER ─────────────────────────────────────────────────────── */
.teambuilder, .teamchart, .teamlist {
  width: 240px !important;
  max-width: 240px !important;
}

.teamchart button, .teamlist button {
  width: 230px !important;
  min-height: 30px !important;
  font-size: 10px !important;
  margin: 2px 0 !important;
}

/* ── 9. POPUPS & OVERLAYS ───────────────────────────────────────────────── */
.ps-overlay, .ps-popup, .popup {
  max-width: 232px !important;
  width: 232px !important;
  left: 4px !important;
  font-size: 10px !important;
}

.ps-popup button, .popup button {
  min-height: 26px !important;
  font-size: 10px !important;
  width: 100% !important;
  margin: 2px 0 !important;
}

/* ── 10. D-PAD FOCUS ENGINEERING ────────────────────────────────────────── */
/*
 * CloudMosa CloudPhone uses a 5-key D-Pad (↑↓←→ + Enter).
 * Focus must be unambiguous: high-contrast outline + background inversion.
 * Ref: developer.cloudfone.com — "Provide clear focus and selection styles;
 *      Use a consistent accent/outline color; Only focus one element at a time"
 */

/* Universal focus: gold outline + dark inversion */
a:focus,
button:focus,
input:focus,
textarea:focus,
select:focus,
[tabindex]:focus,
.movebutton:focus,
.switchmenu button:focus,
.allyparty button:focus,
.teamchart button:focus,
.teamlist button:focus,
.tabbar button:focus,
.maintabbar button:focus,
.chooser button:focus,
.playbutton button:focus,
.pm-window h3 button:focus {
  outline: 3px solid #FFD700 !important;
  outline-offset: 1px !important;
  background-color: #1a1a2e !important;
  color: #FFFFFF !important;
  box-shadow: 0 0 0 2px #000, inset 0 0 4px rgba(255, 215, 0, 0.3) !important;
  z-index: 9999 !important;
  position: relative !important;
}

/* Enlarge all interactive targets for D-Pad stepping visibility */
button, a, input, textarea, select, [tabindex] {
  min-height: 24px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* Battle action buttons: green focus (distinct from navigation gold) */
.movebutton:focus,
.switchmenu button:focus,
.allyparty button:focus {
  outline: 3px solid #00FF88 !important;
  background-color: #003322 !important;
  color: #FFFFFF !important;
  transform: scale(1.03) !important;
}

/* Tab bar: cyan focus */
.tabbar button:focus, .maintabbar button:focus {
  outline: 3px solid #00BFFF !important;
  background-color: #001a33 !important;
  color: #FFFFFF !important;
}

/* Text inputs: orange focus */
input:focus, textarea:focus {
  outline: 3px solid #FF6600 !important;
  background-color: #1a1a00 !important;
  color: #FFFFFF !important;
}

/* ── 11. SCROLLBAR MINIMIZATION (4px for QVGA) ──────────────────────────── */
::-webkit-scrollbar {
  width: 4px !important;
  height: 4px !important;
}
::-webkit-scrollbar-track {
  background: #222 !important;
}
::-webkit-scrollbar-thumb {
  background: #666 !important;
  border-radius: 2px !important;
}

/* ── 12. SPACE-SAVING OVERRIDES ─────────────────────────────────────────── */
/* Hide non-essential elements */
.bgcredit, .rightmenu {
  display: none !important;
}

/* Prevent horizontal overflow globally */
.ps-room, .ps-room * {
  max-width: 240px !important;
}

/* Exception: battle internals retain native 640px (parent is scaled) */
.battle, .battle *, .innerbattle, .innerbattle * {
  max-width: none !important;
}

/* Format selectors / dropdowns */
.select, select {
  width: 230px !important;
  font-size: 10px !important;
  min-height: 26px !important;
}

/* Ladder / room list */
.ladder, .roomlist {
  width: 240px !important;
  font-size: 9px !important;
}
.ladder td, .roomlist td {
  padding: 3px 2px !important;
  font-size: 9px !important;
}

/* Links: ensure focusable inline-block with adequate height */
a {
  display: inline-block !important;
  min-height: 20px !important;
  line-height: 20px !important;
}

/* News embed */
.news-embed {
  width: 236px !important;
  max-height: 120px !important;
  overflow-y: auto !important;
}

/* ── 13. TINY-LAYOUT COMPATIBILITY (PS already has .tiny-layout) ────────── */
.tiny-layout.ps-room .battle-controls {
  left: 0 !important;
  right: 0 !important;
  width: 240px !important;
}
.tiny-layout .movecontrols,
.tiny-layout .shiftcontrols,
.tiny-layout .switchcontrols {
  max-width: 240px !important;
  margin: 0 auto !important;
}
`;

// ─── HTMLRewriter: <head> Style Injector ──────────────────────────────────────
class HeadInjector {
  element(element) {
    element.prepend(
      `<style id="qvga-feature-phone-override">${INJECTED_CSS}</style>`,
      { html: true }
    );
  }
}

// ─── HTMLRewriter: Viewport Meta Lock ─────────────────────────────────────────
class ViewportInjector {
  element(element) {
    element.setAttribute(
      'content',
      'width=240, height=320, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
    );
  }
}

// ─── Main Export: Fetch Handler ───────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Rewrite destination to play.pokemonshowdown.com
    url.hostname = TARGET_HOST;
    url.protocol = 'https:';

    // ── WebSocket Upgrade Detection ─────────────────────────────────────────
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
      return handleWebSocket(request, url);
    }

    // ── Standard HTTP/HTTPS Proxy ───────────────────────────────────────────
    const outHeaders = new Headers(request.headers);
    // Spoof identity headers to match target origin
    outHeaders.set('Host', TARGET_HOST);
    outHeaders.set('Origin', TARGET_ORIGIN);
    outHeaders.set('Referer', `${TARGET_ORIGIN}/`);
    // Strip Cloudflare-specific headers
    outHeaders.delete('CF-Connecting-IP');
    outHeaders.delete('CF-IPCountry');
    outHeaders.delete('CF-Ray');
    outHeaders.delete('CF-Visitor');

    const outRequest = new Request(url.toString(), {
      method: request.method,
      headers: outHeaders,
      body: request.body,
      redirect: 'follow',
    });

    let response = await fetch(outRequest);

    // ── Strip Frame-Blocking & CSP Headers ──────────────────────────────────
    const respHeaders = new Headers(response.headers);
    respHeaders.delete('X-Frame-Options');
    respHeaders.delete('Content-Security-Policy');
    respHeaders.delete('Content-Security-Policy-Report-Only');
    respHeaders.delete('X-Content-Security-Policy');
    respHeaders.delete('X-WebKit-CSP');
    respHeaders.delete('Cross-Origin-Embedder-Policy');
    respHeaders.delete('Cross-Origin-Opener-Policy');

    // ── HTMLRewriter: Inject CSS into text/html responses ───────────────────
    const contentType = respHeaders.get('Content-Type') || '';

    if (contentType.includes('text/html')) {
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });

      return new HTMLRewriter()
        .on('head', new HeadInjector())
        .on('meta[name="viewport"], meta#viewport', new ViewportInjector())
        .transform(modifiedResponse);
    }

    // Non-HTML: pass through with stripped headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  },
};

// ─── WebSocket Proxy Handler ──────────────────────────────────────────────────
/**
 * Proxies WebSocket (SockJS) connections bidirectionally.
 * Pokémon Showdown uses SockJS over WebSocket for real-time battle state.
 * Cloudflare Workers: fetch with Upgrade header (use https://, not wss://).
 */
async function handleWebSocket(originalRequest, targetUrl) {
  const wsUrl = targetUrl.toString();

  const wsHeaders = new Headers(originalRequest.headers);
  wsHeaders.set('Host', TARGET_HOST);
  wsHeaders.set('Origin', TARGET_ORIGIN);
  wsHeaders.set('Upgrade', 'websocket');
  wsHeaders.delete('CF-Connecting-IP');
  wsHeaders.delete('CF-IPCountry');
  wsHeaders.delete('CF-Ray');
  wsHeaders.delete('CF-Visitor');

  // Establish upstream WebSocket connection
  const upstreamResponse = await fetch(wsUrl, { headers: wsHeaders });

  if (upstreamResponse.status !== 101) {
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  }

  const upstreamSocket = upstreamResponse.webSocket;
  if (!upstreamSocket) {
    return new Response('WebSocket upgrade failed: no socket', { status: 502 });
  }

  upstreamSocket.accept();

  // Create downstream pair for the browser client
  const pair = new WebSocketPair();
  const [clientSocket, serverSocket] = Object.values(pair);
  serverSocket.accept();

  // ── Bidirectional Message Relay ───────────────────────────────────────────
  serverSocket.addEventListener('message', (event) => {
    try { upstreamSocket.send(event.data); } catch (e) { /* closed */ }
  });

  upstreamSocket.addEventListener('message', (event) => {
    try { serverSocket.send(event.data); } catch (e) { /* closed */ }
  });

  // ── Close/Error Propagation ───────────────────────────────────────────────
  serverSocket.addEventListener('close', (event) => {
    try { upstreamSocket.close(event.code, event.reason); } catch (e) {}
  });
  upstreamSocket.addEventListener('close', (event) => {
    try { serverSocket.close(event.code, event.reason); } catch (e) {}
  });
  serverSocket.addEventListener('error', () => {
    try { upstreamSocket.close(1011, 'Client error'); } catch (e) {}
  });
  upstreamSocket.addEventListener('error', () => {
    try { serverSocket.close(1011, 'Upstream error'); } catch (e) {}
  });

  return new Response(null, { status: 101, webSocket: clientSocket });
}
