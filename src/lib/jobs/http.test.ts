import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), upsert: vi.fn(), admin: vi.fn() }));
vi.mock("./execute", () => ({ executeUnit: mocks.execute }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { handleJob } from "./http";

const request = (auth = "Bearer test-cron-secret") => new Request("https://app.test/api/cron/messages", { headers: { authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  mocks.admin.mockReturnValue({ from: () => ({ upsert: mocks.upsert }) });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.execute.mockResolvedValue({ result: { sent: 0 }, more: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("scheduled job HTTP boundary", () => {
  it("rejects unsigned calls before touching workers or the database", async () => {
    expect((await handleJob(request(""), "messages")).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("fails closed when the secret or service client is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await handleJob(request(), "messages")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    mocks.admin.mockReturnValue(null);
    expect((await handleJob(request(), "messages")).status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("runs only the requested worker and writes its own heartbeat", async () => {
    const response = await handleJob(request(), "notifications");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.execute).toHaveBeenCalledWith("notifications", expect.any(AbortSignal));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: "cron_notifications", details: { status: "completed", units: 1 } }));
  });

  it("records failures without exposing exception text or suppressing another job", async () => {
    mocks.execute.mockImplementation(async (job: string) => {
      if (job === "agent") throw new Error("private provider response");
      return { result: {}, more: false };
    });
    const [bad, good] = await Promise.all([handleJob(request(), "agent"), handleJob(request(), "notifications")]);
    expect(bad.status).toBe(500);
    expect(await bad.text()).not.toContain("private");
    expect(good.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: "cron_agent", details: { status: "failed", units: 0 } }));
  });

  it("does not report success if its health write failed", async () => {
    mocks.upsert.mockResolvedValue({ error: { code: "database_unavailable" } });
    expect((await handleJob(request(), "messages")).status).toBe(500);
  });
});
