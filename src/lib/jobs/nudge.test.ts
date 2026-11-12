import { beforeEach, describe, expect, it, vi } from "vitest";
const execute = vi.hoisted(() => vi.fn());
vi.mock("./execute", () => ({ executeUnit: execute }));
import { nudgeJob } from "./nudge";

beforeEach(() => { execute.mockReset().mockResolvedValue({ result: {}, more: false }); });

describe("foreground worker nudges", () => {
  it("shares one deadline across the agent and its notification/delivery follow-ups", async () => {
    await nudgeJob("agent");
    expect(execute.mock.calls.map((args) => args[0])).toEqual(["agent", "notifications", "messages"]);
    const signal = execute.mock.calls[0][1];
    expect(execute.mock.calls.every((args) => args[1] === signal)).toBe(true);
  });
  it("runs a delivery nudge without invoking the model or notification worker", async () => {
    await nudgeJob("messages");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("messages", expect.any(AbortSignal));
  });
  it("leaves recovery to the independent schedule on failure", async () => {
    execute.mockRejectedValue(new Error("provider unavailable"));
    await expect(nudgeJob("messages")).resolves.toBeUndefined();
  });
});
