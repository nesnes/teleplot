#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include "Adafruit_AHRS_Mahony.h"
#include <Wire.h>
#include <math.h>

Adafruit_MPU6050 mpu;
Adafruit_Mahony filter;

float offset_gx = 0.07;
float offset_gy = -0.1;
float offset_gz = 0.02;


void setup(void) {
  Serial.begin(921600);

  // Try to initialize!
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) {
      delay(10);
    }
  }
  Serial.println("MPU6050 Found!");

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);

  mpu.setFilterBandwidth(MPU6050_BAND_5_HZ);
  filter.begin(5);
}

void loop() {
  /* Get new sensor events with the readings */
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  g.gyro.x -= offset_gx;
  g.gyro.y -= offset_gy;
  g.gyro.z -= offset_gz;

  /* Estimate pose */
  filter.updateIMU( g.gyro.x
                  , g.gyro.y
                  , g.gyro.z
                  , a.acceleration.x
                  , a.acceleration.y
                  , a.acceleration.z);

  /* Print out the values */
  Serial.print("a.x:"); Serial.print(a.acceleration.x); Serial.println("|np");
  Serial.print("a.y:"); Serial.print(a.acceleration.y); Serial.println("|np");
  Serial.print("a.z:"); Serial.print(a.acceleration.z); Serial.println("|np");
  Serial.print("g.x:"); Serial.print(g.gyro.x); Serial.println("|np");
  Serial.print("g.y:"); Serial.print(g.gyro.y); Serial.println("|np");
  Serial.print("g.z:"); Serial.print(g.gyro.z); Serial.println("|np");
  Serial.print("temperature:"); Serial.print(temp.temperature); Serial.println("|np");

  Serial.print("pose.roll:"); Serial.print( filter.getRoll()); Serial.println("|np");
  Serial.print("pose.pitch:"); Serial.print(filter.getPitch()); Serial.println("|np");
  Serial.print("pose.yaw:"); Serial.print(  filter.getYaw()); Serial.println("|np");
  // 3D

  
  Serial.print("3D|IMU:R:");
  Serial.print((filter.getPitch() * M_PI /180.f));
  Serial.print(":");
  Serial.print((filter.getYaw() * M_PI /180.f));
  Serial.print(":");
  Serial.print((-filter.getRoll() * M_PI /180.f ));
  Serial.println(":S:cube:W:4:H:1.5:D:3:C:grey|g");
  
  //delay(1);
}