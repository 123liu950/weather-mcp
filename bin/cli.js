#!/usr/bin/env node

/**
 * Weather MCP Server CLI
 * 
 * Usage:
 *   weather-mcp          # STDIO mode (default)
 *   weather-mcp stdio    # STDIO mode
 *   weather-mcp sse      # SSE HTTP server mode
 */

const path = require('path');
const { spawn } = require('child_process');

// 获取命令行参数
const args = process.argv.slice(2);
const mode = args[0] || 'stdio';

// 验证模式
if (!['stdio', 'sse'].includes(mode)) {
  console.error(`
╔═══════════════════════════════════════════════════════╗
║           Weather MCP Server - CLI Help               ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Usage:                                               ║
║    weather-mcp [mode]                                 ║
║                                                       ║
║  Modes:                                               ║
║    stdio    STDIO transport (default)                 ║
║    sse      SSE HTTP server                           ║
║                                                       ║
║  Examples:                                            ║
║    weather-mcp                                        ║
║    weather-mcp stdio                                  ║
║    weather-mcp sse                                    ║
║                                                       ║
║  Environment Variables:                               ║
║    OPENWEATHER_API_KEY  Your OpenWeather API key      ║
║    PORT                 HTTP port for SSE (def: 3000) ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

// 获取 server.js 路径
const serverPath = path.join(__dirname, '..', 'index.js');

// 如果是 STDIO 模式，直接 require 执行
if (mode === 'stdio') {
  // STDIO 模式需要保持 stdin/stdout 干净
  process.argv = [process.argv[0], serverPath, 'stdio'];
  require(serverPath);
} else {
  // SSE 模式可以 spawn 子进程或直接运行
  process.argv = [process.argv[0], serverPath, 'sse'];
  require(serverPath);
}
