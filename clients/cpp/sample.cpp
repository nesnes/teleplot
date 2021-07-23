#include <math.h>
#include "Teleplot.h"
Teleplot teleplot("127.0.0.1");

int main(int argc, char* argv[])
{
    for(float i=0;i<1000;i+=0.1)
    {
        teleplot.update("sin", sin(i));
        teleplot.update("cos", cos(i));
        teleplot.update("tan", tan(i));
        usleep(10000);
    }
    return 0;
}
