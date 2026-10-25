# Depth maps: pictures of values

A depth map is a picture whose pixels are measures: a distance per pixel. Teleplot takes two forms of it, reads its numbers itself
(a browser only gives 8 bits of a picture, whatever the file holds), shows them in colors, gives the exact value under the pointer,
and places each pixel in 3D and 2D views when the picture has a camera. The same works for any picture of measures (a thermal
camera...): only the placing in a scene is for distances.

What was received is stored as it is (base64 of the bytes, like any picture) and never changed: decoding gives a copy, kept for the
pictures on display. Nothing is interpolated nor smoothed: one pixel, one color; a pixel without measure stays empty.

## Sending one

Two forms, both in an image telemetry (`TELEM_DATA_IMAGE`, section 24), with their time, label, parts... as any picture:

- **A 16-bit grayscale PNG** (`PNG|`, `IMAGE_TYPE_PNG`): what OpenCV writes for a `CV_16U` depth image (`cv::imwrite`). Lossless and
  compressed. Other PNGs (8 bits, colors) are pictures to show as they are.
- **Plain numbers** (`RAW|`, `IMAGE_TYPE_RAW` = 2): `{WIDTH[16]} {HEIGHT[16]} {FORMAT[8]} {3 bytes at 0}` then the numbers, row
  after row, no padding, little-endian (the 8 bytes of the header keep the numbers aligned).
  - `FORMAT` `0` **gray16**: uint16 per pixel (a depth map in millimetres: RealSense, Kinect, ROS `16UC1`).
  - `FORMAT` `1` **float32**: float32 per pixel (a depth map in metres: ROS `32FC1`). NaN and the infinities are never measures.
  - The size must match: 8 + width x height x 2 (or x 4) bytes. Otherwise the view says it cannot read it.

```
RAW|depth,scene:CAAGAAAAAAAAAKAPoA+gD6APoA+gD6AP…        (base64 of the header and the numbers)
PNG|depth:1712345678901:iVBORw0KGgo…                       (a 16-bit gray PNG)
RAW|depth:1712345678901:3/12:…                             (in parts, like any picture)
```

## How its numbers are read: `TELEM_ATTR_PIXELS` (16)

One attribute per telemetry, `{scale, invalid, depth}`:

| | text | binary | default |
| --- | --- | --- | --- |
| scale: a pixel is worth its number x scale, in the unit of the telemetry | `scale=0.001` | `{SCALE[float64]}` | 1 (0 is refused) |
| the number of a pixel without measure | `nodata=0`, `nodata=` (empty: none) | `{INVALID[float64]}`, NaN: none | 0 |
| distances along the axis of the camera (placed in scenes) | `depth=1`, `depth=0` | `{FLAGS[8]}` bit 0: **not** a depth map | a depth map |

```
ATTR|depth|scale=0.001|unit=m                  numbers in millimetres, shown in metres; 0 is no measure
ATTR|depth|nodata=                             every number is a measure (0 included)
ATTR|thermal|scale=0.01|unit=°C|depth=0        hundredths of a degree: colored, never placed in 3D
```

The unit is the one of the telemetry (`unit=`, `§m`): it is written after the values. In a scene, positions are number x scale:
give the scale that turns the numbers into the units of the scene (metres, usually).

## In an image view

- Colors on a colormap (option `colormap`: `turbo` by default, `viridis`, `gray`), low values first. Between (option `valueRange`):
  `range` (default) the range of the telemetry when it has both ends (`ATTR|depth|min=0|max=6`: colors stay put from one picture to
  the next), otherwise what the picture holds: from its 1st to its 99th percentile, pixels without measure left out (an outlier
  does not wash out the others); `picture`: always what each picture holds.
- The color scale (option `displayColorScale`) under the picture: the two ends and the unit.
- The pointer reads the pixel under it: its value (number x scale, unit) and where it is (u, v), or "no measure".
- What other telemetries draw over a picture works the same over a depth map (its camera, pixel frames).

## In 3D and 2D views

A depth map whose telemetry has camera intrinsics (`K`, section 33; optional distortion `DC`, pose `P`/`R`/`Q`: see [`3d.md`](3d.md)
"Cameras") and is a depth map (`depth`, the default) is drawn as points, where its camera was:

- Each pixel goes along its ray (lens distortion followed back, as `ViewImage.undistortPoint`) to its distance **along the axis
  of the camera** (z-depth, what depth cameras give; not along the ray). In the frame of the camera (x forward, y left, z up):
  `x = d`, `y = -d (u - cx) / fx`, `z = -d (v - cy) / fy`. Intrinsics given for another size of the same proportions are scaled.
- Colored by their value on the colormap of the view (as in the image view), or by height (`pointColorByHeight`).
- At most `depthPoints` pixels (250 000 by default) are placed: one every n along both axes. It is a choice of what to draw: no
  point is made up.
- The 2D view draws the same points seen from above.
- In the auto dashboard a depth map gets an image view; it is in the 3D view of its label (the camera of a scene) as any camera.

## Performance

Measured in Chromium on the Mac of the project, 640 x 480 ([`doc/performance.md`](performance.md) "Depth maps"):

- Decoding: plain numbers are viewed without copy (0.1 ms; base64 with the native `Uint8Array.fromBase64` where it exists). A PNG
  is inflated by the browser (`DecompressionStream`) and unfiltered in a Web Worker made from the library itself (no file to load):
  about 0.5 ms of the page per picture; where workers cannot be made it is done in the page (10 to 20 ms). One decoding at a time
  per telemetry: when pictures come faster, the one in progress finishes and only the latest asked waits. Pictures are decoded when
  a view shows them, never when they arrive; the last 4 decoded ones of each telemetry are kept.
- Colors: 0.5 ms (a table of 65 536 colors for gray16, built again only when the range or the colormap changes), the percentiles
  0.7 ms once per picture. Drawn only when the picture or its colors change.
- Placing: 3.6 ms for every pixel of 640 x 480 (the rays of the pixels are computed once per camera: 7 ms, 46 ms with distortion),
  in buffers that are used again (only the part that holds points is sent to the GPU).

## Implementation

[`packages/teleplot-js/src/108-pictures.js`](../packages/teleplot-js/src/108-pictures.js) (`TELEPLOT.pictures`: `info`, `settings`, `decode` / `decodeAsync`, `valueAt`, `spread`,
`colorRange`, `colorize`, `COLORMAPS`, `fromBase64` / `toBase64`), the image view (`114-viewImage.js`: `__drawValues`, readout),
the scene (`113-viewScene3D.js`: `depthRays`, `depthPoints`, `__depthSource`, `__updateDepth`; `115-viewScene2D.js`). Tests:
[`packages/teleplot-js/tests/pictures.test.js`](../packages/teleplot-js/tests/pictures.test.js). C++: `TeleplotImage::Raw{}`, formats `Gray16` / `Float32`, `.depthMap(scale)` /
`.pixelValues(scale)` ([`doc/cpp-client-api.md`](cpp-client-api.md) "Pictures").

Not done yet: a depth map as the texture of a shape (it shows the 8 bits a browser makes of it).

---

[All documentation](README.md) · [Teleplot](../README.md)
