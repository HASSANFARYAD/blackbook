import { test, expect } from "@playwright/test";
import { decisionId, fetchDecisions } from "./helpers";

test.describe("API contract", () => {
  // ER-01 / ER-02 / ER-03: the SPA catch-all must not swallow the API surface.
  test("unknown /api path returns a JSON 404, not the SPA", async ({ request }) => {
    const res = await request.get("/api/nope");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(await res.text()).not.toContain("<!doctype html>");
  });

  test("unknown nested /api path returns a JSON 404", async ({ request }) => {
    const res = await request.get("/api/decisions/abc/not-a-real-subresource");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("wrong method on a real API path returns 405, not the SPA", async ({ request }) => {
    const res = await request.get("/api/evaluate");
    expect(res.status()).toBe(405);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("unknown non-API path still serves the SPA for client-side routing", async ({ request }) => {
    const res = await request.get("/totally/unknown/route");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    expect(await res.text()).toContain("<div id=\"root\">");
  });

  // ER-04: consistent, human-readable error detail across every 404 path.
  test("missing records return 404 with an unquoted detail sentence", async ({ request }) => {
    const cases = [
      await request.get("/api/decisions/does-not-exist"),
      await request.get("/api/decisions/does-not-exist/lineage"),
      await request.post("/api/watch", { data: { decision_id: "does-not-exist" } }),
      await request.post("/api/counterfactual", { data: { decision_id: "does-not-exist" } }),
    ];
    for (const res of cases) {
      expect(res.status(), await res.text()).toBe(404);
      const detail = (await res.json()).detail as string;
      expect(typeof detail).toBe("string");
      // `str(KeyError("x"))` is `"'x'"` — a Python repr must never reach the client.
      expect(detail).not.toMatch(/^'.*'$/);
      expect(detail.toLowerCase()).toContain("not found");
    }
  });

  // IV-01 / IV-02 / IV-03
  test("evaluate rejects empty, whitespace, missing and mistyped input", async ({ request }) => {
    const empty = await request.post("/api/evaluate", { data: { ip: "" } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).detail).toBe("ip must not be empty");

    const blank = await request.post("/api/evaluate", { data: { ip: "   " } });
    expect(blank.status()).toBe(400);

    const missing = await request.post("/api/evaluate", { data: {} });
    expect(missing.status()).toBe(422);
    expect(JSON.stringify((await missing.json()).detail)).toContain("ip");

    const mistyped = await request.post("/api/evaluate", { data: { ip: 123 } });
    expect(mistyped.status()).toBe(422);

    const malformed = await request.post("/api/evaluate", {
      headers: { "Content-Type": "application/json" },
      data: "{bad",
    });
    expect(malformed.status()).toBe(422);
    expect(await malformed.text()).not.toContain("Traceback");
  });

  // IV-10
  test("path traversal in a decision id reads no files", async ({ request }) => {
    for (const id of ["..%2F..%2F..%2Fetc%2Fpasswd", "..%5C..%5Cwindows%5Cwin.ini", "%2e%2e%2f%2e%2e%2f"]) {
      const res = await request.get(`/api/decisions/${id}`);
      const body = await res.text();
      expect(body).not.toContain("root:x:");
      expect(body).not.toContain("[extensions]");
      expect(body).not.toContain("BEGIN PRIVATE KEY");
    }
  });

  // ER-09
  test("no endpoint leaks secrets, tracebacks or absolute source paths", async ({ request }) => {
    const id = await decisionId(request, "Seveneves");
    const responses = [
      await request.get("/api/health"),
      await request.get("/api/decisions"),
      await request.get(`/api/decisions/${id}`),
      await request.get(`/api/decisions/${id}/lineage`),
      await request.post("/api/watch", { data: { decision_id: id } }),
      await request.post("/api/counterfactual", { data: { decision_id: id } }),
      await request.post("/api/evaluate", { data: { ip: "Leak Probe" } }),
      await request.get("/api/nope"),
    ];
    for (const res of responses) {
      const body = await res.text();
      expect(body).not.toContain("Traceback (most recent call last)");
      expect(body).not.toMatch(/[A-Za-z]:\\[\w\\.-]*agent\\/);
      expect(body).not.toMatch(/\/(home|srv|usr)\/[\w./-]*agent\//);
      expect(body).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/); // Google API key shape
      expect(JSON.stringify(res.headers())).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    }
  });

  // AZ-01: no auth exists by design — pin it so an accidental regression is visible.
  test("documented endpoints answer unauthenticated (recorded by design)", async ({ request }) => {
    const id = await decisionId(request, "Dune: Messiah");
    expect((await request.get("/api/health")).status()).toBe(200);
    expect((await request.get("/api/decisions")).status()).toBe(200);
    expect((await request.get(`/api/decisions/${id}`)).status()).toBe(200);
    expect((await request.get(`/api/decisions/${id}/lineage`)).status()).toBe(200);
    expect((await request.post("/api/counterfactual", { data: { decision_id: id } })).status()).toBe(200);
  });

  // DA-05
  test("concurrent watches on one decision both succeed and leave the store readable", async ({ request }) => {
    const id = await decisionId(request, "Seveneves");
    const [a, b] = await Promise.all([
      request.post("/api/watch", { data: { decision_id: id } }),
      request.post("/api/watch", { data: { decision_id: id } }),
    ]);
    expect(a.status()).toBe(200);
    expect(b.status()).toBe(200);
    expect((await fetchDecisions(request)).length).toBeGreaterThan(0);
  });
});
