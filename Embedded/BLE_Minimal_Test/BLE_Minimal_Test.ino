/**
 * ESP32-S3 BLE 最小诊断程序
 *
 * 用途：
 *   只验证 BLE 库、ESP32-S3 开发板和供电是否能稳定工作。
 *   本程序不连接继电器、不使用外部 GPIO，也不关闭 Brownout 检测。
 *
 * 网页端协议：Nordic UART Service (NUS)
 *   Service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
 *   RX (写): 6E400002-B5A3-F393-E0A9-E50E24DCCA9E
 *   TX (通知): 6E400003-B5A3-F393-E0A9-E50E24DCCA9E
 *
 * 测试指令：
 *   ping\0       -> PONG
 *   status\0     -> BLE:OK
 *   其他文本     -> ECHO:<文本>
 *
 * Arduino IDE：
 *   Board: ESP32S3 Dev Module
 *   Serial Monitor: 115200
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "esp_system.h"

#define DEVICE_NAME  "TW03-BLE-TEST"
#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define RX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLECharacteristic *txCharacteristic = nullptr;
volatile bool bleConnected = false;

void notifyText(const String &text) {
  Serial.print("[BLE TX] ");
  Serial.println(text);

  if (bleConnected && txCharacteristic != nullptr) {
    txCharacteristic->setValue((uint8_t *)text.c_str(), text.length());
    txCharacteristic->notify();
  }
}

String cleanCommand(String value) {
  int nul = value.indexOf('\0');
  if (nul >= 0) value = value.substring(0, nul);
  value.replace("\r", "");
  value.replace("\n", "");
  value.trim();
  value.toLowerCase();
  return value;
}

void handleCommand(String value, const char *source) {
  String command = cleanCommand(value);
  if (command.length() == 0) return;

  Serial.printf("[%s RX] %s\n", source, command.c_str());

  if (command == "ping") {
    notifyText("PONG");
  } else if (command == "status") {
    notifyText("BLE:OK");
  } else {
    notifyText("ECHO:" + command);
  }
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    bleConnected = true;
    Serial.println("[BLE] connected");
  }

  void onDisconnect(BLEServer *) override {
    bleConnected = false;
    Serial.println("[BLE] disconnected; restarting advertising");
    delay(100);
    BLEDevice::startAdvertising();
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    // 当前 ESP32 Arduino BLE 库版本返回 Arduino String。
    String value = characteristic->getValue();
    if (value.length() > 0) {
      handleCommand(value, "BLE");
    }
  }
};

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("========================================");
  Serial.println(" ESP32-S3 BLE minimal test");
  Serial.println("========================================");
  Serial.printf("Free heap before BLE: %u bytes\n", (unsigned)ESP.getFreeHeap());

  BLEDevice::init(DEVICE_NAME);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  txCharacteristic = service->createCharacteristic(
      TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *rxCharacteristic = service->createCharacteristic(
      RX_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rxCharacteristic->setCallbacks(new RxCallbacks());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] advertising as %s\n", DEVICE_NAME);
  Serial.printf("Free heap after BLE: %u bytes\n", (unsigned)ESP.getFreeHeap());
  Serial.println("Send ping or status from the web demo / serial monitor.");
}

void loop() {
  static String serialBuffer;

  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r' || ch == '\0') {
      if (serialBuffer.length() > 0) {
        handleCommand(serialBuffer, "USB");
        serialBuffer = "";
      }
    } else if (serialBuffer.length() < 64) {
      serialBuffer += ch;
    }
  }

  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat >= 5000) {
    lastHeartbeat = millis();
    Serial.printf("[heartbeat] BLE:%s heap:%u reset:%d\n",
                  bleConnected ? "connected" : "advertising",
                  (unsigned)ESP.getFreeHeap(),
                  (int)esp_reset_reason());
  }

  delay(10);
}
