import { describe, expect, it } from "vitest";
import { backoffMs, classifySyncError } from "./sync";

describe("classifySyncError", () => {
  it.each([
    [{ name: "TypeError", message: "Network request failed" }, "retry"],
    [{ code: "PGRST000", message: "Could not connect", status: 503 }, "retry"],
    [{ code: "42501", message: "device not registered or not allowed" }, "unregistered"],
    [{ code: "PGRST301", message: "JWT expired", status: 401 }, "auth"],
    [{ message: "Invalid Refresh Token: Refresh Token Not Found" }, "auth"],
    [{ code: "42501", message: "permission denied" }, "auth"],
    [{ code: "23503", message: "violates foreign key constraint" }, "skip"],
    [{ code: "22023", message: "refund quantity exceeds what was sold" }, "reject"],
    [{ code: "23505", message: "duplicate key" }, "reject"],
    [{ code: "P0001", message: "location_id cannot be changed" }, "reject"],
    [null, "retry"],
  ] as const)("%j → %s", (e, want) => expect(classifySyncError(e)).toBe(want));
});

describe("backoffMs", () => {
  it("doubles from 10 s and caps at 5 min", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => backoffMs(n))).toEqual([0, 10_000, 20_000, 40_000, 80_000, 300_000]);
  });
});
