/**
 * ==============================================================================
 *  Momcozy TW03 毛巾加热桶 Demo —— ESP32-S3 蓝牙 (BLE) 控制固件  v2.0
 *  硬件: ESP32-S3-N16R8 开发板 (16MB Flash / 8MB OPI PSRAM / BLE 5.0)
 * ==============================================================================
 *
 *  通信协议 (与网页 Demo script.js 保持一致)
 *  ------------------------------------------------------------------
 *  BLE 服务: Nordic UART Service (NUS)
 *    Service : 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
 *    RX(写)  : 6E400002-...  网页 -> 主板
 *    TX(通知): 6E400003-...  主板 -> 网页
 *  指令格式: "消息||值\0"  例如 "start||1\0"、"pause||0\0"
 *    start  -> 继电器吸合 (加热开始)
 *    pause  -> 继电器断开 (stop / off 同义)
 *    ping   -> 回复 "PONG"
 *    status -> 回复 "RELAY:ON" / "RELAY:OFF"
 *  同时支持 USB 串口输入同样的指令 (以换行或 \0 结尾)，方便调试。
 *
 *  接线
 *  ------------------------------------------------------------------
 *    继电器 IN  -> GPIO 2
 *    继电器 VCC -> 5V (3.3V 继电器接 3V3)
 *    继电器 GND -> GND
 *    (运行状态通过串口监视器查看，不使用任何指示灯)
 *
 *  Arduino IDE 设置 (工具菜单)
 *  ------------------------------------------------------------------
 *    开发板          : ESP32S3 Dev Module   (esp32 by Espressif, 3.x)
 *    Flash Size      : 16MB (128Mb)
 *    PSRAM           : Disabled  (本程序不需要 PSRAM，禁用最稳定)
 *    Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS)
 *    USB CDC On Boot : 插 "USB" 口 -> Enabled ；插 "COM" 口 -> Disabled
 *    串口监视器波特率: 115200
 * ==============================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

// ============================== 配置区 ==============================
#define DEVICE_NAME   "TW03-S3"          // 广播名 (保持简短，避免广播包超过 31 字节)
#define SERVICE_UUID  "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define RX_UUID       "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_UUID       "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

static const int  RELAY_PIN        = 2;     // 继电器控制脚
static const bool RELAY_ACTIVE_HIGH = true; // 低电平触发的继电器模块改为 false

static const size_t CMD_MAX_LEN = 64;

// ============================== 全局状态 ==============================
static BLEServer         *gServer = nullptr;
static BLECharacteristic *gTx     = nullptr;

static volatile bool gConnected      = false;
static volatile bool gNeedReAdvertise = false;
static bool          gRelayOn        = false;

static QueueHandle_t gCmdQueue = nullptr;   // BLE 回调 -> 主循环 的命令队列

struct CmdMsg { char text[CMD_MAX_LEN]; };

// ============================== 工具函数 ==============================
static void setRelay(bool on) {
  gRelayOn = on;
  digitalWrite(RELAY_PIN, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW);
}

static void bleNotify(const String &msg) {
  if (!gConnected || gTx == nullptr) return;
  gTx->setValue((uint8_t *)msg.c_str(), msg.length());
  gTx->notify();
}

static void reply(const String &msg) {
  Serial.print("[回执] ");
  Serial.println(msg);
  bleNotify(msg);
}

// 去掉 \0 \r \n 及首尾空格，拆分 "消息||值"
static void parseCommand(String raw, String &msg, String &val) {
  int z = raw.indexOf('\0');
  if (z >= 0) raw = raw.substring(0, z);
  raw.replace("\r", "");
  raw.replace("\n", "");
  raw.trim();

  int sep = raw.indexOf("||");
  if (sep >= 0) {
    msg = raw.substring(0, sep);
    val = raw.substring(sep + 2);
  } else {
    msg = raw;
    val = "";
  }
  msg.trim();
  val.trim();
  msg.toLowerCase();
}

static void handleCommand(const String &raw, const char *source) {
  String msg, val;
  parseCommand(raw, msg, val);
  if (msg.length() == 0) return;

  Serial.printf("[%s] 指令: %s  值: %s\n", source, msg.c_str(), val.c_str());

  if (msg == "start" || msg == "on") {
    setRelay(true);
    reply("RELAY:ON");
  } else if (msg == "pause" || msg == "stop" || msg == "off") {
    setRelay(false);
    reply("RELAY:OFF");
  } else if (msg == "ping") {
    reply("PONG");
  } else if (msg == "status") {
    reply(gRelayOn ? "RELAY:ON" : "RELAY:OFF");
  } else {
    reply("ERR:UNKNOWN:" + msg);
  }
}

// ============================== BLE 回调 ==============================
// 注意: 回调运行在蓝牙协议栈任务中，只做最少的事情 (置标志/入队)，
//       打印和 IO 操作全部放到 loop() 中执行，避免栈溢出导致重启。
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    gConnected = true;
  }
  void onDisconnect(BLEServer *) override {
    gConnected = false;
    gNeedReAdvertise = true;
  }
};

class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = String(c->getValue().c_str());
    if (v.length() == 0 || gCmdQueue == nullptr) return;
    CmdMsg m;
    strncpy(m.text, v.c_str(), CMD_MAX_LEN - 1);
    m.text[CMD_MAX_LEN - 1] = '\0';
    xQueueSend(gCmdQueue, &m, 0);
  }
};

// ============================== 初始化 BLE ==============================
static void startBle() {
  BLEDevice::init(DEVICE_NAME);

  gServer = BLEDevice::createServer();
  gServer->setCallbacks(new ServerCB());

  BLEService *svc = gServer->createService(SERVICE_UUID);

  gTx = svc->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  gTx->addDescriptor(new BLE2902());

  BLECharacteristic *rx = svc->createCharacteristic(
      RX_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCB());

  svc->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);      // 设备名放到扫描响应包里
  adv->setMinPreferred(0x06);
  adv->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
}

// ============================== setup ==============================
void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 2000) delay(10);   // 等待原生 USB 枚举

  Serial.println();
  Serial.println("==========================================");
  Serial.println("  Momcozy TW03 - ESP32-S3 BLE 固件 v2.0");
  Serial.println("==========================================");

  // 保留芯片 Brownout 保护，不用软件屏蔽欠压复位。
  // 先等待 USB/电源稳定，再初始化外设。
  Serial.println("[BOOT] 串口已启动，等待电源稳定...");
  delay(1500);

  // 继电器第一时间置为断开，防止上电误动作
  Serial.printf("[BOOT] 初始化继电器 GPIO %d...\n", RELAY_PIN);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);
  delay(100);

  gCmdQueue = xQueueCreate(16, sizeof(CmdMsg));
  if (gCmdQueue == nullptr) {
    Serial.println("[错误] 创建命令队列失败，停止启动");
    while (true) delay(1000);
  }

  Serial.println("[BLE] 正在启动...");
  startBle();
  Serial.printf("[BLE] 广播中，设备名: %s\n", DEVICE_NAME);
  Serial.println("[提示] 在 Demo 右上角点击 📶 进行连接；串口可直接输入 start / pause 测试");
}

// ============================== loop ==============================
void loop() {
  static bool lastConnected = false;

  // 1) 连接状态变化
  if (gConnected != lastConnected) {
    lastConnected = gConnected;
    if (gConnected) {
      Serial.println("[BLE] ✅ 网页已连接");
    } else {
      Serial.println("[BLE] 🔌 网页已断开");
      // 安全策略：断开连接时自动关闭继电器，避免持续加热
      if (gRelayOn) {
        setRelay(false);
        Serial.println("[安全] 连接断开，继电器已自动关闭");
      }
    }
  }

  // 2) 断开后重新广播
  if (gNeedReAdvertise) {
    gNeedReAdvertise = false;
    delay(300);
    BLEDevice::startAdvertising();
    Serial.println("[BLE] 重新广播，等待连接...");
  }

  // 3) 处理蓝牙收到的指令
  CmdMsg m;
  while (gCmdQueue && xQueueReceive(gCmdQueue, &m, 0) == pdTRUE) {
    handleCommand(String(m.text), "BLE");
  }

  // 4) 处理 USB 串口指令 (以 \n 或 \0 结尾)
  static String serialBuf;
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\0') {
      if (serialBuf.length() > 0) handleCommand(serialBuf, "USB");
      serialBuf = "";
    } else if (serialBuf.length() < CMD_MAX_LEN) {
      serialBuf += ch;
    }
  }

  // 5) 心跳日志 (10 秒一次)
  static unsigned long lastBeat = 0;
  if (millis() - lastBeat > 10000) {
    lastBeat = millis();
    Serial.printf("[心跳] BLE:%s  继电器:%s  可用内存:%u B\n",
                  gConnected ? "已连接" : "广播中",
                  gRelayOn ? "开" : "关",
                  (unsigned)ESP.getFreeHeap());
  }

  delay(10);
}
