# mapics — a map of memories

An interactive webpage that places your photos on a map — either from the GPS
coordinates in their EXIF, or from coordinates you enter by hand — and opens each
one as a **polaroid** with a hand-written caption when clicked.

- 🗺️ **Leaflet + OpenStreetMap** — free, no API key. Full world map.
- 📍 **Smart pins** — teardrop pins when zoomed out; photo thumbnails as you zoom in.
- 🖼️ **Polaroid view** — click a pin to see the full photo + your message.
- 🎵 **Optional songs** — attach a Spotify / YouTube link that plays on the polaroid.
- 📸 **HEIC/HEIF, JPG, PNG and WebP** — GPS is read straight from the EXIF
  (including newer iPhone 16 Pro HEICs, which are decoded without any native
  HEVC plugin).
- ✍️ **Manual coordinates** — photos without GPS EXIF can be placed by hand from
  `captions.json`.
- 🚀 **GitHub Pages ready** — the site is a static folder.

---

## How it works

Browsers can't decode HEIC or read its GPS data, and GitHub Pages only serves
static files. So there are two pieces:

1. **A local build step** (`npm run build`) reads every photo in `assets/`,
   works out where it belongs (manual coordinates from `captions.json`, else GPS
   EXIF) along with its date, converts it to web JPEGs (full + thumbnail), merges
   your captions, and writes `site/data.json` + `site/photos/`.
2. **The static site** in `site/` loads that data and renders the map.

You run the build locally and **commit the generated output** so GitHub Pages can
serve it.

---

## Setup

```bash
npm install
```

## Usage

1. **Add photos.** Drop `.heic/.heif/.jpg/.jpeg/.png/.webp` photos into `assets/`.
   Geotagged iPhone `.HEIC` photos work out of the box; photos without GPS EXIF
   (scans, screenshots, edited exports) can be placed with manual coordinates in
   step 2.

2. **Write captions (and optional songs or coordinates).** Edit `captions.json`,
   keyed by the exact filename. Each entry is either a plain message string, or
   an object with a `caption` plus an optional `song` link and/or a manual
   `latitude` / `longitude` pair:

   ```json
   {
     "IMG_0001.HEIC": "Sunrise over the harbour — worth the 5am alarm.",
     "IMG_0002.HEIC": {
       "caption": "That little café we kept coming back to.",
       "song": "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
     },
     "scanned-photo.jpg": {
       "caption": "A photo without GPS metadata.",
       "latitude": 25.4,
       "longitude": 91.8
     }
   }
   ```

   The `song` link is shown on the polaroid. **Spotify** (track/album/playlist/
   episode) and **YouTube / YouTube Music** links render as an inline player;
   any other link shows a “🎵 Listen” button.

   `latitude` and `longitude` must be provided **together**, must be JSON numbers
   (not strings), and must be in range — latitude `-90..90`, longitude
   `-180..180`. When a valid pair is present it is used **instead of** the
   photo's EXIF, so that photo's date is left empty.

   Photos without an entry simply get a blank message.

3. **Build.**

   ```bash
   npm run build
   ```

   This generates `site/data.json` and `site/photos/`. A supported image is
   skipped, with a warning naming the file, only when its manual coordinates are
   invalid or when it has neither manual coordinates nor GPS EXIF. An invalid
   entry skips just that photo — the rest of the build continues.

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
├── assets/              # your original photos (HEICs git-ignored by default)
├── captions.json        # filename → message, song, optional coordinates
├── scripts/build.js     # photo → JPEG + data.json generator
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
- **Map region:** the map covers the whole world via `WORLD_BOUNDS` in
  `site/js/app.js`, and `minZoom` is computed from the window size so a single
  world copy always fills the viewport (no empty bands when zoomed all the way
  out). Narrow those bounds to lock the map to a specific region instead. The
  view always fits your photos once `data.json` loads.
- **Image sizes / quality:** change `FULL_MAX`, `THUMB_MAX`, `JPEG_QUALITY` in
  `scripts/build.js`.

## Notes

- **Privacy:** map coordinates reveal real locations, whether they came from a
  photo's EXIF or were typed into `captions.json` by hand. Anything you publish
  becomes public. Don't push photos or coordinates you want to keep private.
- Original HEICs are git-ignored by default (only the generated JPEGs are
  committed). Remove the `assets/*.HEIC` lines from `.gitignore` if you want to
  commit originals too.
- Tiles come from OpenStreetMap; please respect their
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
