/**
 * TW03 ESP32-S3 分步诊断程序
 * 作用: 逐步执行正式固件里的每个操作，每步前后打印日志。
 *       如果板子重启，最后一条 ">>> 开始" 日志就是导致重启的步骤。
 * 串口监视器: 115200
 */
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include "esp_system.h"
#include "esp_chip_info.h"

static const char *resetReasonText(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON:   return "POWERON 上电/掉电复位 (供电跌落或重新插拔)";
    case ESP_RST_BROWNOUT:  return "BROWNOUT 欠压复位 (供电不足)";
    case ESP_RST_PANIC:     return "PANIC 程序崩溃";
    case ESP_RST_INT_WDT:   return "INT_WDT 中断看门狗";
    case ESP_RST_TASK_WDT:  return "TASK_WDT 任务看门狗";
    case ESP_RST_WDT:       return "WDT 其他看门狗";
    case ESP_RST_SW:        return "SW 软件复位";
    case ESP_RST_USB:       return "USB 复位 (烧录/串口打开)";
    case ESP_RST_EXT:       return "EXT 外部复位 (按了 RST)";
    default:                return "其他";
  }
}

static void stepBegin(int n, const char *name) {
  Serial.printf("\n>>> 开始 第%d步: %s\n", n, name);
  Serial.flush();
  delay(1500);               // 留时间让日志完整发出
}
static void stepEnd(int n) {
  Serial.printf("<<< 完成 第%d步  (可用内存 %u B)\n", n, (unsigned)ESP.getFreeHeap());
  Serial.flush();
  delay(1500);
}

void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 3000) delay(10);
  delay(500);

  esp_chip_info_t info;
  esp_chip_info(&info);
  Serial.println("\n================ TW03 诊断程序 ================");
  Serial.printf("复位原因 : %s\n", resetReasonText(esp_reset_reason()));
  Serial.printf("芯片版本 : rev %d, %d 核\n", info.revision, info.cores);
  Serial.printf("Flash    : %u MB\n", (unsigned)(ESP.getFlashChipSize() / 1024 / 1024));
  Serial.printf("PSRAM    : %s\n", psramFound() ? "已启用" : "未启用");
  Serial.printf("可用内存 : %u B\n", (unsigned)ESP.getFreeHeap());
  Serial.flush();
  delay(1500);

  stepBegin(1, "继电器引脚 GPIO2 设为输出(低电平)");
  pinMode(2, OUTPUT);
  digitalWrite(2, LOW);
  stepEnd(1);

  stepBegin(2, "BLEDevice::init  (打开蓝牙射频，电流最大的一步)");
  BLEDevice::init("TW03-S3");
  stepEnd(2);

  stepBegin(3, "创建 BLE 服务与特征值");
  BLEServer *server = BLEDevice::createServer();
  BLEService *svc = server->createService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  BLECharacteristic *tx = svc->createCharacteristic(
      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLECharacteristic::PROPERTY_NOTIFY);
  tx->addDescriptor(new BLE2902());
  svc->createCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E",
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  svc->start();
  stepEnd(3);

  stepBegin(4, "开始蓝牙广播");
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  stepEnd(4);

  Serial.println("\n✅ 全部步骤通过！蓝牙正常，可在手机 nRF Connect 或 Demo 中搜到 TW03-S3");
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last > 3000) {
    last = millis();
    Serial.printf("[存活] 运行 %lus，可用内存 %u B\n", millis() / 1000, (unsigned)ESP.getFreeHeap());
  }
  delay(10);
}
