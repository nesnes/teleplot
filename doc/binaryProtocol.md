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
        - `5` **TELEM_ATTR_SHAPE** `{TELEM_ATTR_SHAPE_TYPE[8] - TELEM_ATTR_SHAPE_DATA[x]}`:
          - `0` **TELEM_ATTR_SHAPE_TYPE_CUBE**: the 2D object is a square, and the 3D object is a cube. (no **TELEM_ATTR_SHAPE_DATA**)
          - `1` **TELEM_ATTR_SHAPE_TYPE_SPHERE**: the 2D object is a circle, and the 3D object is a sphere. (no **TELEM_ATTR_SHAPE_DATA**)
          - `2` **TELEM_ATTR_SHAPE_TYPE_CYLINDER**: the 3D object is a cylinder. (no **TELEM_ATTR_SHAPE_DATA**)
          - `10` **TELEM_ATTR_SHAPE_TYPE_STL**: the 3D object is defined by an STL file. **TELEM_ATTR_SHAPE_DATA**(null terminated string): the URL to the STL file. *NOTE: urls needs to be accessible by the viewer (so online or locally served with proper CORS policies)*

  - `/not a section type/` **TELEM_DATA_HEADER**: Contains generic info about a telemetry update. Unspecialized header:
    - `{TELEM_ID[16]} - {TIME_REFERENCE[64]} - {COUNT[8]}`
      - **TELEM_ID**(uint16): client-defined id of the telemetry to update.
      - **TIME_REFERENCE**(uint64, nanoseconds): the unix epoch timestamp (in nanoseconds) of this telemetry update.
      - **COUNT**(uint8): the number **TELEM_DATA**s.

  - `20` **TELEM_DATA_NUMBER**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_NUMBER( {TIMEDIFF[32]} - {VALUE[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE**(float32): the value of the telemetry.

  - `21` **TELEM_DATA_NUMBER_2D**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_NUMBER_2D( {TIMEDIFF[32]} - {VALUE_1[32]} - {VALUE_2[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_1**(float32): the value of the telemetry in the first dimension (x).
        - **VALUE_2**(float32): the value of the telemetry in the second dimension (y).

  - `22` **TELEM_DATA_NUMBER_3D**:
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
          - `1` : PNG
        - **IMAGE_PART_INDEX**(uint16): as images can be too big for a single packet, this allows to split image into parts (smaller buffer, identified by an index).
        - **IMAGE_PART_COUNT**(uint16): total number of **IMAGE_PART_INDEX** expected to complete this image.
        - **IMAGE_PART_SIZE**(uint16): size in byte of the **VALUE** buffer.
        - **VALUE**(buffer): buffer containing the raw bytes of this image part.

  - `24` **TELEM_DATA_SHAPE_3D_POSITION**:
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
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_SIZE( {TIMEDIFF[32]} - {VALUE_R[32]} - {VALUE_G[32]} - {VALUE_B[32]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_X**(float32): size along X axis.
        - **VALUE_Y**(float32): size along Y axis.
        - **VALUE_Z**(float32): size along Z axis.
        
  - `32` **TELEM_DATA_SHAPE_TEXTURE**:
    - **SECTION_DATA**: `{TELEM_DATA_HEADER} - TELEM_DATA_SHAPE_TEXTURE( {TIMEDIFF[32]} - {VALUE_TYPE[8]} - {VALUE[...]} )...`
        - **TIMEDIFF**(uint32, nanoseconds): from the **TIME_REFERENCE**, the offset in nanoseconds at which this telemetry has been generated. `timestamp = TIME_REFERENCE + TIMEDIFF`
        - **VALUE_TYPE**(uint8): the type of texture to apply.
            - `0` **TEXTURE_NONE**: apply no texture
            - `1` **TEXTURE_URL**: interpret the **VALUE** as an URL to an image and apply it as a texture.
            - `2` **TEXTURE_IMAGE**: interpret the **VALUE** as the name of an image-type telemetry, and apply this image as the texture.
        - **VALUE**(null terminated string): the **TEXTURE_URL** or **TEXTURE_IMAGE** string value, terminated by a `\0`.

- TODO 2D shapes