import { afterEach, describe, expect, it, vi } from "vitest";
import { runBoundedJob } from "./runner";

afterEach(() => vi.useRealTimers());

describe("bounded job execution", () => {
  it("drains small units in order and stops on an empty queue", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ result: 1, more: true }).mockResolvedValueOnce({ result: 0, more: false });
    expect(await runBoundedJob({ budgetMs: 1000, maxUnits: 10 }, execute)).toEqual({ status: "completed", units: 2, results: [1, 0] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("yields at the work limit even with an endless queue", async () => {
    const execute = vi.fn().mockResolvedValue({ result: "work", more: true });
    expect(await runBoundedJob({ budgetMs: 1000, maxUnits: 2 }, execute)).toMatchObject({ status: "yielded", units: 2 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("cancels active IO and waits for it to stop before returning", async () => {
    vi.useFakeTimers();
    let stopped = false;
    const execute = vi.fn((signal: AbortSignal) => new Promise<{ result: unknown; more: boolean }>((_resolve, reject) => {
      signal.addEventListener("abort", () => { stopped = true; reject(signal.reason); }, { once: true });
    }));
    const promise = runBoundedJob({ budgetMs: 50, maxUnits: 20 }, execute);
    await vi.advanceTimersByTimeAsync(50);
    expect(await promise).toEqual({ status: "timed_out", units: 0, results: [] });
    expect(stopped).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let one failing job cancel another invocation", async () => {
    const bad = runBoundedJob({ budgetMs: 1000, maxUnits: 1 }, async () => { throw new Error("provider failed"); });
    const good = runBoundedJob({ budgetMs: 1000, maxUnits: 1 }, async (signal) => ({ result: signal.aborted, more: false }));
    const result = await Promise.allSettled([bad, good]);
    expect(result[0].status).toBe("rejected");
    expect(result[1]).toMatchObject({ status: "fulfilled", value: { status: "completed", results: [false] } });
  });

  it("rejects invalid budgets before starting work", async () => {
    const execute = vi.fn();
    await expect(runBoundedJob({ budgetMs: 0, maxUnits: 1 }, execute)).rejects.toThrow("Invalid");
    expect(execute).not.toHaveBeenCalled();
  });
});
