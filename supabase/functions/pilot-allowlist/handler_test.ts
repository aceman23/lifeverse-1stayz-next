// deno test supabase/functions/pilot-allowlist/handler_test.ts
//
// Runs the handler against an in-memory store; no network or database needed.

import { createHandler, type AllowlistEntry, type AllowlistStore } from "./handler.ts";

const SECRET = "test-secret-value";

type Row = AllowlistEntry & { used_at: string | null };

function memoryStore(rows: Map<string, Row>): AllowlistStore {
  return {
    insertIfAbsent(entry) {
      if (rows.has(entry.email)) return Promise.resolve(false);
      rows.set(entry.email, { ...entry, used_at: null });
      return Promise.resolve(true);
    },
    fillEmpty(entry) {
      const row = rows.get(entry.email);
      if (row) {
        if (!row.church_name && entry.church_name) row.church_name = entry.church_name;
        if (!row.source_ref && entry.source_ref) row.source_ref = entry.source_ref;
      }
      return Promise.resolve();
    },
    deleteUnused(email) {
      const row = rows.get(email);
      if (!row || row.used_at) return Promise.resolve(false);
      rows.delete(email);
      return Promise.resolve(true);
    },
    exists(email) {
      return Promise.resolve(rows.has(email));
    },
  };
}

function setup({ secret }: { secret: string | undefined } = { secret: SECRET }) {
  const rows = new Map<string, Row>();
  const logs: { action: string; result: string }[] = [];
  const handle = createHandler({ secret: () => secret, store: () => memoryStore(rows), log: (e) => logs.push(e) });
  return { rows, logs, handle };
}

function post(body: unknown, secret: string | null = SECRET, method = "POST") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-allowlist-secret"] = secret;
  return new Request("http://localhost/pilot-allowlist", {
    method,
    headers,
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function expectResponse(res: Response, status: number, body: Record<string, string>) {
  const actual = await res.json();
  if (res.status !== status || JSON.stringify(actual) !== JSON.stringify(body)) {
    throw new Error(`expected ${status} ${JSON.stringify(body)}, got ${res.status} ${JSON.stringify(actual)}`);
  }
}

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

const add = (email: string, extra: Record<string, unknown> = {}) => ({ action: "add", email, ...extra });
const remove = (email: string) => ({ action: "remove", email });

Deno.test("405 for anything but POST", async () => {
  const { handle } = setup();
  const res = await handle(post(null, SECRET, "GET"));
  assert(res.headers.get("allow") === "POST", "Allow header");
  await expectResponse(res, 405, { error: "method_not_allowed" });
});

Deno.test("503 when PILOT_ALLOWLIST_SECRET isn't set", async () => {
  const { handle } = setup({ secret: undefined });
  await expectResponse(await handle(post(add("a@church.test"))), 503, { error: "not_configured" });
  const { handle: blank } = setup({ secret: "" });
  await expectResponse(await blank(post(add("a@church.test"))), 503, { error: "not_configured" });
});

Deno.test("401 for a wrong or missing secret", async () => {
  const { handle, rows } = setup();
  await expectResponse(await handle(post(add("a@church.test"), "wrong")), 401, { error: "unauthorized" });
  await expectResponse(await handle(post(add("a@church.test"), `${SECRET}x`)), 401, { error: "unauthorized" });
  await expectResponse(await handle(post(add("a@church.test"), null)), 401, { error: "unauthorized" });
  assert(rows.size === 0, "nothing written");
});

Deno.test("422 for bad bodies", async () => {
  const { handle, rows } = setup();
  const cases: [unknown, string][] = [
    [add("not-an-email"), "invalid_email"],
    [add("two@@church.test"), "invalid_email"],
    [add("has space@church.test"), "invalid_email"],
    [add(`${"a".repeat(310)}@church.test`), "invalid_email"],
    [{ action: "add" }, "invalid_email"],
    [{ action: "add", email: 42 }, "invalid_email"],
    [{ action: "upsert", email: "a@church.test" }, "invalid_action"],
    [add("a@church.test", { church_name: "x".repeat(201) }), "invalid_church_name"],
    [add("a@church.test", { church_name: 7 }), "invalid_church_name"],
    [add("a@church.test", { source_ref: "x".repeat(101) }), "invalid_source_ref"],
    ["{not json", "invalid_body"],
    [[1, 2], "invalid_body"],
  ];
  for (const [body, error] of cases) {
    await expectResponse(await handle(post(body)), 422, { error });
  }
  assert(rows.size === 0, "nothing written");
});

Deno.test("add normalizes the email, repeat add is already_present and fills empty fields", async () => {
  const { handle, rows, logs } = setup();
  await expectResponse(await handle(post(add("  Pastor@Grace.Church  "))), 200, { status: "added" });
  assert(rows.has("pastor@grace.church"), "stored trimmed and lower-case");
  assert(rows.get("pastor@grace.church")!.church_name === null, "no church name yet");

  await expectResponse(
    await handle(post(add("pastor@grace.church", { church_name: " Grace Church ", source_ref: "inq_123" }))),
    200,
    { status: "already_present" },
  );
  const row = rows.get("pastor@grace.church")!;
  assert(row.church_name === "Grace Church" && row.source_ref === "inq_123", "empty fields filled");

  await expectResponse(await handle(post(add("PASTOR@grace.church", { church_name: "Other" }))), 200, { status: "already_present" });
  assert(rows.get("pastor@grace.church")!.church_name === "Grace Church", "existing name kept");
  assert(rows.size === 1, "one row");

  assert(!JSON.stringify(logs).includes("grace.church"), "email never logged");
});

Deno.test("remove: removed, then not_present", async () => {
  const { handle, rows } = setup();
  await handle(post(add("a@church.test")));
  await expectResponse(await handle(post(remove("A@Church.test"))), 200, { status: "removed" });
  assert(rows.size === 0, "row deleted");
  await expectResponse(await handle(post(remove("a@church.test"))), 200, { status: "not_present" });
});

Deno.test("remove after the church was created -> 409, row kept", async () => {
  const { handle, rows } = setup();
  await handle(post(add("a@church.test")));
  rows.get("a@church.test")!.used_at = new Date().toISOString();
  await expectResponse(await handle(post(remove("a@church.test"))), 409, { error: "church_already_created" });
  assert(rows.has("a@church.test"), "row kept");
});

Deno.test("store errors -> 500 without details", async () => {
  const handle = createHandler({
    secret: () => SECRET,
    store: () => {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    },
    log: () => {},
  });
  const original = console.error;
  console.error = () => {};
  try {
    await expectResponse(await handle(post(add("a@church.test"))), 500, { error: "internal_error" });
  } finally {
    console.error = original;
  }
});
