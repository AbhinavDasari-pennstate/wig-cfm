# WIG-CFM — React frontend

A structured React (Vite) port of the single-file `web/index.html` dashboard. Same
look (CSS ported verbatim), same data (`/api/demo`), broken into components.

## Run it

1. Start the backend (serves `/api/demo`) on port 8011:
   ```
   uvicorn orchestrator.main:app --port 8011
   ```
2. Start the dev server (proxies `/api` → 8011):
   ```
   cd web-react
   npm install      # first time only
   npm run dev      # http://localhost:5173
   ```
3. Production build → `web-react/dist`:
   ```
   npm run build
   ```

The original `web/index.html` is untouched and still what the live site serves.
Nothing here is wired into FastAPI or committed.

## Structure

```
src/
  main.jsx            entry
  App.jsx             root: state + context (nav, selection, copilot, run view, toasts)
  index.css           all styles, ported verbatim from index.html
  lib/
    constants.js      scripted data (SKUs, brands, nav, fren scripts)
    format.js         pure helpers (trendArrow, csatClass, langLabel, …)
    data.js           report selectors (getAlerts, pendingQueue, search, fren answers)
    copilot.js        copilot logic (timeline, precedent, gap checks, fren matching)
  components/
    TopBar.jsx        brand, search, bell, user, clock
    Sidebar.jsx       nav + badges + seal
    Rail.jsx          right rail: briefing / brand / alert / loop detail
    FrenDock.jsx      global "Ask fren" co-solver
    FrenBits.jsx      shared fren message list + input
    Panels.jsx        SVG trend sparkline + channel mix
    Toasts.jsx        toast notifications
  views/
    Overview.jsx Quality.jsx Queue.jsx Runs.jsx Guardrails.jsx Loop.jsx
    Copilot.jsx       queue approval (procurement / warranty / intervention) + modals
    RunView.jsx       immersive agent run (trace + artifacts + intervene panel)
```
