/**
 * Fake Brevo HTTP server for E2E tests.
 *
 * The emailsender microservice calls the Brevo REST API to send transactional
 * emails. In E2E tests we cannot hit the real Brevo SaaS (it would send real
 * emails to fake addresses and require a paid API key). This module starts a
 * real `http.createServer` on a random port (or `FAKE_BREVO_PORT` if set) that
 * mimics Brevo's `POST /smtp/email` success response.
 *
 * The emailsender reads its Brevo config (api_endpoint, api_key, from_email)
 * from the `emailsender.providers` table. The E2E global setup upserts a row
 * pointing `api_endpoint` at this fake server's URL before the test run starts.
 *
 * Pattern reused from `primebrick-us-v3/emailsender/test/helpers/fake-brevo-server.ts`
 * — a real TCP listener, not a vitest mock, so the full BrevoClient code path
 * (header construction, body serialization, response parsing) is exercised.
 */
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

export interface FakeBrevoServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
  /** All requests received by the server, in order. */
  receivedRequests: Array<{ headers: Record<string, string>; body: unknown }>;
}

/**
 * Start a fake Brevo HTTP server.
 *
 * @param fixedPort Optional fixed port (defaults to `FAKE_BREVO_PORT` env var,
 *                  or `0` for an OS-assigned random port). Prefer `0` in tests
 *                  to avoid port conflicts; the chosen port is written into
 *                  the `providers` row at runtime by the global setup.
 */
export async function startFakeBrevoServer(fixedPort?: number): Promise<FakeBrevoServer> {
  const requestedPort = fixedPort ?? Number(process.env.FAKE_BREVO_PORT ?? 0);
  const receivedRequests: Array<{ headers: Record<string, string>; body: unknown }> = [];

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      receivedRequests.push({
        headers: req.headers as Record<string, string>,
        body: body ? JSON.parse(body) : null,
      });

      // Mimic Brevo's success response shape.
      // Real Brevo returns { messageId: "..." } on 200.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ messageId: `fake-${randomUUID()}` }));
    });
  });

  return new Promise((resolve) => {
    server.listen(requestedPort, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        receivedRequests,
      });
    });
  });
}
