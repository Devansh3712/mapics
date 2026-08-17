# Manual Photo Coordinates Design

## Goal

Allow a photo's map location to be supplied in `captions.json` so supported
images without GPS EXIF metadata can be included in the generated photo map.

## Existing System

`scripts/build.js` scans supported files in `assets/`, reads GPS coordinates and
capture dates from EXIF, converts each image to full-size and thumbnail JPEGs,
merges caption and song data from `captions.json`, and writes `site/data.json`.
The frontend consumes only the generated `lat` and `lng` fields, so it does not
need to know where coordinates originated.

The supported input formats remain HEIC, HEIF, JPG, JPEG, PNG, and WebP.

## Configuration Schema

Existing caption entries remain valid:

```json
{
  "photo.jpg": "A memory",
  "another-photo.heic": {
    "caption": "Another memory",
    "song": "https://example.com/song"
  }
}
```

A manually located photo uses numeric `latitude` and `longitude` fields on the
existing object form:

```json
{
  "photo.jpg": {
    "caption": "A memory",
    "song": "https://example.com/song",
    "latitude": 25.4,
    "longitude": 91.8
  }
}
```

Coordinates must be JSON numbers. Latitude must be between -90 and 90,
inclusive, and longitude must be between -180 and 180, inclusive.

## Location Resolution

The build loads and normalizes the matching caption entry before resolving the
photo's location.

1. If neither manual coordinate field is present, preserve the current behavior:
   read EXIF and use its GPS coordinates and capture date.
2. If either manual coordinate field is present, treat the entry as a
   manual-location entry.
3. A manual-location entry is valid only when both fields are finite numbers in
   their allowed ranges.
4. Valid manual coordinates become the generated `lat` and `lng`. EXIF is not
   read for that photo, and its generated `date` is `null`.
5. Invalid manual coordinates cause only that photo to be skipped. The build
   continues processing the remaining images.

Manual coordinate entries therefore take precedence by opting the photo out of
EXIF location resolution. Photos are expected to use either manual coordinates
or EXIF coordinates, not both.

## Error Handling

Warnings for invalid manual entries identify the filename and the validation
problem, such as a missing coordinate, wrong value type, or out-of-range value.
The skipped-photo counter is incremented.

Photos with no manual coordinates continue through EXIF resolution. If EXIF GPS
is also unavailable, the existing skip warning is revised to explain that the
photo has neither manual coordinates nor EXIF GPS.

Malformed caption or song values retain their existing normalization behavior.
Malformed JSON retains the existing build behavior.

## Output and Frontend

The shape of `site/data.json` remains unchanged:

```json
{
  "lat": 25.4,
  "lng": 91.8
}
```

No frontend changes are required because `site/js/app.js` already renders every
photo using those generated fields.

## Validation

No automated test framework or test files will be introduced. The implementation
will be validated with targeted build scenarios covering:

- an existing EXIF photo that continues to map normally;
- a supported image without usable EXIF GPS that maps with valid manual
  coordinates;
- zero-valued coordinates, which must remain valid;
- partial coordinate pairs;
- non-number coordinate values;
- latitude and longitude values outside their allowed ranges; and
- isolation of failures so one invalid entry does not stop other photos.

## Documentation

Update `README.md` to:

- explain that location can come from EXIF or `captions.json`;
- show the flat `latitude` and `longitude` fields;
- document numeric types, valid ranges, precedence, and skip behavior;
- clarify that all currently supported formats can use manual coordinates; and
- preserve the warning that published coordinates reveal private location data.
