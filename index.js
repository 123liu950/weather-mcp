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
const cors = require("cors");
const { AsyncLocalStorage } = require("node:async_hooks");

// ============ 配置 ============
const storage = new AsyncLocalStorage();
const DEFAULT_API_KEY = process.env.OPENWEATHER_API_KEY || "";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "http://api.openweathermap.org/geo/1.0/direct";

// Session 存储
const sessions = new Map();

// ============ 辅助函数 ============
function getEffectiveKey() {
  const context = storage.getStore();
  return context?.key || DEFAULT_API_KEY;
}

// 双语工具描述，提升多模型兼容性
const TOOL_DESCRIPTIONS = {
  "get-weather": {
    description:
      "Get real-time weather for a specified city / 获取指定城市的实时天气",
    cityParam:
      "City name, e.g.: Beijing, Tokyo, London / 城市名，如：北京、东京、伦敦",
  },
  "get-forecast": {
    description: "Get 5-day weather forecast for a city / 获取城市5天天气预报",
    cityParam: "City name / 城市名",
  },
};

// ============ 创建 MCP Server ============
function createServer() {
  const server = new McpServer({
    name: "weather-mcp-server",
    version: "2.0.0",
  });

  // 工具 1: 获取当前天气
  server.tool(
    "get-weather",
    TOOL_DESCRIPTIONS["get-weather"].description,
    {
      city: z.string().describe(TOOL_DESCRIPTIONS["get-weather"].cityParam),
    },
    async ({ city }) => {
      const apiKey = getEffectiveKey();
      console.error(
        `[Tool] get-weather | City: ${city} | Key: ${apiKey.substring(0, 6)}***`
      );

      try {
        // 地理编码
        const geoRes = await axios.get(GEO_URL, {
          params: { q: city, limit: 1, appid: apiKey },
          timeout: 10000,
        });

        if (!geoRes.data?.length) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `City not found: "${city}" / 找不到城市: "${city}"`,
              },
            ],
          };
        }

        const { lat, lon, name, local_names, country } = geoRes.data[0];

        // 获取天气
        const weatherRes = await axios.get(`${BASE_URL}/weather`, {
          params: { lat, lon, appid: apiKey, units: "metric", lang: "zh_cn" },
          timeout: 10000,
        });

        const d = weatherRes.data;
        const displayName = local_names?.zh || local_names?.en || name;

        // 返回结构化的双语结果
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  location: { name: displayName, country, lat, lon },
                  weather: {
                    description: d.weather[0].description,
                    temperature: { value: d.main.temp, unit: "°C" },
                    feels_like: { value: d.main.feels_like, unit: "°C" },
                    humidity: { value: d.main.humidity, unit: "%" },
                    wind: { speed: d.wind.speed, unit: "m/s" },
                    pressure: { value: d.main.pressure, unit: "hPa" },
                  },
                  summary: `${displayName} (${country}): ${d.weather[0].description}, ${d.main.temp}°C, Humidity ${d.main.humidity}%`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errMsg = error.response?.data?.message || error.message;
        return {
          isError: true,
          content: [
            { type: "text", text: `Query failed / 查询失败: ${errMsg}` },
          ],
        };
      }
    }
  );

  // 工具 2: 获取天气预报
  server.tool(
    "get-forecast",
    TOOL_DESCRIPTIONS["get-forecast"].description,
    {
      city: z.string().describe(TOOL_DESCRIPTIONS["get-forecast"].cityParam),
      days: z
        .number()
        .min(1)
        .max(5)
        .default(3)
        .optional()
        .describe("Number of days (1-5) / 天数 (1-5)"),
    },
    async ({ city, days = 3 }) => {
      const apiKey = getEffectiveKey();
      console.error(`[Tool] get-forecast | City: ${city} | Days: ${days}`);

      try {
        const geoRes = await axios.get(GEO_URL, {
          params: { q: city, limit: 1, appid: apiKey },
          timeout: 10000,
        });

        if (!geoRes.data?.length) {
          return {
            isError: true,
            content: [{ type: "text", text: `City not found: "${city}"` }],
          };
        }

        const { lat, lon, name, local_names, country } = geoRes.data[0];

        const forecastRes = await axios.get(`${BASE_URL}/forecast`, {
          params: {
            lat,
            lon,
            appid: apiKey,
            units: "metric",
            lang: "zh_cn",
            cnt: days * 8,
          },
          timeout: 10000,
        });

        const displayName = local_names?.zh || name;
        const dailyForecasts = [];
        const seenDates = new Set();

        for (const item of forecastRes.data.list) {
          const date = item.dt_txt.split(" ")[0];
          if (!seenDates.has(date) && seenDates.size < days) {
            seenDates.add(date);
            dailyForecasts.push({
              date,
              weather: item.weather[0].description,
              temp_max: item.main.temp_max,
              temp_min: item.main.temp_min,
              humidity: item.main.humidity,
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  location: { name: displayName, country },
                  forecast: dailyForecasts,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Forecast query failed: ${error.message}` },
          ],
        };
      }
    }
  );

  return server;
}

// ============ Express 中间件 ============
function setupMiddleware(app) {
  // CORS - 支持所有来源（生产环境应该限制）
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "Mcp-Session-Id",
      ],
      exposedHeaders: ["Mcp-Session-Id"],
    })
  );

  // JSON 解析
  app.use(express.json());

  // 请求日志
  app.use((req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// 从请求中提取 API Key（支持多种方式）
function extractApiKey(req) {
  // 优先级: Header > Query > Default
  return (
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.key ||
    null
  );
}

// ============ 主启动逻辑 ============
async function main() {
  const mode = process.argv[2] || "stdio";

  if (mode === "sse") {
    const app = express();
    setupMiddleware(app);

    // -------- 健康检查 --------
    app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        version: "2.0.0",
        transport: "SSE",
        activeSessions: sessions.size,
        uptime: process.uptime(),
      });
    });

    // -------- 工具发现端点（非 MCP 标准，但便于调试）--------
    app.get("/tools", (req, res) => {
      res.json({
        tools: [
          {
            name: "get-weather",
            description: TOOL_DESCRIPTIONS["get-weather"].description,
            parameters: { city: "string (required)" },
          },
          {
            name: "get-forecast",
            description: TOOL_DESCRIPTIONS["get-forecast"].description,
            parameters: {
              city: "string (required)",
              days: "number (1-5, optional)",
            },
          },
        ],
        usage: {
          sse_endpoint: "/sse",
          with_custom_key: "/sse?key=YOUR_KEY",
          header_auth: "X-API-Key: YOUR_KEY",
        },
      });
    });

    // -------- SSE 连接端点 --------
    app.get("/sse", async (req, res) => {
      const userKey = extractApiKey(req);

      console.error(
        `[SSE] New connection | Key: ${userKey ? "Custom" : "Default"}`
      );

      // 创建 transport
      const transport = new SSEServerTransport("/messages", res);

      // 存储 session
      sessions.set(transport.sessionId, {
        transport,
        key: userKey,
        createdAt: new Date(),
        lastActivity: new Date(),
      });

      console.error(`[SSE] Session created: ${transport.sessionId}`);

      // 连接关闭时清理
      res.on("close", () => {
        sessions.delete(transport.sessionId);
        console.error(`[SSE] Session closed: ${transport.sessionId}`);
      });

      // 创建独立 server 实例
      const server = createServer();
      await server.connect(transport);
    });

    // -------- 消息处理端点 --------
    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId;

      if (!sessionId) {
        return res.status(400).json({
          error: "Missing sessionId",
          hint: "SessionId should be provided as query parameter",
        });
      }

      const session = sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({
          error: "Session not found",
          hint: "Session may have expired. Please reconnect to /sse",
        });
      }

      // 更新最后活动时间
      session.lastActivity = new Date();

      // 支持在 POST 请求中覆盖 Key
      const requestKey = extractApiKey(req);
      const effectiveKey = requestKey || session.key;

      try {
        await storage.run({ key: effectiveKey }, async () => {
          await session.transport.handlePostMessage(req, res);
        });
      } catch (error) {
        console.error(`[SSE] Message handling error: ${error.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    });

    // -------- Session 清理（可选：定期清理过期 session）--------
    setInterval(() => {
      const now = Date.now();
      const timeout = 30 * 60 * 1000; // 30 分钟

      for (const [id, session] of sessions) {
        if (now - session.lastActivity.getTime() > timeout) {
          sessions.delete(id);
          console.error(`[Cleanup] Expired session removed: ${id}`);
        }
      }
    }, 5 * 60 * 1000); // 每 5 分钟检查

    // -------- 启动服务器 --------
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.error(`
╔═══════════════════════════════════════════════════════╗
║           Weather MCP Server v2.0.0                   ║
╠═══════════════════════════════════════════════════════╣
║  Transport: SSE                                       ║
║  Port: ${PORT}                                            ║
╠═══════════════════════════════════════════════════════╣
║  Endpoints:                                           ║
║    GET  /health     - Health check                    ║
║    GET  /tools      - List available tools            ║
║    GET  /sse        - SSE connection                  ║
║    POST /messages   - Message handler                 ║
╠═══════════════════════════════════════════════════════╣
║  Authentication (optional):                           ║
║    Query:  /sse?key=YOUR_API_KEY                      ║
║    Header: X-API-Key: YOUR_API_KEY                    ║
║    Header: Authorization: Bearer YOUR_API_KEY         ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } else {
    // -------- STDIO 模式 --------
    console.error("[STDIO] Starting in STDIO mode...");
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[STDIO] MCP Server connected");
  }
}

main().catch((error) => {
  console.error("[Fatal] Startup failed:", error);
  process.exit(1);
});
