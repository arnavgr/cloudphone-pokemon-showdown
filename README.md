# cloudphone-pokemon-showdown

A Cloudflare Worker reverse proxy and client-side injection layer that adapts [Pokémon Showdown](https://play.pokemonshowdown.com) for CloudMosa CloudPhone and other small, keypad-driven browsers, including 240×320 QVGA devices.

The project proxies the official Pokémon Showdown web client, routes simulator traffic to `sim3.psim.us`, and injects a lightweight control layer designed around a D-Pad, Call/OK key, and physical numeric keypad.

---

## What it does

The normal Pokémon Showdown client is designed primarily for desktop browsers. On CloudPhone/feature-phone browsers this can cause several problems:

- The client can try to connect to its normal simulator host instead of the proxy's public host.
- Third-party analytics/ad requests can stall page loading on constrained browsers.
- Showdown's room-navigation handlers can consume horizontal D-Pad input.
- Tooltips and the normal battle chat/log UI can cover most of a 240×320 display.
- The standard battle interface is difficult to operate with a physical numeric keypad.

This Worker addresses those issues without requiring a separate Node.js/Express server.

---

## Features

### Cloudflare Worker proxy

- Proxies the Pokémon Showdown web client from `play.pokemonshowdown.com`.
- Routes `/showdown/...` requests to `sim3.psim.us` for simulator traffic.
- Patches `/config/config.js` so Showdown uses `sim3.psim.us` as its simulator.
- Rewrites upstream redirects back to the public proxy hostname.
- Removes upstream cookie `Domain` attributes so cookies can persist on the proxy host.
- Removes restrictive CSP, frame, and cross-origin policy headers that interfere with the proxied client.
- Preserves successful WebSocket upgrade responses from the upstream simulator.

### Ad/tracker blocking

Known analytics/ad resources are short-circuited with an empty `200 OK` JavaScript response. This avoids waiting for dead or blocked third-party resources on slow/constrained browsers.

### QVGA / CloudPhone UI fixes

- Suppresses Showdown tooltips that can obscure the battle UI.
- Removes the normal on-screen battle chat/log controls.
- Hides the side battle/chat log during normal gameplay so more of the battle UI remains visible.
- Adds a compact high-contrast focus indicator for keyboard/spatial navigation.
- Provides compact effectiveness badges for super-effective, neutral, resisted, and immune attacks.

### Keypad battle interface

The injected client layer adds battle information and controls specifically for physical keypads:

- Move inspection with move type, category, Base Power, accuracy, PP, and effectiveness against the active opponent.
- Opponent inspection showing revealed/alive Pokémon, types, speed range, item/ability information, revealed moves, defensive weaknesses/resistances, current status, and stat boosts/debuffs.
- Own-team inspection showing alive Pokémon, HP/stats, item/ability information, moves, effectiveness, current status, stat boosts/debuffs, and direct switching for bench Pokémon.
- Team Preview showing the known members of either side without inventing unrevealed information.
- Structured turn history grouped by turn, including moves, switches, damage/healing, status changes, boosts, items, abilities, fainting, Tera, and form changes.
- Revealed-information history that persists for the current battle room and accumulates known moves, items, abilities, and state changes.
- Doubles target selection that exposes Showdown's target buttons to keypad D-Pad/Call/OK control when available.
- A built-in controls guide.
- A floating battle chat/log modal bound to the current battle room, with live updates as you switch matches.
- Chat submission through both Enter/OK and Call/Send instead of relying on the Call button alone.
- Tera / Mega Evolution / Dynamax / Z-Move control when the corresponding Showdown control exists.

---

## Battle Keypad Controls

| Key | Action |
| :--- | :--- |
| **`0`** | Open/close the Move Selection inspector. Call/OK selects the displayed move; **◄/►** cycles moves; **▲/▼** scrolls the inspector. |
| **`1`** | Open/close the **Opponent** inspector. Shows alive/revealed opponent Pokémon plus status, stat boosts/debuffs, revealed moves, item/ability data, speed, and defensive matchups; **◄/►** cycles them and **▲/▼** scrolls. |
| **`2`** | Open/close **My Team & Switch**. Shows alive teammates plus HP/stats, status, stat boosts/debuffs, item/ability data and moves; **◄/►** cycles them and **▲/▼** scrolls. Call/OK switches to a living bench Pokémon. |
| **`3`** | Open/close the built-in **Controls Guide**. |
| **`4`** | Open/close **Team Preview**. **◄/►** switches between your team and the opponent's known team. |
| **`5`** | Open/close **Structured Turn History**, grouped by turn. **▲/▼** scrolls the history. |
| **`6`** | Open/close **Revealed Information History** for the current battle. **▲/▼** scrolls it. |
| **`9`** | Open/close the **Battle Chat & Log** overlay for the current battle room. **▲/▼** scrolls. Call/OK/Enter focuses or sends chat. |
| **`*`** | Toggle Tera / Mega Evolution / Dynamax / Z-Move when available. |
| **`#`** | Cancel/undo a selected move or close the active modal. In target selection it cancels the target choice. |
| **Call / OK / Enter** | Confirm a move, confirm a doubles target, switch to the selected teammate, or focus/send a chat message. |
| **D-Pad ◄ / ►** | Cycle entries inside the active inspector; in doubles target selection, cycle targets; in Team Preview, switch between your team and opponent. Outside a modal, horizontal input is isolated from Showdown's room-tab navigation. |
| **D-Pad ▲ / ▼** | Scroll the active inspector/chat modal; otherwise provide normal spatial UI navigation. |

The `1` and `2` inspection menus intentionally filter out fainted Pokémon. The `2` menu can directly switch to a living bench Pokémon; the currently active Pokémon is shown for inspection but cannot be switched into itself.

---

## Battle information model

The information menus are deliberately based on the data already exposed by the Showdown client. The project does not attempt to guess unrevealed competitive information.

- **Team Preview (`4`)** shows known team members and leaves unknown opponent slots unknown.
- **Turn History (`5`)** converts the current battle protocol log into compact, readable events grouped under turns.
- **Revealed History (`6`)** accumulates facts observed during the current battle room, so information stays available after a Pokémon switches out.
- **Status/Boost display** is included in the normal `1` and `2` inspectors so the small native battle screen does not have to carry all of the useful state itself.

When you leave a battle and enter another one, the information context and `9` overlay automatically follow the new battle room instead of showing stale data from the previous match.

---

## How the proxy works

```text
CloudPhone / Feature Phone
        │
        │ HTTPS
        ▼
┌──────────────────────────────┐
│ Cloudflare Worker            │
│                              │
│  • Proxy HTTP requests       │
│  • Patch /config/config.js   │
│  • Rewrite redirects/cookies │
│  • Remove blocking headers   │
│  • Block ad/analytics URLs   │
│  • Inject CSS + JS           │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
play.pokemonshowdown   sim3.psim.us
(web client/assets)    (battle simulator)
```

The Worker uses the public request `Host` as the client-facing route and sends upstream `Origin`/`Referer` headers matching the official Showdown web client. Requests under `/showdown` are routed to the simulator.

---

## Project Structure

```text
cloudphone-pokemon-showdown/
├── worker.js       # Cloudflare Worker proxy + injected client controls
├── wrangler.toml   # Wrangler/Cloudflare Worker configuration
├── README.md       # Project documentation
└── .gitignore
```

There is no Node.js/Express server in the current architecture. The project runs as a Cloudflare Worker using Wrangler.

---

## Deployment

### Prerequisites

- A Cloudflare account with Workers enabled.
- Node.js and npm if using Wrangler locally.
- The [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) for local development/deployment.

### Deploy with Wrangler

Clone the repository and deploy the Worker:

```bash
git clone https://github.com/arnavgr/cloudphone-pokemon-showdown.git
cd cloudphone-pokemon-showdown
npm install
npx wrangler deploy
```

The repository's `wrangler.toml` uses `worker.js` as the Worker entry point, sets the compatibility date to `2026-08-26`, and enables the `nodejs_compat` compatibility flag.

After deployment, open the generated `workers.dev` URL (or your configured custom Worker domain) on the CloudPhone browser.

### Cloudflare dashboard

The important Worker configuration is:

- **Worker entry point:** `worker.js`
- **Compatibility date:** `2026-08-26`
- **Compatibility flag:** `nodejs_compat`

No Render Web Service or Express server is required.

---

## Local development

Run the Worker locally with Wrangler:

```bash
npx wrangler dev
```

Wrangler will provide a local URL for testing.

To deploy the current Worker:

```bash
npx wrangler deploy
```

---

## Important implementation details

### Showdown configuration

Requests to `/config/config.js` are fetched from the official Showdown web client and patched so that `Config.server` / `Config.defaultserver` points to:

```text
sim3.psim.us:443
```

The Worker also sets the proxied client route to the request's public host.

### Simulator routing

Requests whose path starts with `/showdown` are sent to:

```text
https://sim3.psim.us
```

All other proxied paths use:

```text
https://play.pokemonshowdown.com
```

### Client injection

For HTML responses, the Worker injects CSS into `<head>` and the keypad/control JavaScript before `</body>`. The injected code periodically patches Showdown's tooltip and room-navigation handlers so they do not interfere with CloudPhone controls.

### Compression handling

The Worker removes `content-length` and `content-encoding` from modified HTML responses because the body is rewritten before being returned. This prevents stale upstream encoding metadata from causing browser decoding errors.

---

## Limitations

- The keypad features depend on the current Pokémon Showdown client exposing its normal battle controls and client-side battle data.
- Opponent information is limited to information that Showdown has already revealed to the client; unrevealed items, abilities, moves, and team members remain unknown rather than being guessed.
- Doubles target selection depends on the current Showdown client exposing its target controls. The inspector handles the exposed target buttons; if the client does not expose them, the normal Showdown target UI remains the fallback.
- Some gimmicks are only available when the corresponding control is present for the current battle format.
- The project is specifically optimized for CloudPhone/feature-phone constraints rather than for reproducing every desktop Showdown UI feature.

---

## License

MIT
