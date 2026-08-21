# cloudphone-pokemon-showdown

A dedicated Node.js reverse proxy and injection layer designed to run [Pokémon Showdown](https://play.pokemonshowdown.com) seamlessly on CloudMosa's CloudPhone browser and low-resolution (240×320 QVGA) dumbphone hardware.

---

## Overview

Running the official Pokémon Showdown web client on CloudPhone and feature phones typically presents several blocking issues:

* Domain-locked WebSocket initialization (`Config.server` gets reset on third-party hostnames).
* Third-party tracking and ad scripts timing out or crashing, stalling `window.onload` for up to 5 minutes in Incognito sessions.
* Showdown's desktop keybindings hijacking horizontal D-Pad arrows (`ArrowLeft` / `ArrowRight`) to switch lobby tabs rather than moving UI focus.
* Screen-covering tooltips that obscure move selections on small QVGA displays.

`cloudphone-pokemon-showdown` resolves these limitations by proxying HTTP and WebSocket traffic through Express and `http-proxy`, rewriting upstream configurations in real time, and injecting targeted CSS and keyboard event handlers.

---

## Key Features

* **Zero-Configuration Connection:** Intercepts `/config/config.js` and injects an active runtime poll to lock `Config.server` to `sim3.psim.us` and trigger `app.connect()` automatically on boot.
* **Direct Keypad Battle Controls:** Maps physical numeric keys directly to battle actions (moves, switches, gimmicks, undo).
* **D-Pad Spatial Navigation Isolation:** Captures horizontal arrow keys in the DOM capturing phase (`stopImmediatePropagation`) and neutralizes `app.focusPrevRoom` / `app.focusNextRoom`, enabling native CloudMosa spatial button focus without tab-switching.
* **Ad & Tracker Neutralization:** Intercepts dead ad networks and Google Analytics requests (`ad-manager.js`, `pubads`, `analytics.js`) with instant `200 OK` empty scripts to prevent network blocking stalls.
* **QVGA UI Adjustments:** Suppresses `#tooltipwrapper` popups that block the screen on focus and applies a high-contrast 3px gold focus ring across all interactable elements.
* **Uncompressed Stream Pipeline:** Enforces `Accept-Encoding: identity` upstream and strips decompression artifacts to eliminate `ERR_CONTENT_DECODING_FAILED`.

---

## Battle Keypad Controls

| Key                    | In-Battle Action                               |
| :--------------------- | :--------------------------------------------- |
| **`1` – `4`**          | Select Moves 1 through 4                       |
| **`5` – `9`**          | Switch to Team Slots 1 through 5               |
| **`0`**                | Switch to Team Slot 6                          |
| **`*`**                | Toggle Terastallize / Mega Evolution / Dynamax |
| **`#`**                | Undo Move / Cancel Action                      |
| **D-Pad Directionals** | Navigate on-screen UI buttons                  |
| **Center / OK Key**    | Confirm selected button                        |

---

## Technical Architecture

```text
CloudPhone / Client (240x320)

│

▼

Express Reverse Proxy (Render)

├── Routes & Strips CSP / COOP / Ads / Analytics

├── Injects D-Pad & Keypad Event Listeners

├── Enforces Config.server = sim3.psim.us

│

├──► HTTP/HTTPS Traffic ──► play.pokemonshowdown.com

└──► WebSocket (Upgrade) ──► sim3.psim.us:443
```

---

## Installation & Deployment

### 1. Prerequisites

* Node.js 18+ (uses native `fetch`)
* npm

### 2. Local Setup

```bash
git clone https://github.com/arnavgr/cloudphone-pokemon-showdown.git
cd cloudphone-pokemon-showdown
npm install
npm start
```

### 3. Deploy to Render

1. Create a new **Web Service** on [Render](https://render.com/).

2. Connect your repository.

3. Configure the service:

   * **Runtime:** Node
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`

4. *(Optional)* Add the `PROXY_URL` environment variable if you are using an upstream residential proxy for simulator traffic.

---

## Environment Variables

| **Variable** | **Description**                                                        | **Default** |
| ------------ | ---------------------------------------------------------------------- | ----------- |
| `PORT`       | Port for the Express server to listen on.                              | `3000`      |
| `PROXY_URL`  | Optional upstream HTTP/HTTPS proxy URL (`http://user:pass@host:port`). | `undefined` |

## License

MIT

