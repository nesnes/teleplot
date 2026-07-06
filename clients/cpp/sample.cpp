#include <math.h>
#include "Teleplot.h"
#include <stdlib.h>

//Teleplot teleplot("127.0.0.1", 47269);

int main(int, char*[])
{
    // Set client options like name
    Teleplot::instance().setOptions({ .address = "192.168.0.170", .clientName = "cpp_sample", 
        /*.sendPacketFunction = [](std::vector<std::byte> const& packet) {
            // Display packet as hex string
            std::string hexString;
            for (std::byte b : packet) {
                char buf[6];
                snprintf(buf, sizeof(buf), "0x%02x ", std::to_integer<unsigned char>(b));
                hexString += buf;
            }
            std::cout << "Sending packet: " << hexString << std::endl;
        }*/
    });

    // Telemetry without attributes
    Teleplot::instance().update("number.simple", 12.5);

    // Telemetry without a unit, and without timestamp (will use current time)
    Teleplot::instance().update("number.noTimestamp", 12.5, std::nullopt, { .unit = "m/s" });

    // Telemetry with timestamp
    auto now = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch());
    Teleplot::instance().update("number.timestamped", 12.5, now, { .unit = "m/s" });

    Teleplot::instance().flush();

    /*float i = 0;
    int state_arr_length = 3;
    std::string state_arr[state_arr_length] = {"standing", "sitting", "walking"};

    int heights_arr_length = 6; double heights_arr[heights_arr_length] = {20, 5, 8, 4, 1, 2};

    for (;;)
    {
        // Use instanciated object
        teleplot.update("sin", sin(i), "km²");
        teleplot.update("cos", cos(i), "", 10); // Limit at 10Hz
        teleplot.update("state", state_arr[rand()%state_arr_length], "", 0, "t");

        teleplot.update3D(
            ShapeTeleplot("mysquare", "cube")
            .setCubeProperties(heights_arr[rand()%heights_arr_length])
            .setPos(sin(i)*10, cos(i)*10)
        );
        
        // Use static localhost object
        Teleplot::localhost().update("tan", tan(i), "");
        
        usleep(10000);

        i+=0.1;
    }*/
    return 0;
}