import { describe, expect, it } from "vitest";
import { bearerToken, errorResponse, jsonResponse } from "../src/http";

describe("bearerToken", () => {
  it("extracts token from Bearer authorization header", () => {
    const request = new Request("https://x.test", {
      headers: { Authorization: "Bearer abc123" },
    });
    expect(bearerToken(request)).toBe("abc123");
  });

  it("is case-insensitive to the Authorization header name", () => {
    const request = new Request("https://x.test", {
      // Construct header with lower-case name
      headers: { authorization: "Bearer token-val" },
    });
    expect(bearerToken(request)).toBe("token-val");
  });

  it("is case-insensitive to the Bearer scheme", () => {
    const request = new Request("https://x.test", {
      headers: { Authorization: "bearer case-insensitive" },
    });
    expect(bearerToken(request)).toBe("case-insensitive");
  });

  it("trims whitespace from the header value before matching", () => {
    const request = new Request("https://x.test", {
      headers: { Authorization: "  Bearer spaced-token  " },
    });
    expect(bearerToken(request)).toBe("spaced-token");
  });

  it("returns null for non-Bearer authorization schemes", () => {
    const request = new Request("https://x.test", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(bearerToken(request)).toBeNull();
  });

  it("returns null when Authorization header is absent", () => {
    const request = new Request("https://x.test");
    expect(bearerToken(request)).toBeNull();
  });

  it("returns null for malformed Bearer header with no token", () => {
    const request = new Request("https://x.test", {
      headers: { Authorization: "Bearer" },
    });
    expect(bearerToken(request)).toBeNull();
  });

  it("returns null for empty Bearer token", () => {
    const request = new Request("https://x.test", {
      headers: { Authorization: "Bearer " },
    });
    expect(bearerToken(request)).toBeNull();
  });
});

describe("jsonResponse", () => {
  it("creates a JSON response with given status and body", async () => {
    const response = jsonResponse({ ok: true }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("defaults to status 200", async () => {
    const response = jsonResponse({ message: "hello" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "hello" });
  });

  it("handles array bodies", async () => {
    const response = jsonResponse([1, 2, 3]);
    expect(await response.json()).toEqual([1, 2, 3]);
  });

  it("handles null body", async () => {
    const response = jsonResponse(null);
    expect(await response.json()).toBeNull();
  });
});

describe("errorResponse", () => {
  it("returns a JSON error response with correct status", async () => {
    const response = errorResponse("not found", 404);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("returns unauthorized response", async () => {
    const response = errorResponse("unauthorized", 401);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
