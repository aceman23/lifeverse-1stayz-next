import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "./http";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("provider cancellation", () => {
  it("does not start a request after the invocation deadline", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(postJson("groq", "https://provider.test", {}, {}, 1000, AbortSignal.abort())).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels an in-flight request without retrying it", async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const promise = postJson("groq", "https://provider.test", {}, {}, 1000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cancels retry backoff instead of starting another paid call", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "busy" }, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const promise = postJson("groq", "https://provider.test", {}, {}, 1000, controller.signal);
    const assertion = expect(promise).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
