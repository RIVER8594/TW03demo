#include <string.h>

// 定义结构体存储消息和值
struct MessageValue {
  String message;
  String value;
};

// 解析「消息||值」格式的函数
struct MessageValue getMessage(String inputtedStr) {
  struct MessageValue result;
  char charArr[50];
  inputtedStr.toCharArray(charArr, 50);
  
  // 按"||"分割字符串
  char* ptr = strtok(charArr, "||");
  result.message = (ptr != NULL) ? String(ptr) : "";
  
  ptr = strtok(NULL, "||");
  result.value = (ptr != NULL) ? String(ptr) : "";
  
  return result;
}

// 声明结构体实例
struct MessageValue receivedData;
const int relayPin = 2; // 继电器接D2引脚
const int ledPin = 3; // 继电器接D3引脚

void setup() {
  Serial.begin(9600);
  pinMode(relayPin, OUTPUT);
  pinMode(ledPin, OUTPUT);
  digitalWrite(relayPin, LOW); // 初始关闭
  digitalWrite(ledPin, LOW); // 初始关闭
  Serial.setTimeout(10); // 缩短串口读取等待时间
}

void loop() {
  // 读取ProtoPie发来的串口数据
  while (Serial.available() > 0) {
    String receivedString = Serial.readStringUntil('\0'); // 按\0分割（官方1.9.0+格式）
    receivedData = getMessage(receivedString); // 解析消息
    
    // 打印解析结果（调试用）
    Serial.print("收到消息: ");
    Serial.println(receivedData.message);
    Serial.print("收到值: ");
    Serial.println(receivedData.value);
    
    // 控制继电器
    if (receivedData.message == "start") {
      digitalWrite(relayPin, HIGH);
      //digitalWrite(ledPin, HIGH);
      Serial.println("继电器已开启");
    } else if (receivedData.message == "pause") {
      digitalWrite(relayPin, LOW);
      //digitalWrite(ledPin, LOW);
      Serial.println("继电器已关闭");
    }
  }
}