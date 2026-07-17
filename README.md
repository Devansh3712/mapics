# mapics — a map of memories

An interactive webpage that places your photos on a map based on where they were
taken (their GPS coordinates), and opens each one as a **polaroid** with a
hand-written caption when clicked.

- 🗺️ **Leaflet + OpenStreetMap** — free, no API key. Locked to India.
- 📍 **Smart pins** — teardrop pins when zoomed out; photo thumbnails as you zoom in.
- 🖼️ **Polaroid view** — click a pin to see the full photo + your message.
- 🎵 **Optional songs** — attach a Spotify / YouTube link that plays on the polaroid.
- 📱 **iOS HEIC support** — GPS is read straight from the EXIF of iPhone photos
  (including newer iPhone 16 Pro HEICs).
- 🚀 **GitHub Pages ready** — the site is a static folder.

---

## How it works

Browsers can't decode HEIC or read its GPS data, and GitHub Pages only serves
static files. So there are two pieces:

1. **A local build step** (`npm run build`) reads every HEIC in `assets/`,
   extracts GPS + date, converts it to web JPEGs (full + thumbnail), merges your
   captions, and writes `site/data.json` + `site/photos/`.
2. **The static site** in `site/` loads that data and renders the map.

You run the build locally and **commit the generated output** so GitHub Pages can
serve it.

---

## Setup

```bash
npm install
```

## Usage

1. **Add photos.** Drop your geotagged iPhone `.HEIC` photos into `assets/`.
   (Regular `.jpg/.png/.webp` with GPS EXIF work too.)

2. **Write captions (and optional songs).** Edit `captions.json`, keyed by the
   exact filename. Each entry is either a plain message string, or an object with
   a `caption` and an optional `song` link:

   ```json
   {
     "IMG_0001.HEIC": "Sunrise over the harbour — worth the 5am alarm.",
     "IMG_0002.HEIC": {
       "caption": "That little café we kept coming back to.",
       "song": "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
     }
   }
   ```

   The `song` link is shown on the polaroid. **Spotify** (track/album/playlist/
   episode) and **YouTube / YouTube Music** links render as an inline player;
   any other link shows a “🎵 Listen” button.

   Photos without an entry simply get a blank message.

3. **Build.**

   ```bash
   npm run build
   ```

   This generates `site/data.json` and `site/photos/`. Photos without GPS data
   are skipped with a warning.

4. **Preview locally.**

   ```bash
   npm run serve
   # open http://localhost:5173
   ```

5. **Publish.** Commit everything (including `site/data.json` and `site/photos/`)
   and push to `main`. The included GitHub Actions workflow deploys `site/` to
   GitHub Pages.

   In your repo: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

---

## Project layout

```
mapics/
├── assets/              # your original HEIC photos (git-ignored by default)
├── captions.json        # filename → message, edited by you
├── scripts/build.js     # HEIC → JPEG + data.json generator
├── scripts/serve.js     # local preview server
└── site/                # <-- published to GitHub Pages
    ├── index.html
    ├── css/style.css
    ├── js/app.js
    ├── data.json        # generated
    └── photos/          # generated JPEGs + thumbnails
```

## Tuning

- **When thumbnails appear:** change `THUMBNAIL_ZOOM` in `site/js/app.js`.
- **Map region:** the map is locked to India via `INDIA_BOUNDS` in `site/js/app.js`.
  Change those coordinates (or remove `maxBounds`) to cover a different area.
- **Image sizes / quality:** change `FULL_MAX`, `THUMB_MAX`, `JPEG_QUALITY` in
  `scripts/build.js`.

## Notes

- **Privacy:** photo GPS reveals real locations. Anything you publish becomes
  public. Don't push photos/coordinates you want to keep private.
- Original HEICs are git-ignored by default (only the generated JPEGs are
  committed). Remove the `assets/*.HEIC` lines from `.gitignore` if you want to
  commit originals too.
- Tiles come from OpenStreetMap; please respect their
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
