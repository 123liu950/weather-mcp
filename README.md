# Weather MCP Server

这是一个基于 Model Context Protocol (MCP) 的天气查询服务器实现，使用 OpenWeatherMap API 提供实时天气信息。

## 功能

这个 MCP 服务器提供了以下功能：

- **获取天气工具**: 查询指定城市的当前实时天气信息

## 安装

首先，确保您已安装 Node.js (v14 或更高版本)。

安装依赖：

```bash
npm install
```

## 配置

在使用之前，您需要配置 OpenWeatherMap API 密钥：

1. 访问 [OpenWeatherMap](https://openweathermap.org/api) 注册账号并获取 API 密钥
2. 在 Trae 的配置面板中设置环境变量 `OPENWEATHER_API_KEY`，值为您的 API 密钥
3. 如果未设置环境变量，将使用默认的 API 密钥（可能不可用）

## 运行

启动服务器：

```bash
npm start
```

## 开发模式

如果您想在开发模式下运行（自动重启）：

```bash
npm run dev
```

## 使用

此 MCP 服务器通过 stdio 与客户端通信，当运行 `npm start` 后，服务器将等待来自 MCP 客户端的请求。

## 工具详情

**get-weather**: 获取指定城市的当前天气
- 参数: `city` - 城市名称（如：北京, Shanghai, 杭州）
- 返回信息包括：
  - 城市名称
  - 当前温度（摄氏度）
  - 体感温度
  - 天气描述
  - 湿度百分比

## API 说明

本服务器使用 OpenWeatherMap 的 Current Weather Data API：
- 基础 URL: `https://api.openweathermap.org/data/2.5`
- 数据单位: 公制（metric）
- 语言: 中文（zh_cn）

## 协议

遵循 Model Context Protocol 规范，使用 stdio 作为传输层。
