**Byte order**: all multi-byte values (uint16, uint32, uint64, float32, ...), including the **CHECKSUM**, are **little-endian** (least significant byte first). Every platform Teleplot targets is little-endian, so encoders can copy values from memory without swapping bytes.

Bellow is the structure of a **PACKET**:

`{BINARY_MARKER[uint8]} - {PROTOCOL_VERSION[uint8]} - {CLIENT_ID[uint16]} - {DATA[x]} - {CHECKSUM[16]}`

  - **BINARY_MARKER** has a fixed-value of 0x10 and identifies this packet as a binary teleplot packet (DataLinkEscape Ascii control character)
  - **PROTOCOL_VERSION** represent a fixed definition of this protocol and is here for potential future compatibility needs.
  - **CLIENT_ID** in an uint16 thats uniquely identify the client sending this packet. This will be used along with `TELEM_ID` to uniquely identify each telemetry as an uint32 number with `CLIENT_ID` as MSB and `TELEM_ID` as LSB.
  - **DATA** is not fixed in size and organized as a list of typed SECTION.
  - **CHECKSUM**: checksum of the `{PROTOCOL_VERSION[uint8]} - {CLIENT_ID[uint8]} - {DATA[x]}` section to ensure data consistency. (**TODO** define which kind of checksum to use! -> just check no reconstruction)

  The structure of a **SECTION** is described bellow, and several **SECTION** can be chained to form a list.

` {SECTION_TYPE[8]} - {SECTION_DATA[x]}`

  - **SECTION_TYPE** represent the kind of data transmitted in the section
  - **SECTION_DATA** structure depends on the **SECTION_TYPE**

### Sample packet
Sample packet that both seta telemetry name (kinda creating the telemetry), and provide 2 data points of type **TELEM_DATA_NUMBER**.
```
 ----------------------------------------------------------------------------------------------PACKET---------------------------------------------------------------------------------------------------------------
 BINARY_MARKER PROTOCOL_VERSION   CLIENT_ID   -------------------------------------------------------------DATA-----------------------------------------------------------------------------------------------------   CHECKSUM
 -----------------------------------------------------------------------------------------------------HASHED BYTES--------------------------------------------------------------------------------------------------
                                              --------------------SECTION 1 (TELEM_ATTR)-------------------------   --------------------------------------SECTION 2 (TELEM_DATA_NUMBER)-----------------------------
                                              ----------------------------SECTION_DATA------------                                 ----------TELEM_DATA_HEADER------   -TELEM_DATA_NUMBER 1-   -TELEM_DATA_NUMBER 2-
 BINARY_MARKER PROTOCOL_VERSION - CLIENT_ID - SECTION_TYPE - TELEM_ID - COUNT - TELEM_ATTRCODE -  TELEM_ATTR_DATA - SECTION_TYPE - TELEM_ID - TIME_REFERENCE - COUNT -  TIMEDIFF  -  VALUE   -  TIMEDIFF  -  VALUE   - CHECKSUM
        16             1              42           1            300       1            0         't' 'e' 'm' 'p' 0       2            300      105600584045      2       1200        21.0         1300       21.5         12
```

### Section Types
Here is the list of the defined **SECTION_TYPE** and their specifications:

  - `0` **RESERVED**: The section type with ID 0 has no usage or meaning for now, reserved for future use. It should not be inserted into any packets as it SECTION_DATA format is not defined. Section with a 0 ID is considered ill-formed.

  - `1` **CLIENT_NAME**: Defines the name of the client that emits this packet
    - **SECTION_DATA**: `{CLIENT_NAME[null terminate string]}`

  - `2` **DASHBOARD**: Describes views of a dashboard, with the same lines as the text protocol (see `dashboard-text.md`)
    - **SECTION_DATA**: `{LINES[null terminate string]}`
      - **LINES**: one or several lines `DASH|dashboard/view:type:telemetries|option=value`, separated by line feeds (`\n`). Telemetries are named as in their `TELEM_ATTR_NAME` attribute. A line is applied when it differs from the last one received for the same path, so the section can be sent again at will.
      - A telemetry can also place itself: a `TELEM_ATTR_VIEW_LABEL` attribute that is a path (`Robot/Motion`) puts it in that view of that dashboard.

  - `10` **TELEM_ATTR**: Definition of telemetry attributes.
    - **SECTION_DATA**: `{TELEM_ID[16]} - {COUNT[8]} - TELEM_ATTR({TELEM_ATTR_CODE[8]} - {TELEM_ATTR_DATA})...`
      - **TELEM_ID**(uint16): client-defined, per-client-unique, id of the telemetry described.
      - **COUNT**(uint8): the number **TELEM_ATTR**s.
      - **TELEM_ATTRCODE**(uint8): the unique code that defines which attribute is provided (and the structure of **TELEM_ATTR_DATA** )
      - List of **TELEM_ATTR**s, with their code and data description:  `code` **MY_ATTR**(data size)
        - `0` **TELEM_ATTR_NAME**(null terminated string): Name of the telemetry (ex: `myExecTime`, `/robot/speed`, `outdoor.temperature`...)
        - `1` **TELEM_ATTR_UNIT**(null terminated string): Unit of the telemetry (ex: `second`, `Km/h`, `°C`...)
        - `2` **TELEM_ATTR_COLOR**(null terminated string): color of the telemetry, as a CSS color string or hex code (ex: `blue`, `#2ecc71`).
        - `3` **TELEM_ATTR_AUTOPLOT**(uint8, default=1): set to 0 to prevent the automatic-display of this telemetry in the UI
        - `4` **TELEM_ATTR_DATA_TIMEOUT**(uint64, default=0): the validity-duration in nanoseconds associated to a telemetry data. Allows data to disappear from the UI automatically after a given duration. 0 means no timeout.
        - `6` **TELEM_ATTR_VIEW_LABEL**(null terminated string): a label shared by telemetries that should be displayed together (ex: `motors`). When the viewer displays telemetries by itself, the ones with the same label go to the same view (per kind of view: numbers in a chart, shapes in a 3D view...). Same as `name,label` in the text protocol.
        - `7` **TELEM_ATTR_LOG**(uint8, 0 or 1): for a text telemetry, 1 tells that it is emitted as a log (lines to read one after the other) and not as a state (its latest value matters: the default). It only chooses the view the telemetry gets by default (a log view, or a value); both views display any text telemetry. `log` flag of the text protocol.
        - `8` **TELEM_ATTR_FRAME** `{FRAME_TYPE[8] - NAME[null terminated string]}`: what the positions of the telemetry are relative to (see `2d.md`). **NAME** is the name (`TELEM_ATTR_NAME`) of another telemetry.
          - `0` **FRAME_TYPE_POSE**: the pose of that telemetry (a shape, a camera, the sensor of a point cloud, a point): positions, orientations, vectors and points are in its frame and follow it.
          - `1` **FRAME_TYPE_PIXELS**: the pixels of the pictures of that image telemetry (u to the right, v down): the telemetry is drawn on those pictures, without any camera model.
        - `10` **TELEM_ATTR_STACK**(uint8, 0 or 1): for a text telemetry, 1 tells that its text is a stack: the path of what is running, a `/` between levels (`loop/plan/search`). It is a state like any other, displayed by default on a timeline, which draws it as a row per level (see `time-views.md`). The timestamp of each text sample (**TIME_REFERENCE** + **TIMEDIFF**, nanoseconds) is the time of the device: what function timing needs. `stack` flag of the text protocol.
        - `11` **TELEM_ATTR_WRITE** `{KIND[8]} {TYPE[8]} {FLAGS[8]} {STEP[64]} {RATE[16]} {HOLD[16]} {AXES[8]}`: what the page may write (a setting) or call (an action), see `telecmd.md`. **KIND**: `0` none (removes it), `1` setting, `2` action. **TYPE**: `0` the type of the data, `1` number, `2` bool, `3` text, `4` xy, `5` xyz, `6` pose2d (x, y, yaw). **FLAGS**: bit 0 confirm, bit 1 longpress (actions). **STEP** (float64, NaN: none). **RATE** (writes per second) and **HOLD** (ms the device waits before stopping): a continuous setting, driven by a joystick (0: none). **AXES**: bits x (1), y (2), yaw (4) of an xy or pose2d that the device uses, 0 = all. Same as `ATTR|name|write=...|step=..|rate=..|hold=..|axes=..` and `ATTR|name|action|confirm|longpress` in the text protocol.
        - `12` **TELEM_ATTR_CHOICES** (null terminated string): the texts a setting can take, separated by line feeds (`choices=a,b,c` in text). Empty: no choices.
        - `13` **TELEM_ATTR_ARGS** `{INDEX[8]} {TYPE[8]} {FLAGS[8]} {MIN[64]} {MAX[64]} {STEP[64]} {NAME} {UNIT} {DEFAULT} {CHOICES} {DESC}`: one argument of an action (an attribute per argument, in a section that may hold several). **TYPE** as above (`0` removes the argument at INDEX); **FLAGS** bit 0: optional; MIN, MAX, STEP float64 (NaN: none); strings null terminated, CHOICES separated by line feeds. `ATTR|name|arg=..|type=..|optional|default=..` in text.
        - `14` **TELEM_ATTR_DESC** (null terminated string): a short description, the tooltip of the name of the telemetry wherever it is shown (`desc=` in text).
        - `15` **TELEM_ATTR_TITLE** (null terminated string): the text of the button of an action (`title=` in text).
        - `16` **TELEM_ATTR_PIXELS** `{SCALE[64]} {INVALID[64]} {FLAGS[8]}`: how the pixels of pictures of values (a 16-bit gray PNG, **IMAGE_TYPE** `2`: depth maps) are read, see `depth.md`. **SCALE** (float64): a pixel is worth its number x SCALE, in the unit of the telemetry (1 without the attribute; 0 is taken as 1). **INVALID** (float64): the number of a pixel without measure (0 without the attribute; NaN: every number is a measure). **FLAGS** bit 0: the values are **not** distances along the axis of the camera (a thermal camera...): never placed in 3D. `ATTR|name|scale=..|nodata=..|depth=0` in text.
        - Attributes `11` to `16` are newer than the others: a viewer that does not know them stops reading the packet there (sections have no length). Send them last in a packet, or in a packet of their own.
        - `9` **TELEM_ATTR_RANGE** `{MIN[64] - MAX[64]}` (float64): the values a number telemetry is expected between. A side that is not a number (NaN) is open. It changes nothing to the data: views use it as an extent (the bar of a value, the scale of a chart). `ATTR|name|min=..|max=..` in the text protocol, see `time-views.md`.
        - `5` **TELEM_ATTR_SHAPE** `{TELEM_ATTR_SHAPE_TYPE[8] - TELEM_ATTR_SHAPE_DATA[x]}`:
          - `0` **TELEM_ATTR_SHAPE_TYPE_CUBE**: the 2D object is a square, and the 3D object is a cube. (no **TELEM_ATTR_SHAPE_DATA**)
          - `1` **TELEM_ATTR_SHAPE_TYPE_SPHERE**: the 2D object is a circle, and the 3D object is a sphere. (no **TELEM_ATTR_SHAPE_DATA**)
          - `2` **TELEM_ATTR_SHAPE_TYPE_CYLINDER**: the 3D object is a cylinder. (no **TELEM_ATTR_SHAPE_DATA**)
          - `3` **TELEM_ATTR_SHAPE_TYPE_RECT**: a flat rectangle, in the xy plane of the shape (sections `25`, `26`/`27`, `31` place and size it; its size along z is ignored). (no **TELEM_ATTR_SHAPE_DATA**)
          - `4` **TELEM_ATTR_SHAPE_TYPE_CIRCLE**: a flat disc, same.
          - `5` **TELEM_ATTR_SHAPE_TYPE_LINE**: a line through points. The points are sent as point cloud samples (section `35`, without intensity nor color), in the frame of the shape: one sample is the whole line.
          - `6` **TELEM_ATTR_SHAPE_TYPE_POLYGON**: the surface inside such points.
          - `7` **TELEM_ATTR_SHAPE_TYPE_ARROW**: an arrow from the position of the shape along a vector (section `37`).
          - `8` **TELEM_ATTR_SHAPE_TYPE_TEXT**: a text (section `38`) at the position of the shape; its height is the size of the shape along y (section `31`), a steady size on screen when no size was sent.
          - `10` **TELEM_ATTR_SHAPE_TYPE_STL**: the 3D object is defined by an STL file. **TELEM_ATTR_SHAPE_DATA**(null terminated string): the URL to the STL file. *NOTE: urls needs to be accessible by the viewer (so online or locally served with proper CORS policies)*

  - `/not a section type/` **TELEM_DATA_HEADER**: Contains generic info about a telemetry update. Unspecialized header:
    - `{TELEM_ID[16]} - {TIME_REFERENCE[64]} - {COUNT[8]}`
      - **TELEM_ID**(uint16): client-defined id of the telemetry to update.
      - **TIME_REFERENCE**(uint64, nanoseconds): the unix epoch timestamp (in nanoseconds) of this telemetry update.
      - **COUNT**(uint8): the number **TELEM_DATA**s.
      - Every **TIMEDIFF** of a section is an uint32 in nanoseconds from the **TIME_REFERENCE**, so it must be in `[0, 4294967295]` (about 4.29 s). Encoders must not put a sample outside of this range in the section (later or earlier than the reference): it starts a new section (with its own **TIME_REFERENCE**) instead, otherwise the timestamp wraps around and is decoded wrong.

  - `20` **TELEM_DATA_NUMBER**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_NUMBER( {TIMEDIFF[32]} - {VALUE[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE**(float32): the value of the telemetry.

  - `21` **TELEM_DATA_NUMBER_2D**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_NUMBER_2D( {TIMEDIFF[32]} - {VALUE_1[32]} - {VALUE_2[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_1**(float32): the value of the telemetry in the first dimension (x).
        - **VALUE_2**(float32): the value of the telemetry in the second dimension (y).

  - `22` **TELEM_DATA_NUMBER_3D**: *(displayed as a point of a 3D view, with the trail of its latest positions)*
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_NUMBER_3D( {TIMEDIFF[32]} - {VALUE_1[32]} - {VALUE_2[32]} - {VALUE_3[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_1**(float32): the value of the telemetry in the first dimension (x).
        - **VALUE_2**(float32): the value of the telemetry in the second dimension (y).
        - **VALUE_3**(float32): the value of the telemetry in the third dimension (z).

  - `23` **TELEM_DATA_TEXT**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_TEXT( {TIMEDIFF[32]} - {VALUE} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE**(null terminated string): the text-value of the telemetry, terminated by a `\0`.

  - `24` **TELEM_DATA_IMAGE**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_IMAGE( {TIMEDIFF[32]} - {IMAGE_TYPE[8]} - {IMAGE_PART_INDEX[16]} - {IMAGE_PART_COUNT[16]} - {IMAGE_PART_SIZE[16]} - {VALUE} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **IMAGE_TYPE**(uint8): the type of image shared (encoding):
          - `0` : JPEG
          - `1` : PNG (a 16-bit grayscale PNG is a picture of values: its numbers are read, see `depth.md`)
          - `2` : RAW, plain numbers (a depth map): `{WIDTH[16]} {HEIGHT[16]} {FORMAT[8]} {3 bytes at 0}` then the numbers, row after row, little-endian. **FORMAT** `0` gray16 (uint16), `1` float32. Read with **TELEM_ATTR_PIXELS**. See `depth.md`.
        - **IMAGE_PART_INDEX**(uint16): as images can be too big for a single packet, this allows to split image into parts (smaller buffer, identified by an index, from 0 to **IMAGE_PART_COUNT** - 1). The parts of an image share the same timestamp; they can come in any order and in several packets. The image is stored once all its parts are received; parts of an image that never completes are dropped when the next image starts.
        - **IMAGE_PART_COUNT**(uint16): total number of **IMAGE_PART_INDEX** expected to complete this image.
        - **IMAGE_PART_SIZE**(uint16): size in byte of the **VALUE** buffer.
        - **VALUE**(buffer): buffer containing the raw bytes of this image part.

  3D shapes: a telemetry with the **TELEM_ATTR_SHAPE** attribute and/or any of the **TELEM_DATA_SHAPE_...** sections below is a shape. Each section is optional and can be sent on its own, at its own rate (ex: the size and the color once, the position 50 times per second). What was never sent has a default: a cube of 1 at the origin, not rotated, opaque, in the color of the telemetry (**TELEM_ATTR_COLOR**). Frame: right-handed, **x forward, y left, z up**. The text protocol has the same shapes (`3D|...` lines, see the README); how they are displayed is in `doc/3d.md`.

  - `25` **TELEM_DATA_SHAPE_3D_POSITION**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_3D_POSITION( {TIMEDIFF[32]} - {VALUE_X[32]} - {VALUE_Y[32]} - {VALUE_Z[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_X**(float32): the position of the 3D shape along x axis.
        - **VALUE_Y**(float32): the position of the 3D shape along y axis.
        - **VALUE_Z**(float32): the position of the 3D shape along z axis.

  - `26` **TELEM_DATA_SHAPE_3D_ROTATION**: *Prefer TELEM_DATA_SHAPE_3D_QUATERNION to set shape orientation*
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_3D_ROTATION( {TIMEDIFF[32]} - {VALUE_R[32]} - {VALUE_P[32]} - {VALUE_Y[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_R**(float32): the rotation of the 3D shape, in radian, using euler angles. Roll along x axis.
        - **VALUE_P**(float32): the rotation of the 3D shape, in radian, using euler angles. Pitch along y axis.
        - **VALUE_Y**(float32): the rotation of the 3D shape, in radian, using euler angles. Yaw along z axis.
        - The three rotations are applied in that order (roll, pitch, yaw) around the fixed axes. When a shape received both rotations and quaternions, the latest one is used.

  - `27` **TELEM_DATA_SHAPE_3D_QUATERNION**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_3D_QUATERNION( {TIMEDIFF[32]} - {VALUE_W[32]} - {VALUE_X[32]} - {VALUE_Y[32]} - {VALUE_Z[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_W**(float32): the orientation of the 3D shape, W component of the quaternion.
        - **VALUE_X**(float32): the orientation of the 3D shape, X component of the quaternion.
        - **VALUE_Y**(float32): the orientation of the 3D shape, Y component of the quaternion.
        - **VALUE_Z**(float32): the orientation of the 3D shape, Z component of the quaternion.

  - `28` **TELEM_DATA_SHAPE_COLOR_STR**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_COLOR_STR( {TIMEDIFF[32]} - {VALUE} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE**(null terminated string): the color of the shape, as an HTML color name, an color code starting with `#`. (ex: "blue", "#2ecc71")

  - `29` **TELEM_DATA_SHAPE_COLOR_RGB**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_COLOR_RGB( {TIMEDIFF[32]} - {VALUE_R[8]} - {VALUE_G[8]} - {VALUE_B[8]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_R**(uint8): red component of the shape color.
        - **VALUE_G**(uint8): green component of the shape color.
        - **VALUE_B**(uint8): blue component of the shape color.

  - `30` **TELEM_DATA_SHAPE_OPACITY**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_OPACITY( {TIMEDIFF[32]} - {VALUE[8]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE**(uint8): opacity value to the shape, 0 being fully transparent and 255 fully opaque

  - `31` **TELEM_DATA_SHAPE_SIZE**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_SIZE( {TIMEDIFF[32]} - {VALUE_X[32]} - {VALUE_Y[32]} - {VALUE_Z[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_X**(float32): size along X axis.
        - **VALUE_Y**(float32): size along Y axis.
        - **VALUE_Z**(float32): size along Z axis.
        - The size is the extent of the shape along each axis: the sides of a cube, the diameters of a sphere, the diameters (x, y) and the height (z) of a cylinder. An STL file is scaled by it.
        
  - `32` **TELEM_DATA_SHAPE_TEXTURE**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_TEXTURE( {TIMEDIFF[32]} - {VALUE_TYPE[8]} - {VALUE[...]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_TYPE**(uint8): the type of texture to apply.
            - `0` **TEXTURE_NONE**: apply no texture
            - `1` **TEXTURE_URL**: interpret the **VALUE** as an URL to an image and apply it as a texture.
            - `2` **TEXTURE_IMAGE**: interpret the **VALUE** as the name of an image-type telemetry, and apply this image as the texture.
        - **VALUE**(null terminated string): the **TEXTURE_URL** or **TEXTURE_IMAGE** string value, terminated by a `\0`.

  Cameras: an image telemetry that also has **TELEM_DATA_CAMERA_INTRINSICS** is a camera, and 3D telemetries (shapes, 3D points) can be drawn over its images as it saw them (image view, see `doc/3d.md`). Where the camera is comes from the shape sections sent on the same telemetry: **TELEM_DATA_SHAPE_3D_POSITION** and **TELEM_DATA_SHAPE_3D_QUATERNION** (or **ROTATION**), in the frame of the scene like any shape: the camera looks along its x axis, its y axis is to the left of the image and its z axis to the top of the image (not rotated: it looks along the x of the world, upright). Never sent: at the origin, not rotated. **TELEM_DATA_SHAPE_SIZE** x is how far the camera is drawn in 3D views (the pyramid of what it sees). Each image is displayed with the camera parameters and the 3D telemetries as they were at the timestamp of the image (the last sample at or before it): nothing is interpolated.

  - `33` **TELEM_DATA_CAMERA_INTRINSICS**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_CAMERA_INTRINSICS( {TIMEDIFF[32]} - {WIDTH[16]} - {HEIGHT[16]} - {FX[32]} - {FY[32]} - {CX[32]} - {CY[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds from which these parameters apply. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **WIDTH**, **HEIGHT**(uint16): size in pixels of the image the parameters are given for. The images sent can have another size with the same proportions (ex: sent smaller than they were calibrated).
        - **FX**, **FY**(float32): focal lengths, in pixels.
        - **CX**, **CY**(float32): principal point, in pixels.
        - These follow the usual image convention (pinhole model, as in OpenCV and ROS): pixel (0, 0) is the center of the top left pixel, u goes to the right and v down, and a point at X (right), Y (down), Z (forward) of the camera is seen at `u = FX * X / Z + CX`, `v = FY * Y / Z + CY`.

  - `34` **TELEM_DATA_CAMERA_DISTORTION**: *(optional: without it the camera is a plain pinhole)*
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_CAMERA_DISTORTION( {TIMEDIFF[32]} - {K1[32]} - {K2[32]} - {P1[32]} - {P2[32]} - {K3[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds from which these coefficients apply. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **K1**, **K2**, **K3**(float32): radial distortion coefficients.
        - **P1**, **P2**(float32): tangential distortion coefficients.

  - `35` **TELEM_DATA_POINT_CLOUD**: *(a sample is a whole cloud: a lidar scan, the points of a depth camera...)*
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_POINT_CLOUD( {TIMEDIFF[32]} - {FLAGS[8]} - {PART_INDEX[16]} - {PART_COUNT[16]} - {POINT_COUNT[16]} - POINT( {X[32]} - {Y[32]} - {Z[32]} - {INTENSITY[32]}? - {R[8]}{G[8]}{B[8]}? )... )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, when the cloud was taken. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **FLAGS**(uint8): what each point carries after its position. Bit 0 (`1`): an intensity. Bit 1 (`2`): a color. Both can be set.
        - **PART_INDEX**, **PART_COUNT**(uint16): a cloud that does not fit in one packet is sent in **PART_COUNT** parts, numbered from 0, with the same timestamp and flags. It is stored once every part has arrived, in the order of the parts. A cloud in one piece has **PART_INDEX** 0 and **PART_COUNT** 1.
        - **POINT_COUNT**(uint16): number of points in this part.
        - **X**, **Y**, **Z**(float32): position of the point **in the frame of the sensor** (x forward, y left, z up). A flat scan (2D lidar) sets Z to 0.
        - **INTENSITY**(float32, only with flag 1): any scale; a cloud is colored from its lowest to its highest intensity.
        - **R**, **G**, **B**(uint8, only with flag 2): color of the point.
        - Where the sensor is in the scene is sent with the shape sections `25` (position) and `26` or `27` (orientation) on the same telemetry: each cloud is drawn with the pose in effect at its timestamp. Without them the sensor is at the origin.
        - Brown-Conrady model, in the order of OpenCV. With `x = X / Z`, `y = Y / Z` and `r² = x² + y²`: `x' = x (1 + K1 r² + K2 r⁴ + K3 r⁶) + 2 P1 x y + P2 (r² + 2 x²)`, `y' = y (1 + K1 r² + K2 r⁴ + K3 r⁶) + P1 (r² + 2 y²) + 2 P2 x y`, then `u = FX * x' + CX`, `v = FY * y' + CY`.
        - The images are displayed as they are received (never undistorted): what is drawn over them is distorted like the lens does.

  - `37` **TELEM_DATA_SHAPE_VECTOR**: the vector of an arrow, from its position, in the frame of the shape.
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - ({TIMEDIFF[32]} - {X[32]} - {Y[32]} - {Z[32]})...` (float32)

  - `38` **TELEM_DATA_SHAPE_TEXT**: the text of a text shape.
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - ({TIMEDIFF[32]} - {TEXT[null terminated string]})...`

  - `39` **TELEM_DATA_SHAPE_LINE_WIDTH**: width of the lines of a shape (a line, the outline of a polygon, an arrow), in the units of its frame. Never sent: as thin as the screen draws.
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - ({TIMEDIFF[32]} - {WIDTH[32]})...` (float32)

  - `40` **TELEM_DATA_THRESHOLD**: limits of a number telemetry (see `time-views.md`). A sample is one threshold, from its timestamp on.
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - ({TIMEDIFF[32]} - {OPERATOR[8]} - {VALUE[64]} - {NAME[null terminated string]} - {COLOR[null terminated string]})...`
      - **OPERATOR**(uint8): `0` **THRESHOLD_BELOW**: the telemetry is past the limit when its value is below it (`<` in the text protocol); `1` **THRESHOLD_ABOVE**: when it is above (`>`).
      - **VALUE**(float64): the limit. Not a number (NaN): the threshold of that name is removed from then on.
      - **NAME**: the name of the threshold (`low`, `critical`...). A sample replaces, from its timestamp on, the one of the same name; thresholds of different names live side by side.
      - **COLOR**: a CSS color (`red`, `#e74c3c`), or an empty string for the default one.
      - Sent to the telemetry whose numbers it limits, at any time and at its own rate: once when the device starts, or whenever a limit moves. What is displayed for a past moment uses the limits in force at that moment.
      - Same as `TH|name:threshold<value,color` in the text protocol.

  - `41` **CALL** (page to device, `telecmd.md`): a call of an action.
    - **SECTION_DATA**: `{TELEM_ID[16]} - {CALL_ID[16]} - {COUNT[8]} - ({INDEX[8]} - {VALUE})...`
      - **TELEM_ID**: the id the device gave the action, in a packet that has the client id of the device. **CALL_ID**: increases with each call of the page; a call sent again (the answer did not come) has the same id: run it once, answer it again.
      - One **INDEX** (of the argument in the declaration) and **VALUE** per argument given (optional ones left empty are not sent): number float64, bool uint8, text null terminated, xy two float64, xyz and pose2d three float64.
    - A setting is written with the usual data section of its telemetry (`20`, `21`, `22` or `23`), one sample, time reference 0 (the page does not know the clock of the device: ignore it).

  - `42` **CALL_ANSWER** (device to page): `{TELEM_ID[16]} - {CALL_ID[16]} - {STATUS[8]} - {TEXT[null terminated string]}`. **STATUS**: `2` running (send it when the call starts), `0` done (TEXT: a short result, or empty), `1` failed or refused (TEXT: why). **CALL_ID** `0xFFFF`: a setting was refused (`ACK|name:err:why` in text).

  - `36` **TELEM_DATA_FLOAT64**: Samples of a data type made of numbers, each number as a float64. For values that the section of the data type would round (its float32, or its integers): what Teleplot writes to a binary file uses it when needed, a device can use it too.
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - {DATA_TYPE[8]} - ({TIMEDIFF[32]} - {VALUE[64]}...)...`
      - **DATA_TYPE**(uint8): the section type of the data: `20`, `21`, `22` (numbers), `25`, `26`, `27`, `29`, `30`, `31`, `37`, `39` (shapes), `33`, `34` (cameras).
      - **VALUE**(float64): as many as a sample of the data type has numbers, in the order of its own section (`22`: x, y, z; `33`: width, height, fx, fy, cx, cy...).

### Telemetries identified by their name

The client id `0xFFFF` is reserved: its telemetries are identified by their **name**, as in the text protocol, not by a client and an id. In a `TELEM_ATTR` section of this client, the name attribute comes first; from then on the `TELEM_ID` of the section stands for the telemetry of that name (created if needed), until another name is given to this id. Teleplot uses it to write, in a binary file, the telemetries it received from the text protocol: read back, they are the same telemetries.

### Binary files

A binary data file is `54 50 4C 54 0A 01 00 00` ("TPLT", a line feed, the file version, two reserved bytes), then packets, each after its length (uint32, little-endian). See `files.md`.

2D: there is no separate family of 2D sections. A flat telemetry is a 3D one with z = 0 (the shape types `3` to `8` above, 2D numbers, a point cloud whose points have z = 0); the viewer shows it in a 2D view by default, and in 3D views too. See `2d.md`.