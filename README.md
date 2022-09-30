<img src="images/logo-color.svg" width="300px" alt="Teleplot logo"/>

# Teleplot

A ridiculously simple tool to plot telemetry data from a running program and trigger function calls.

![](images/preview.jpg)

`echo "myData:4|g" | nc -u -w0 127.0.0.1 47269`

# Start the server

## As a binary
```bash
cd server
npm i
sudo npm run-script make
./build/teleplot
```

> Current target is x64 and configurable in `package.json -> pkg/targets`

## Using node
```bash
cd server
npm i
node main.js
```

Open your navigator at [127.0.0.1:8080](127.0.0.1:8080)

## Using docker
```bash
cd server
docker build -t teleplot .
docker run -d -p 8080:8080 -p 47269:47269/udp teleplot
```

Open your navigator at [127.0.0.1:8080](127.0.0.1:8080)

## Using docker-compose
```bash
cd server
docker-compose build
docker-compose up
```

Open your navigator at [127.0.0.1:8080](127.0.0.1:8080)

# Telemetry Format

A telemetry gets published by sending a text-based UDP packet on the port `47269`. As it's a trivial thing to do on the vast majority of languages, it makes it very easy to publish from anywhere.

The telemetry format is inspired by `statsd` and *to some extents* compatible with it.

The expected format is `A:B:C:D|E` where:
- **A** is the name of the telemetry variable (be kind and avoid **`:|`** special chars in it!)
- **B** is **optional** and represents the timestamp in milliseconds (`1627551892437`). If omitted, like in `myValue:1234|g`, the reception timestamp will be used, wich will create some precision loss due to the networking.
- **C** is either the integer or floating point value to be plotted or a text format value to be displayed.
- **D** is **optional** and is the unit of the telemetry ( please avoid **`,;:|`** special chars and **digits** in it!).
- **E** is containing flags that carry information on how to read and display the data.

Examples:
- `myValue:1234|g`
- `myValue:1627551892437:1234|g`
- `myValue:1234:km²|g`

### Plot XY rather than time-based

Using the `xy` flag, and providing a value in both **B** and **C** field, teleplot will display an YX line chart. 

- `trajectory:12.3:45.67|xy`

A timestamp can be associated with the xy point by adding an extra `:1627551892437` after the **C** field.

- `trajectoryTimestamped:1:1:1627551892437;2:2:1627551892448;3:3:1627551892459|xy`

### Publishing text format telemetries
- text format telemetries contain a string rather than numbers.

- `motor_4_state:Turned On|g`

### Publishing multiple points
/!\ does not work for text format telemetries.

Multiple values of a single telemetry can be sent in a single packet if separated by a `;`

- `trajectory:1:1;2:2;3:3;4:4|xy`
- `myValue:1627551892444:1;1627551892555:2;1627551892666:3|g`

### Publishing multiple telemetries

Multiple telemetries can be sent in a single packet if separated by a `\n`

```
myValue:1234|g
mySecondValue:1234:m/s|g
myThirdValue:1627551892437:1234|g
trajectory:1:1;2:2;3:3;4:4|xy
trajectoryTimestamped:1:1:1627551892437;2:2:1627551892448;3:3:1627551892459|xy
```

> Notice that your data needs to fit in a single UPD packet whick can be limited to 512(Internet), 1432(Intranets) or 8932(Jumbo frames) Bytes depending on the network.

### Prevent auto-plot of telemetry

By default, teleplot will display all the incoming telemetry as a chart, while this is handy for new user with small amount of data, this might not be desired with lots of data.
The `np` (for no-plot) flag can be used to prevent this behavior:
- `myValue:1627551892437:1234|np`
- `trajectory:12.3:45.67|xynp`
# Publish telemetries

## Bash

```bash
echo "myValue:1234|g" | nc -u -w0 127.0.0.1 47269
```

## C++

Copy `Teleplot.h` (from `clients/cpp`) in your project and use its object.
```cpp
#include <math.h>
#include "Teleplot.h"
Teleplot teleplot("127.0.0.1");

int main(int argc, char* argv[])
{
    for(float i=0;i<1000;i+=0.1)
    {
        // Use instanciated object
        teleplot.update("sin", sin(i));
        teleplot.update("cos", cos(i), 10); // Limit at 10Hz

        // Use static localhost object
        Teleplot::localhost().update("tan", tan(i));
        
        usleep(10000);
    }
    return 0;
}
```

## Python

```python
import socket
import math
import time

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def sendTelemetry(name, value):
	now = time.time() * 1000
	msg = name+":"+str(now)+":"+str(value)+"|g"
	sock.sendto(msg.encode(), teleplotAddr)

i=0
while i < 1000:
	
	sendTelemetry("sin", math.sin(i))
	sendTelemetry("cos", math.cos(i))

	i+=0.1
	time.sleep(0.01)
```

## Not listed?

You just need to send a UDP packet with the proper text in it. Open your web browser, search for `my_language send UDP packet`, and copy-paste the first sample you find before editing it with the following options:
	
- address: `127.0.0.1`
- port: `47269`
- your test message: `myValue:1234|g` 

# Remote function calls

Remote function calls is an optional feature that opens an UDP socket between the program and the Teleplot server to pull the list of registered functions and call them.

# Register a function

## C++

Copy `Telecmd.h` (from `clients/cpp`) in your project and use its object.
`Telecmd.h` and `Teleplot.h` can be used at the same time.

```cpp
#include "Telecmd.h"

int main(int argc, char* argv[])
{
    bool keepRunning = true;

    Telecmd::localhost().registerCmd("sayHello",[](std::string params){
        std::cout << "Hello " << params << std::endl;
    });

    Telecmd::localhost().registerCmd("stop",[&](std::string){
        std::cout << "Stopping..." << std::endl;
        keepRunning = false
    });

    // Main program loop
    while(keepRunning){
        Telecmd::localhost().run();
    }
    return 0;
}
```

## Call a function

Functions can be called from the Teleplot interface and will be auto-discovered, however, they can also be triggered by a simple UDP packet:

- With a string as parameter: `echo "|sayHello|world|" | nc -u -w0 127.0.0.1 47268`
- Without parameters: `echo "|stop|" | nc -u -w0 127.0.0.1 47268`

## Send a text log

Along with telemetries, you can also send text logs to be display in a console-like manner:

`echo ">:Hello world" | nc -u -w0 127.0.0.1 47269`

By adding a millisecond timestamp to your log, you can sync them with the charts.

`echo ">1627551892437:Hello world" | nc -u -w0 127.0.0.1 47269`
