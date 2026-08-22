/**
 * `GET /seller/me` may answer "no kitchen". It may not answer "no kitchen"
 * because it could not be reached.
 *
 * **The bug this pins (M39).** `getMySeller` ended `catch { return
 * undefined }`. `/seller/me` is not in the server's
 * `PASSWORD_CHANGE_EXEMPT` set, so for the whole life of an admin-issued
 * temporary password (M32) it answers **403 PASSWORD_CHANGE_REQUIRED** —
 * deliberately, and asserted in
 * `server/test/e2e/temp-password.e2e-spec.ts`. Swallowed, that 403 became
 * `undefined`, `AuthContext` recorded it as an answer, and `SellerShell`
 * rendered **"Sign in as a HomeKrafter"** at a HomeKrafter who had just
 * typed the right password. Its button returned to `/login`, whose
 * "You're all set" card sent them back, and round it went — with no
 * sign-in form anywhere in the loop.
 *
 * The same swallow did it for a 500 and for a dropped connection, which
 * is why it read as intermittent rather than as a bug.
 *
 * A 404 is the one failure that really is an answer, so it is the one
 * that still returns `undefined`.
 */

jest.mock("./http", () => {
  const actual = jest.requireActual("./http");
  return {
    ...actual,
    isMockMode: () => false,
    http: { get: jest.fn() },
  };
});

import { getMySeller, getSellerVendor } from "./seller";
import { ApiError, http } from "./http";

const get = http.get as jest.MockedFunction<typeof http.get>;

beforeEach(() => {
  get.mockReset();
});

describe("getMySeller — a failure is never a verdict", () => {
  it("returns the record when the server answers with one", async () => {
    get.mockResolvedValueOnce({ id: "s1", vendorId: "v1" });
    await expect(getMySeller()).resolves.toEqual({ id: "s1", vendorId: "v1" });
  });

  it("returns undefined for a 404 — that is a real 'no kitchen'", async () => {
    get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "No seller record"));
    await expect(getMySeller()).resolves.toBeUndefined();
  });

  it("THROWS on the 403 that a temporary password produces", async () => {
    get.mockRejectedValueOnce(
      new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Set your own password before continuing."),
    );
    // Resolving here is the whole bug: it is what told a signed-in
    // HomeKrafter they were not one.
    await expect(getMySeller()).rejects.toThrow(ApiError);
  });

  it("throws on a 500", async () => {
    get.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong"));
    await expect(getMySeller()).rejects.toThrow(ApiError);
  });

  it("throws when the request never lands at all", async () => {
    get.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getMySeller()).rejects.toThrow(TypeError);
  });
});

describe("getSellerVendor — same contract, same reason", () => {
  it("returns undefined for a 404", async () => {
    get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "No storefront"));
    await expect(getSellerVendor("v1")).resolves.toBeUndefined();
  });

  it("throws on the 403", async () => {
    // `/seller/storefront` is equally non-exempt, so a HomeKrafter owing a
    // password fails here too. Fixing only `getMySeller` would have left a
    // storefront screen rendering with silently absent data.
    get.mockRejectedValueOnce(
      new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Set your own password before continuing."),
    );
    await expect(getSellerVendor("v1")).rejects.toThrow(ApiError);
  });
});
