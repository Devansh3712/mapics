# Manual Photo Coordinates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `development/reference/executing-plans-guide.md` to implement this plan task-by-task.

**Goal:** Allow supported photos without GPS EXIF metadata to use validated `latitude` and `longitude` values from `captions.json`.

**Architecture:** Extend the build-time caption configuration with a pure manual-coordinate parser. The main image loop will use valid manual coordinates without reading EXIF, reject malformed manual coordinate entries per photo, and otherwise preserve the current EXIF flow. The generated `site/data.json` contract and frontend remain unchanged.

**Tech Stack:** Node.js ES modules, `exifr`, `sharp`, `heic-convert`, JSON, Markdown

---

The repository owner explicitly requested no automated test files. Use the
targeted build validation in Task 3 instead.

### Task 1: Parse and apply manual coordinates

**Files:**
- Modify: `scripts/build.js:69-80`
- Modify: `scripts/build.js:167-251`

**Step 1: Add a manual-coordinate parser**

Add a pure helper after `normalizeCaptionEntry`:

```js
function parseManualCoordinates(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { status: "absent" };
  }

  const hasLatitude = Object.hasOwn(entry, "latitude");
  const hasLongitude = Object.hasOwn(entry, "longitude");

  if (!hasLatitude && !hasLongitude) {
    return { status: "absent" };
  }
  if (!hasLatitude || !hasLongitude) {
    return {
      status: "invalid",
      reason: '"latitude" and "longitude" must be provided together',
    };
  }

  const { latitude, longitude } = entry;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    return {
      status: "invalid",
      reason: '"latitude" and "longitude" must be finite JSON numbers',
    };
  }
  if (latitude < -90 || latitude > 90) {
    return {
      status: "invalid",
      reason: '"latitude" must be between -90 and 90',
    };
  }
  if (longitude < -180 || longitude > 180) {
    return {
      status: "invalid",
      reason: '"longitude" must be between -180 and 180',
    };
  }

  return {
    status: "valid",
    coordinates: { lat: latitude, lng: longitude },
  };
}
```

Use explicit property-presence checks so `0` is accepted and a partial pair is
distinguishable from no manual location.

**Step 2: Resolve the caption entry before EXIF**

Near the start of each photo's `try` block, retrieve and normalize the matching
entry:

```js
const entry = captions.get?.(file.toLowerCase());
const { caption, song } = normalizeCaptionEntry(entry);
const manualLocation = parseManualCoordinates(entry);
```

Keep this before location resolution so the build knows whether EXIF is needed.

**Step 3: Reject invalid manual entries without stopping the build**

Before reading EXIF, add:

```js
if (manualLocation.status === "invalid") {
  console.warn(`⚠  Skipping "${file}" — invalid manual coordinates: ${manualLocation.reason}.`);
  skipped++;
  continue;
}
```

This implements the approved per-photo error behavior.

**Step 4: Choose manual coordinates or the existing EXIF path**

Replace the unconditional EXIF read with:

```js
let meta = null;
let coords;

if (manualLocation.status === "valid") {
  coords = manualLocation.coordinates;
} else {
  meta = await readExif(inputBuffer);
  coords = extractLatLng(meta);
}

if (!coords) {
  console.warn(
    `⚠  Skipping "${file}" — no manual coordinates in captions.json or GPS coordinates in EXIF.`
  );
  skipped++;
  continue;
}
```

Do not read EXIF for a valid manual-location entry. The existing date expression
will consequently emit `null` for that photo.

**Step 5: Remove the later duplicate caption lookup**

Delete the existing lines near the result creation that retrieve `entry` and
normalize `{ caption, song }`; those values now come from Step 2.

**Step 6: Make location-source logging clear**

Change the success log to identify the source:

```js
const locationSource = manualLocation.status === "valid" ? "captions.json" : "EXIF";
console.log(
  `✔  ${file} → (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}) [${locationSource}]`
);
```

Also revise the file header and zero-results guidance so they describe manual
coordinates or EXIF rather than requiring geotagged HEIC photos.

**Step 7: Run the existing build as a regression check**

Run:

```bash
npm run build
```

Expected: all current photos build successfully using EXIF, `site/data.json`
still contains six entries, and each success line ends with `[EXIF]`.

**Step 8: Check generated output compatibility**

Run:

```bash
node -e 'const fs=require("fs");const rows=JSON.parse(fs.readFileSync("site/data.json","utf8"));if(rows.length!==6||rows.some(p=>typeof p.lat!=="number"||typeof p.lng!=="number"))process.exit(1)'
git --no-pager diff --check
```

Expected: both commands exit successfully.

**Step 9: Commit the build change**

```bash
git add scripts/build.js site/data.json site/photos
git commit -m "feat: support manual photo coordinates"
```

Only stage generated files if the build actually changed them.

### Task 2: Document manual location configuration

**Files:**
- Modify: `README.md:1-116`

**Step 1: Update the project description and feature list**

Describe photos as located by EXIF GPS or manual coordinates. Replace HEIC-only
phrasing with the existing supported formats while retaining the HEIC-specific
decode note.

**Step 2: Expand the `captions.json` example**

Include all supported entry forms:

```json
{
  "IMG_0001.HEIC": "Sunrise over the harbour.",
  "IMG_0002.HEIC": {
    "caption": "That little cafe we kept coming back to.",
    "song": "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
  },
  "scanned-photo.jpg": {
    "caption": "A photo without GPS metadata.",
    "latitude": 25.4,
    "longitude": 91.8
  }
}
```

State that both coordinate fields are required together, must be JSON numbers,
latitude is `-90..90`, longitude is `-180..180`, and a manual pair is used
instead of EXIF.

**Step 3: Update build and skip behavior**

Explain that supported images are skipped only when they have invalid manual
coordinates or have neither manual coordinates nor EXIF GPS. Mention that
invalid manual entries skip the affected photo rather than failing the build.

**Step 4: Keep the privacy guidance source-neutral**

Clarify that both EXIF-derived and manually entered coordinates become public
when generated site output is published.

**Step 5: Review the documentation diff**

Run:

```bash
git --no-pager diff -- README.md
git --no-pager diff --check
```

Expected: the usage flow accurately covers legacy captions, songs, manual
coordinates, supported formats, validation, and privacy with no whitespace
errors.

**Step 6: Commit the documentation**

```bash
git add README.md
git commit -m "docs: explain manual photo coordinates"
```

### Task 3: Validate valid and invalid coordinate scenarios

**Files:**
- Temporarily modify: `captions.json`
- Temporarily create: `assets/manual-zero.jpg`
- Temporarily create: `assets/manual-partial.jpg`
- Temporarily create: `assets/manual-string.jpg`
- Temporarily create: `assets/manual-lat-range.jpg`
- Temporarily create: `assets/manual-lng-range.jpg`
- Regenerate: `site/data.json`
- Regenerate: `site/photos/`

**Step 1: Back up the current caption configuration**

Run:

```bash
cp captions.json "$TMPDIR/mapics-captions.json"
```

Expected: the backup command exits successfully.

**Step 2: Create temporary supported-format fixtures**

Use one existing generated JPEG as the source:

```bash
cp site/photos/img_2773.jpg assets/manual-zero.jpg
cp site/photos/img_2773.jpg assets/manual-partial.jpg
cp site/photos/img_2773.jpg assets/manual-string.jpg
cp site/photos/img_2773.jpg assets/manual-lat-range.jpg
cp site/photos/img_2773.jpg assets/manual-lng-range.jpg
```

These copies intentionally have no required GPS dependency because their
location behavior is controlled by `captions.json`.

**Step 3: Add all validation cases to `captions.json`**

Run:

```bash
node -e '
const fs = require("fs");
const file = "captions.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
Object.assign(data, {
  "manual-zero.jpg": { caption: "zero", latitude: 0, longitude: 0 },
  "manual-partial.jpg": { caption: "partial", latitude: 25.4 },
  "manual-string.jpg": { caption: "string", latitude: "25.4", longitude: 91.8 },
  "manual-lat-range.jpg": { caption: "bad latitude", latitude: 91, longitude: 91.8 },
  "manual-lng-range.jpg": { caption: "bad longitude", latitude: 25.4, longitude: 181 }
});
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
'
```

Expected: the command exits successfully.

**Step 4: Run the build and capture diagnostics**

Run:

```bash
npm run build > "$TMPDIR/mapics-build.log" 2>&1
cat "$TMPDIR/mapics-build.log"
```

Expected: `manual-zero.jpg` succeeds with `(0.00000, 0.00000)
[captions.json]`; each of the other four fixtures is skipped with a
filename-specific validation warning; the existing six EXIF photos still
succeed.

**Step 5: Assert generated data and failure isolation**

Run:

```bash
node -e '
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync("site/data.json", "utf8"));
const zero = rows.find(p => p.file === "manual-zero.jpg");
const invalidNames = new Set([
  "manual-partial.jpg",
  "manual-string.jpg",
  "manual-lat-range.jpg",
  "manual-lng-range.jpg"
]);
if (!zero || zero.lat !== 0 || zero.lng !== 0 || zero.date !== null) process.exit(1);
if (rows.some(p => invalidNames.has(p.file))) process.exit(1);
if (!rows.some(p => p.file === "IMG_2773.HEIC")) process.exit(1);
'
```

Expected: the command exits successfully, proving valid manual coordinates,
range/type validation, and per-photo failure isolation.

**Step 6: Restore repository inputs and rebuild canonical output**

Run:

```bash
cp "$TMPDIR/mapics-captions.json" captions.json
rm assets/manual-zero.jpg
rm assets/manual-partial.jpg
rm assets/manual-string.jpg
rm assets/manual-lat-range.jpg
rm assets/manual-lng-range.jpg
npm run build
```

Expected: the original six photos are generated and no temporary fixture remains.

**Step 7: Perform the final repository check**

Run:

```bash
git --no-pager diff --check
git --no-pager status --short
```

Expected: no temporary asset or caption changes remain. Only intentional
implementation/documentation changes, if not already committed, are listed.
