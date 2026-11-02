# Lift

A minimal workout tracker for iPhone. It installs from Safari as a Home Screen app, works offline, and keeps everything on the phone.

## Install on iPhone

1. Open the app's address in Safari.
2. Open the Share menu and choose **Add to Home Screen**, then **Add**.
3. Open Lift from the Home Screen. After the first launch it works without a connection.

## Your data

Workouts, body weight, program changes and settings are stored on the phone. The app makes no network requests.

- Back up from Settings (the gear on Train or Program): **Export backup** saves a JSON file you can keep in Files or iCloud Drive.
- **Restore from backup** loads that file, for example on a new phone.
- Deleting Lift from the Home Screen deletes its data, so export first.

## Releasing a change

1. Edit the files. A new file also goes in `ASSETS` in `sw.js`.
2. Bump `VERSION` in `sw.js` (`lift-1.0.0` → `lift-1.0.1`) and the matching `VERSION` in `js/views/settings.js`. Phones only fetch a new build when `sw.js` changes.
3. Commit and push. GitHub Pages updates within a minute or two, and the app offers **Reload** the next time it is opened.

## Run locally

```bash
python3 -m http.server 5180
```

Then open http://localhost:5180. The service worker is skipped on localhost so edits show up on reload; add `?sw` to the address to test offline mode.

## Files

- `index.html`, `manifest.webmanifest`, `sw.js`: app shell, install metadata, offline cache
- `js/store.js`: storage, backup export and restore
- `js/seed.js`: the starting program and exercise library
- `js/logic.js`: day rotation, overload coach, records, weekly stats
- `js/nav.js`, `js/sheets.js`, `js/ui.js`, `js/charts.js`: navigation, bottom sheets, shared components, SVG charts
- `js/views/`: one file per screen
- `css/app.css`: design tokens and components; `css/screens.css`: screen layouts
