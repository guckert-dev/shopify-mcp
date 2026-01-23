import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Landing page HTML
const landingPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shopify MCP Server</title>
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #95BF47 0%, #5E8E3E 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 24px;
      padding: 48px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      text-align: center;
    }
    .logo {
      width: 80px;
      height: 80px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 2.5rem;
      color: #1a1a1a;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      background: #95BF47;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 24px;
    }
    p {
      color: #666;
      font-size: 1.125rem;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 12px;
    }
    .stat-number {
      font-size: 1.75rem;
      font-weight: 700;
      color: #95BF47;
    }
    .stat-label {
      font-size: 0.875rem;
      color: #666;
    }
    .categories {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 32px;
    }
    .category {
      background: #f0f7e6;
      color: #5E8E3E;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #1a1a1a;
      color: white;
    }
    .btn-primary:hover {
      background: #333;
      transform: translateY(-2px);
    }
    .btn-secondary {
      background: #f0f7e6;
      color: #5E8E3E;
    }
    .btn-secondary:hover {
      background: #e0efcc;
      transform: translateY(-2px);
    }
    .install-code {
      background: #1a1a1a;
      color: #95BF47;
      padding: 16px 24px;
      border-radius: 12px;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 0.875rem;
      margin-top: 32px;
      overflow-x: auto;
    }
    .footer {
      margin-top: 32px;
      color: #999;
      font-size: 0.875rem;
    }
    .footer a {
      color: #5E8E3E;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="logo" viewBox="0 0 109.5 124.5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M95.9 23.9c-.1-.6-.6-1-1.1-1-.5 0-9.3-.2-9.3-.2s-7.4-7.2-8.1-7.9c-.8-.8-2.2-.5-2.8-.4-.1 0-1.5.5-4 1.2-2.4-6.8-6.5-13.1-13.9-13.1h-.6C53.8.3 51.2 0 49 0 28.4 0 18.5 16.1 15.3 24.3c-4.5 1.4-7.7 2.4-8.1 2.5C4.1 27.6 4 27.7 3.8 30.5c-.1 2.1-7.7 59.1-7.7 59.1l71.6 13.4 38.8-8.4S96 24.5 95.9 23.9zM67.2 16.8l-6.4 2c0-1.6 0-3.5-.1-5.6 4 .6 6.6 2 6.5 3.6zm-10.5-3.2c.1 3.7.1 8-.1 9.6l-13.2 4.1c1.3-5 4.4-10.2 8.3-12.8 1.9-1.3 3.7-1.6 5-.9zm-5.4-8.8c.8 0 1.5.1 2.2.4-5 2.4-10.3 8.4-12.6 17.6l-10.5 3.3C33.3 16.9 40.5 4.8 51.3 4.8z" fill="#95BF47"/>
      <path d="M94.8 22.9c-.5 0-9.3-.2-9.3-.2s-7.4-7.2-8.1-7.9c-.3-.3-.6-.4-1-.5l-5.4 109.8 38.8-8.4S96 24.5 95.9 23.9c-.1-.6-.6-1-1.1-1z" fill="#5E8E3E"/>
      <path d="M58.4 43.2L54 57.2s-4.2-1.8-9.2-1.4c-7.3.5-7.4 5.1-7.3 6.2.4 6.5 17.5 7.9 18.5 23.1.7 12-6.4 20.2-16.6 20.9-12.3.8-19-6.5-19-6.5l2.6-11s6.7 5.1 12.1 4.7c3.5-.2 4.8-3.1 4.7-5.1-.5-8.4-14.5-7.9-15.4-21.9-.8-11.8 7-23.8 24.1-24.9 6.7-.4 10-1.1 10-1.1z" fill="#fff"/>
    </svg>
    <h1>Shopify</h1>
    <span class="badge">MCP Server</span>
    <p>Connect Claude to your Shopify store. Manage orders, products, customers, inventory, marketing, and more with powerful AI-assisted tools.</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-number">70</div>
        <div class="stat-label">Tools</div>
      </div>
      <div class="stat">
        <div class="stat-number">19</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat">
        <div class="stat-number">v1.0</div>
        <div class="stat-label">Version</div>
      </div>
    </div>

    <div class="categories">
      <span class="category">Orders</span>
      <span class="category">Products</span>
      <span class="category">Customers</span>
      <span class="category">Inventory</span>
      <span class="category">Fulfillments</span>
      <span class="category">Discounts</span>
      <span class="category">Marketing</span>
      <span class="category">Analytics</span>
    </div>

    <div class="buttons">
      <a href="https://github.com/guckert-dev/shopify-mcp-server" class="btn btn-primary">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.42-1.305.762-1.604-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/></svg>
        GitHub
      </a>
      <a href="/.well-known/mcp.json" class="btn btn-secondary">
        MCP Manifest
      </a>
    </div>

    <div class="install-code">
      npx @anthropic-ai/claude-code mcp add github:guckert-dev/shopify-mcp-server
    </div>

    <div class="footer">
      Published by <a href="https://lemay.app">Lemay</a>
    </div>
  </div>
</body>
</html>`;

// MCP Manifest
const mcpManifest = {
  name: "Shopify",
  description: "Connect Claude to your Shopify store. Manage orders, products, customers, inventory, marketing, and more with 70 powerful tools.",
  version: "1.0.0",
  icon: "https://mcp.lemay.app/icon.svg",
  homepage: "https://mcp.lemay.app",
  documentation: "https://mcp.lemay.app/docs",
  endpoints: {
    mcp: "https://mcp.lemay.app/mcp"
  },
  auth: {
    type: "oauth2",
    authorization_url: "https://mcp.lemay.app/auth/shopify",
    token_url: "https://mcp.lemay.app/auth/token",
    scopes: [
      "read_orders",
      "write_orders",
      "read_products",
      "write_products",
      "read_customers",
      "write_customers",
      "read_inventory",
      "write_inventory"
    ]
  },
  capabilities: {
    tools: 70,
    categories: [
      "Orders",
      "Products",
      "Customers",
      "Inventory",
      "Fulfillments",
      "Discounts",
      "Marketing",
      "Analytics"
    ]
  },
  publisher: {
    name: "Lemay",
    url: "https://lemay.app",
    email: "travis.unitedstates@gmail.com"
  }
};

// Shopify icon SVG
const iconSvg = `<svg viewBox="0 0 109.5 124.5" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M95.9 23.9c-.1-.6-.6-1-1.1-1-.5 0-9.3-.2-9.3-.2s-7.4-7.2-8.1-7.9c-.8-.8-2.2-.5-2.8-.4-.1 0-1.5.5-4 1.2-2.4-6.8-6.5-13.1-13.9-13.1h-.6C53.8.3 51.2 0 49 0 28.4 0 18.5 16.1 15.3 24.3c-4.5 1.4-7.7 2.4-8.1 2.5C4.1 27.6 4 27.7 3.8 30.5c-.1 2.1-7.7 59.1-7.7 59.1l71.6 13.4 38.8-8.4S96 24.5 95.9 23.9zM67.2 16.8l-6.4 2c0-1.6 0-3.5-.1-5.6 4 .6 6.6 2 6.5 3.6zm-10.5-3.2c.1 3.7.1 8-.1 9.6l-13.2 4.1c1.3-5 4.4-10.2 8.3-12.8 1.9-1.3 3.7-1.6 5-.9zm-5.4-8.8c.8 0 1.5.1 2.2.4-5 2.4-10.3 8.4-12.6 17.6l-10.5 3.3C33.3 16.9 40.5 4.8 51.3 4.8z" fill="#95BF47"/>
  <path d="M94.8 22.9c-.5 0-9.3-.2-9.3-.2s-7.4-7.2-8.1-7.9c-.3-.3-.6-.4-1-.5l-5.4 109.8 38.8-8.4S96 24.5 95.9 23.9c-.1-.6-.6-1-1.1-1z" fill="#5E8E3E"/>
  <path d="M58.4 43.2L54 57.2s-4.2-1.8-9.2-1.4c-7.3.5-7.4 5.1-7.3 6.2.4 6.5 17.5 7.9 18.5 23.1.7 12-6.4 20.2-16.6 20.9-12.3.8-19-6.5-19-6.5l2.6-11s6.7 5.1 12.1 4.7c3.5-.2 4.8-3.1 4.7-5.1-.5-8.4-14.5-7.9-15.4-21.9-.8-11.8 7-23.8 24.1-24.9 6.7-.4 10-1.1 10-1.1z" fill="#fff"/>
</svg>`;

export default function handler(req, res) {
  const { url } = req;
  const pathname = new URL(url, `http://${req.headers.host}`).pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Route handling
  if (pathname === '/.well-known/mcp.json') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(mcpManifest);
  }

  if (pathname === '/icon.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(200).send(iconSvg);
  }

  if (pathname === '/mcp' || pathname === '/mcp/') {
    // MCP endpoint - return info about the server
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      name: "Shopify MCP Server",
      version: "1.0.0",
      status: "available",
      message: "This MCP server is designed for Claude Desktop integration. Install via: npx @anthropic-ai/claude-code mcp add github:guckert-dev/shopify-mcp-server",
      github: "https://github.com/guckert-dev/shopify-mcp-server",
      tools: 70
    });
  }

  // Default: return landing page
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(landingPage);
}
