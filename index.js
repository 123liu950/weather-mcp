const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  SSEServerTransport,
} = require("@modelcontextprotocol/sdk/server/sse.js");
const { z } = require("zod");
const axios = require("axios");
const express = require("express");

const API_KEY =
  process.env.OPENWEATHER_API_KEY || "";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "http://api.openweathermap.org/geo/1.0/direct"; // 地理编码接口

const server = new McpServer({
  name: "universal-weather-server",
  version: "1.2.0",
});

// 辅助函数：根据城市名获取经纬度
async function getCoordinates(city) {
  try {
    console.error(`[Geo] 正在查找坐标: ${city}`);
    const response = await axios.get(GEO_URL, {
      params: { q: city, limit: 1, appid: API_KEY },
    });

    if (response.data && response.data.length > 0) {
      return {
        lat: response.data[0].lat,
        lon: response.data[0].lon,
        name: response.data[0].local_names?.zh || response.data[0].name,
      };
    }
    return null;
  } catch (error) {
    console.error(`[Geo Error] ${error.message}`);
    return null;
  }
}

server.tool(
  "get-weather",
  "获取指定城市的实时天气 (完美支持中文名)",
  { city: z.string().describe("城市名，如：天津、北京、London") },
  async ({ city }) => {
    // 步骤 1: 获取经纬度
    const coords = await getCoordinates(city);
    if (!coords) {
      return {
        isError: true,
        content: [{ type: "text", text: `找不到城市 "${city}"，请检查拼写。` }],
      };
    }

    // 步骤 2: 用经纬度获取天气
    try {
      console.error(`[Weather] 正在获取坐标天气: ${coords.lat}, ${coords.lon}`);
      const response = await axios.get(`${BASE_URL}/weather`, {
        params: {
          lat: coords.lat,
          lon: coords.lon,
          appid: API_KEY,
          units: "metric",
          lang: "zh_cn",
        },
      });

      const d = response.data;
      const resultText = `【${coords.name}】当前天气：${d.weather[0].description}，温度：${d.main.temp}°C，湿度：${d.main.humidity}%。`;

      return { content: [{ type: "text", text: resultText }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `天气获取失败: ${error.message}` }],
      };
    }
  }
);

async function main() {
  const mode = process.argv[2] || "stdio";
  if (mode === "sse") {
    const app = express();
    let transport;
    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      await server.connect(transport);
    });
    app.post("/messages", async (req, res) => {
      if (transport) await transport.handlePostMessage(req, res);
    });
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.error(`SSE Server running on port ${PORT}`));
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Stdio Server running...");
  }
}

main().catch(console.error);
