import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "dist", "index.html"), "utf8");
const proposals = new Map();

const json = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

// A token's presence is not proof of an authenticated broker connection.
// No live adapter or owner authentication has been implemented in this version.
const liveConfigured = () => false;

const riskGate = (body) => {
  const accountValue = Number(body.accountValue || 0);
  const notional = Number(body.notional || 0);
  const checks = [
    [accountValue > 0, "account_value_required"],
    [notional <= accountValue * 0.08, "position_limit_exceeded"],
    [body.dailyLossUsed !== true, "daily_loss_limit_reached"],
    [Number(body.tradesToday || 0) < 4, "daily_trade_limit_reached"],
    [body.mode !== "autonomous", "autonomous_mode_disabled"],
    [/^[A-Z.]{1,8}$/.test(String(body.symbol || "")), "invalid_symbol"]
  ];
  const failed = checks.find(([, reason]) => !checks.find(([ok, r]) => r === reason)?.[0]);
  return failed ? { allowed: false, reason: failed[1] } : { allowed: true, reason: "all_server_checks_passed" };
};

const state = () => ({
  connected: liveConfigured(),
  mode: "approval",
  account: liveConfigured() ? "Robinhood Agentic" : null,
  portfolio: liveConfigured() ? { total_value: null, buying_power: null } : null,
  message: liveConfigured()
    ? "Server credential present; broker adapter health check is required before live reads."
    : "The Hostinger server is running, but its Robinhood Trading MCP credential is not configured. No live data or orders are available."
});

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  // Until owner authentication, durable audit and the broker adapter exist,
  // reject every account and mutation route, independently of client inputs.
  const requestPath = (req.url || '/').split('?')[0];
  if (requestPath.startsWith('/api/') && requestPath !== '/api/health') {
    return json(res, {
      error: 'setup_incomplete',
      message: 'Owner authentication, persistent audit storage and the official Robinhood server adapter are not implemented yet. Account access and trading are disabled.',
      connected: false,
      orderSubmitted: false
    }, 503);
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, { ok: true, service: "sentinel-trader-2", liveConfigured: liveConfigured() });
  if (req.method === "GET" && url.pathname === "/api/state") return json(res, state(), liveConfigured() ? 200 : 503);
  if (req.method === "GET" && url.pathname === "/api/positions") return json(res, { positions: [], live: false, message: state().message }, liveConfigured() ? 200 : 503);
  if (req.method === "GET" && url.pathname === "/api/orders") return json(res, { orders: [], live: false, message: state().message }, liveConfigured() ? 200 : 503);
  if (req.method === "POST" && url.pathname === "/api/proposals") {
    const body = await readBody(req);
    const gate = riskGate(body);
    const proposal = { id: randomUUID(), status: gate.allowed ? "pending_approval" : "blocked", createdAt: new Date().toISOString(), gate, body };
    proposals.set(proposal.id, proposal);
    return json(res, proposal, gate.allowed ? 201 : 422);
  }
  const approve = url.pathname.match(/^\/api\/proposals\/([^/]+)\/approve$/);
  if (req.method === "POST" && approve) {
    const proposal = proposals.get(approve[1]);
    if (!proposal || proposal.status !== "pending_approval") return json(res, { error: "proposal_not_approvable" }, 404);
    proposal.status = "approved_pending_broker_review";
    proposal.approvedAt = new Date().toISOString();
    return json(res, { ...proposal, next: "broker_review_required", orderSubmitted: false });
  }
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sentinel Trader 2.0 — Setup required</title><style>body{font:17px/1.7 system-ui;background:#0b1422;color:#e7eef9;margin:0;padding:8vw}main{max-width:760px;margin:auto}h1{font-size:36px}p{color:#a9bbd1}a{color:#90e2c3}.card{padding:28px;border:1px solid #314057;border-radius:18px;background:#142135}</style></head><body><main><h1>Sentinel Trader 2.0</h1><section class="card"><h2>Private workspace setup in progress</h2><p>The Node server is running. Owner sign-in, durable audit storage and the official Robinhood connection still need implementation. No live account data is available.</p><p>All account and trading API routes are blocked on the server. No trades can be submitted.</p><p>Deployment source: GitHub / Sentinel-Trader-2.0 / main.</p><a href="https://robinhood.com/us/en/support/articles/agentic-trading/" rel="noreferrer">Official Robinhood setup information</a></section><p>Runtime: Sentinel 2.0 safety lock</p></main></body></html>');
  }
  return json(res, { error: "not_found" }, 404);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log(`Sentinel Trader listening on ${port}`));
