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

const liveConfigured = () => Boolean(process.env.ROBINHOOD_MCP_TOKEN);

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
    return res.end(html);
  }
  return json(res, { error: "not_found" }, 404);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log(`Sentinel Trader listening on ${port}`));
