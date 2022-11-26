#include <math.h>
#include "Teleplot.h"
#include <stdlib.h>

Teleplot teleplot("127.0.0.1", 47269);

int main(int argc, char* argv[])
{
    float i = 0;
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
    }
    return 0;
}