# Weather MCP Server 🌤️

A Model Context Protocol (MCP) server that provides weather data from OpenWeather API. Supports both **STDIO** and **SSE** transport modes.

[English](#english) | [中文](#中文)

---

## English

### Features

- 🌡️ **Real-time Weather** - Get current weather for any city
- 📅 **5-Day Forecast** - Get weather forecast up to 5 days
- 🌍 **Bilingual Support** - Works with English and Chinese city names
- 🔌 **Dual Transport** - Supports both STDIO and SSE modes
- 🔑 **Flexible Auth** - API key via URL, Header, or environment variable

### Installation

#### Option 1: NPX (Recommended for STDIO)

No installation needed! Just configure your MCP client:

```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["-y", "weather-mcp-server"],
      "env": {
        "OPENWEATHER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Option 2: Global Install

```bash
npm install -g weather-mcp-server
```

Then configure:

```json
{
  "mcpServers": {
    "weather": {
      "command": "weather-mcp",
      "env": {
        "OPENWEATHER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Option 3: SSE Mode (Remote Server)

If deployed to a server (e.g., Render, Railway):

```json
{
  "mcpServers": {
    "weather": {
      "transport": "sse",
      "url": "https://your-server.com/sse?key=your_api_key"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get-weather` | Get real-time weather for a city |
| `get-forecast` | Get 5-day weather forecast |

### Examples

Ask your AI assistant:

- "What's the weather in Tokyo?"
- "Get me the 5-day forecast for New York"
- "北京今天天气怎么样？"
- "上海未来三天天气预报"

### Self-Hosting (SSE Mode)

```bash
# Clone the repo
git clone https://github.com/your-username/weather-mcp-server
cd weather-mcp-server
npm install

# Start SSE server
npm run start:sse

# Or with custom port
PORT=8080 npm run start:sse
```

### API Key

Get your free API key from [OpenWeather](https://openweathermap.org/api).

---

## 中文

### 功能特点

- 🌡️ **实时天气** - 获取任意城市的当前天气
- 📅 **5天预报** - 获取最多5天的天气预报
- 🌍 **双语支持** - 支持中英文城市名
- 🔌 **双传输模式** - 同时支持 STDIO 和 SSE 模式
- 🔑 **灵活认证** - 支持 URL、Header 或环境变量传递 API Key

### 安装使用

#### 方式1: NPX 直接运行（推荐）

无需安装，直接配置 MCP 客户端：

```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["-y", "weather-mcp-server"],
      "env": {
        "OPENWEATHER_API_KEY": "你的API密钥"
      }
    }
  }
}
```

#### 方式2: 全局安装

```bash
npm install -g weather-mcp-server
```

然后配置：

```json
{
  "mcpServers": {
    "weather": {
      "command": "weather-mcp",
      "env": {
        "OPENWEATHER_API_KEY": "你的API密钥"
      }
    }
  }
}
```

#### 方式3: SSE 远程服务

如果已部署到服务器：

```json
{
  "mcpServers": {
    "weather": {
      "transport": "sse",
      "url": "https://your-server.com/sse?key=你的API密钥"
    }
  }
}
```

### 可用工具

| 工具 | 描述 |
|------|------|
| `get-weather` | 获取城市实时天气 |
| `get-forecast` | 获取5天天气预报 |

### 使用示例

向 AI 助手提问：

- "东京现在天气怎么样？"
- "帮我查一下纽约未来5天的天气"
- "北京今天热不热？"
- "深圳明天会下雨吗？"

### 获取 API Key

前往 [OpenWeather](https://openweathermap.org/api) 免费注册获取。

---

## License

MIT © Grande350
