<img src="images/logo-color.svg" width="300px" alt="Teleplot logo"/>

# Teleplot

A ridiculously simple tool to plot telemetry data from a running program.

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

The expected format is `A:B:C|D` where:
- **A** is the name of the telemetry variable (be kind and avoid `:|` special chars in it!)
- **B** is **optional** and represents the timestamp in milliseconds (`1627551892437`). If omitted, like in `myValue:1234|g`, the reception timestamp will be used, wich will create some precision loss due to the networking.
- **C** is the integer or floating point value to be plotted
- **D** is containing flags that carry information on how to read and display the data.

Examples:
- `myValue:1234|g`
- `myValue:1627551892437:1234|g`

### Plot XY rather than time-based

Using the `xy` flag, and providing a value in both **B** and **C** field, teleplot will display an YX line chart. 

- `trajectory:12.3:45.67|xy`

### Publishing multiple points

Multiple values of a single telemetry can be sent in a signle packet if separated by a `;`

- `trajectory:1:1;2:2;3:3;4:4|xy`
- `myValue:1627551892444:1;1627551892555:2;1627551892666:3|g`

### Publishing multiple telemetries

Multiple telemetries can be sent in a single packet if separated by a `\n`

```
myValue:1234|g
mySecondValue:1234|g
myThirdValue:1627551892437:1234|g
trajectory:1:1;2:2;3:3;4:4|xy
```

> Notice that your data needs to fit in a single UPD packet whick can be limited to 512(Internet), 1432(Intranets) or 8932(Jumbo frames) Bytes depending on the network.

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

# Desired futur features/improvments

 - Create a visual explaining how it works
 - Export data in CSV format
 - Select data to display
 - Add a clear button or a notion of session