const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  SSEServerTransport,
} = require("@modelcontextprotocol/sdk/server/sse.js");
const { z } = require("zod");
const axios = require("axios");
const http = require("http");
const url = require("url");

// ============ 配置 ============
const DEFAULT_API_KEY =
  process.env.OPENWEATHER_API_KEY || "";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "https://api.openweathermap.org/geo/1.0/direct";

// Session 存储
const sessions = new Map();

// ============ 创建 MCP Server ============
function createServer(apiKeyGetter) {
  const server = new McpServer({
    name: "weather-mcp-server",
    version: "2.3.0",
  });

  // 工具: 获取当前天气
  server.tool(
    "get-weather",
    "Get real-time weather for a city / 获取城市实时天气",
    { city: z.string().describe("City name, e.g.: Beijing, London / 城市名") },
    async ({ city }) => {
      const apiKey = apiKeyGetter();
      console.error(`[Tool] get-weather | City: ${city}`);

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

        const weatherRes = await axios.get(`${BASE_URL}/weather`, {
          params: { lat, lon, appid: apiKey, units: "metric", lang: "zh_cn" },
          timeout: 10000,
        });

        const d = weatherRes.data;
        const displayName = local_names?.zh || local_names?.en || name;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  location: { name: displayName, country, lat, lon },
                  weather: {
                    description: d.weather[0].description,
                    temperature: `${d.main.temp}°C`,
                    feels_like: `${d.main.feels_like}°C`,
                    humidity: `${d.main.humidity}%`,
                    wind_speed: `${d.wind.speed} m/s`,
                  },
                  summary: `${displayName}: ${d.weather[0].description}, ${d.main.temp}°C`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        console.error(`[Error] get-weather:`, error.message);
        return {
          isError: true,
          content: [{ type: "text", text: `Query failed: ${error.message}` }],
        };
      }
    }
  );

  // 工具: 获取天气预报
  server.tool(
    "get-forecast",
    "Get 5-day weather forecast / 获取5天天气预报",
    {
      city: z.string().describe("City name / 城市名"),
      days: z.number().min(1).max(5).default(3).optional(),
    },
    async ({ city, days = 3 }) => {
      const apiKey = apiKeyGetter();
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
        console.error(`[Error] get-forecast:`, error.message);
        return {
          isError: true,
          content: [
            { type: "text", text: `Forecast failed: ${error.message}` },
          ],
        };
      }
    }
  );

  return server;
}

// ============ 辅助函数 ============
function extractApiKey(req) {
  const parsedUrl = url.parse(req.url, true);
  return (
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    parsedUrl.query.key ||
    null
  );
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, Mcp-Session-Id"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ============ 主启动逻辑 ============
async function main() {
  const mode = process.argv[2] || "stdio";

  if (mode === "sse") {
    // 使用原生 http 模块，避免 Express 中间件问题
    const server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;

      console.error(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

      // 设置 CORS
      setCorsHeaders(res);

      // 处理 OPTIONS 预检请求
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // -------- 健康检查 --------
      if (pathname === "/health" && req.method === "GET") {
        return sendJson(res, 200, {
          status: "ok",
          version: "2.3.0",
          transport: "SSE (native http)",
          activeSessions: sessions.size,
          uptime: process.uptime(),
        });
      }

      // -------- 调试端点 --------
      if (pathname === "/debug" && req.method === "GET") {
        const sessionsInfo = [];
        for (const [id, session] of sessions) {
          sessionsInfo.push({
            id,
            apiKeyPrefix: session.apiKey?.substring(0, 6) + "***",
            createdAt: session.createdAt,
          });
        }
        return sendJson(res, 200, {
          activeSessions: sessions.size,
          sessions: sessionsInfo,
        });
      }

      // -------- 工具列表 --------
      if (pathname === "/tools" && req.method === "GET") {
        return sendJson(res, 200, {
          tools: ["get-weather", "get-forecast"],
          usage: "Connect via SSE at /sse",
        });
      }

      // -------- API 测试 --------
      if (pathname === "/test-api" && req.method === "GET") {
        const apiKey = extractApiKey(req) || DEFAULT_API_KEY;
        try {
          const geoRes = await axios.get(GEO_URL, {
            params: { q: "London", limit: 1, appid: apiKey },
            timeout: 10000,
          });
          return sendJson(res, 200, {
            status: "ok",
            keyUsed: apiKey.substring(0, 6) + "***",
            found: geoRes.data?.length > 0,
          });
        } catch (error) {
          return sendJson(res, 500, {
            status: "error",
            error: error.response?.data || error.message,
          });
        }
      }

      // -------- SSE 连接端点 --------
      if (pathname === "/sse" && req.method === "GET") {
        const userKey = extractApiKey(req);
        const effectiveKey = userKey || DEFAULT_API_KEY;

        console.error(
          `[SSE] New connection | Key: ${effectiveKey.substring(0, 6)}***`
        );

        // 创建 transport
        const transport = new SSEServerTransport("/messages", res);
        const sessionId = transport.sessionId;

        // 创建 server
        const mcpServer = createServer(() => {
          return sessions.get(sessionId)?.apiKey || DEFAULT_API_KEY;
        });

        // 存储 session
        sessions.set(sessionId, {
          transport,
          server: mcpServer,
          apiKey: effectiveKey,
          createdAt: new Date(),
        });

        console.error(`[SSE] Session created: ${sessionId}`);

        // 监听连接关闭
        res.on("close", () => {
          sessions.delete(sessionId);
          console.error(`[SSE] Session closed: ${sessionId}`);
        });

        // 连接
        await mcpServer.connect(transport);
        return;
      }

      // -------- 消息处理端点 --------
      if (pathname === "/messages" && req.method === "POST") {
        const sessionId = parsedUrl.query.sessionId;
        console.error(`[Messages] POST | sessionId: ${sessionId}`);

        if (!sessionId) {
          return sendJson(res, 400, { error: "Missing sessionId" });
        }

        const session = sessions.get(sessionId);
        if (!session) {
          console.error(
            `[Messages] Session not found. Active: ${Array.from(
              sessions.keys()
            ).join(", ")}`
          );
          return sendJson(res, 404, { error: "Session not found" });
        }

        try {
          // 关键：直接传递原始 req, res，不做任何预处理
          await session.transport.handlePostMessage(req, res);
        } catch (error) {
          console.error(`[Messages] Error: ${error.message}`);
          if (!res.writableEnded) {
            sendJson(res, 500, { error: error.message });
          }
        }
        return;
      }

      // -------- 404 --------
      sendJson(res, 404, { error: "Not found" });
    });

    // Session 清理定时器
    setInterval(() => {
      const now = Date.now();
      const timeout = 30 * 60 * 1000;
      for (const [id, session] of sessions) {
        if (now - session.createdAt.getTime() > timeout) {
          sessions.delete(id);
          console.error(`[Cleanup] Expired session: ${id}`);
        }
      }
    }, 5 * 60 * 1000);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.error(`
╔═══════════════════════════════════════════════════════╗
║           Weather MCP Server v2.3.0                   ║
╠═══════════════════════════════════════════════════════╣
║  Transport: SSE (native http - no Express)            ║
║  Port: ${PORT}                                            ║
╠═══════════════════════════════════════════════════════╣
║  Endpoints:                                           ║
║    GET  /health     - Health check                    ║
║    GET  /debug      - Debug info                      ║
║    GET  /test-api   - Test API key                    ║
║    GET  /tools      - List tools                      ║
║    GET  /sse        - SSE connection                  ║
║    POST /messages   - Message handler                 ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } else {
    // STDIO 模式
    console.error("[STDIO] Starting...");
    const server = createServer(() => DEFAULT_API_KEY);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[STDIO] Connected");
  }
}

main().catch((error) => {
  console.error("[Fatal]", error);
  process.exit(1);
});
