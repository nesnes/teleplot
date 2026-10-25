# Teleplot clients

Libraries and samples that send telemetry to Teleplot, one folder per language. Any language that can send a UDP packet, or write to a
serial port, needs none: one line of the text protocol ([doc/textProtocol.md](../doc/textProtocol.md)) is enough.

| Folder | What |
| --- | --- |
| [cpp](cpp/README.md) | `Teleplot.h`: C++17, binary protocol over UDP, Linux / macOS / Windows; `TeleplotImage.h`: camera pictures to JPEG or PNG |
| [arduino/Teleplot](arduino/Teleplot/README.md) | The Arduino library: the same API on a board (text protocol on Serial, UDP or a file), with 22 examples |
| [arduino/commands](arduino/commands/commands.ino) | Settings and actions by hand on a serial port, without the library |
| [python](python/README.md) | `teleplot.py`: telemetry and commands (text protocol, UDP); and small samples |
| [bash](bash/sample.sh) | One line with `nc` |

The API of the C++ and Arduino clients: [doc/cpp-client-api.md](../doc/cpp-client-api.md). Commands from the page:
[doc/telecmd.md](../doc/telecmd.md).

`MPU6050_HID_tests` is a test sketch of Teleplot V1, kept for reference.
