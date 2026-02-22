# LifeSync PWA

LifeSync is an installable Progressive Web App for planning daily tasks and weekly schedules with clean light/dark themes, offline support, and local-first data storage.

Live site: https://life-sync-pwa.pages.dev/

## Features

- Simple Tasks mode for quick task capture and completion tracking
- Weekly Schedule mode with per-day planning
- Daily View editor (time range + category + edit/delete actions)
- Category system: `Task`, `Regime`, `Fitness`, `Coron`, `Others` (Creating your own category will be added in later patches)
- Progress tracking:
  - Global progress in Simple Tasks
  - Per-day progress in Daily View
- Task filtering by category
- Import/Export backups as JSON
- Import strategies: merge with existing tasks or replace all tasks
- Reset progress for unfinished planning cycles
- Delete controls for completed tasks or all tasks (scoped by mode)
- Theme toggle (Light/Dark)
- PWA install support (desktop + mobile)
- Offline-ready behavior via Service Worker
- Local-first persistence using browser `localStorage` (no backend required)

## Screenshots


<table>
  <tr>
    <td><img src="docs/screenshots/simple-tasks-light.png" alt="Simple Tasks - Light" /></td>
    <td><img src="docs/screenshots/simple-tasks-dark.png" alt="Simple Tasks - Dark" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/weekly-schedule-overview.png" alt="Weekly Schedule - Overview" /></td>
    <td><img src="docs/screenshots/weekly-schedule-day-selected.png" alt="Weekly Schedule - Day Selected" /></td>
  </tr>
</table>


## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- date-fns
- Lucide React icons

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

## Production Build

```bash
npm run build
npm run preview
```

`build` generates the `dist/` folder.  
`preview` serves the production build locally.

## PWA Notes

- Manifest: `public/manifest.webmanifest`
- Service Worker: `public/sw.js`
- Icons: `public/icons/`
- Install prompt/behavior is best validated from production preview or deployed HTTPS site.


## Data Storage

- All tasks are saved in browser storage (`localStorage`).
- Data is scoped per browser/device.
- Use Export/Import to move or back up your data.
