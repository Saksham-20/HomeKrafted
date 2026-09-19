/**
 * A refresh that fails is not an answer, and several tabs share one token.
 *
 * **The reports this pins.** An admin "keeps getting logged out". Two
 * separate defects fed it, and both live in `lib/api/http.ts`'s refresh:
 *
 * 1. `doRefresh` returned a boolean, and every failure — a 429 from the
 *    throttler, a 502 while pm2 restarts the API, a dropped connection —
 *    was `false`, which `request` read as "the session is over":
 *    `clearSession()` and a redirect to `/login`. `session-answer.ts` says
 *    only a 401/403 may delete a credential; this path never asked it.
 * 2. Each tab's refresh token lived in its own memory. The server rotates on
 *    first use, so a tab presenting the copy it loaded an hour ago after a
 *    sibling had rotated it was presenting a spent token, was refused, and
 *    wiped the shared `localStorage` the healthy tab was still using.
 *
 * `client/lib` runs under `node` (see `jest.config.js`), so the browser is
 * a hand-built fake: a `window` with `localStorage`, a `navigator.locks`
 * that really serialises, and a small fake API that rotates refresh tokens
 * the way `server/src/auth` does — one use each. Two "tabs" are two isolated
 * copies of the modules over the **same** storage, lock and server, which is
 * the only honest way to exercise a race between them.
 */

import type { StoredSession } from "@/lib/auth/session";

// The reachability probe fetches `/favicon.ico` and beacons `/client-errors`.
// Neither is under test, and both would be extra `fetch` calls in the log.
jest.mock("@/lib/api/unreachable", () => ({
  classifyAndReport: jest.fn().mockResolvedValue("server-unreachable"),
  report: jest.fn(),
}));

const STORAGE_KEY = "hk_session_v1";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

let nonce = 0;

/** A JWT-shaped string whose `exp` `isAccessTokenStale` can read. Unique per call. */
function jwt(secondsFromNow: number): string {
  nonce += 1;
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part({ exp: Math.floor(Date.now() / 1000) + secondsFromNow, n: nonce })}.sig`;
}

const USER = {
  id: "u1",
  name: "Admin",
  role: "admin" as const,
  referralCode: "ABC",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function session(refreshToken: string, accessToken = jwt(900)): StoredSession {
  return { accessToken, refreshToken, user: USER };
}

// ---------------------------------------------------------------------------
// The fake browser
// ---------------------------------------------------------------------------

type Listener = (event: unknown) => void;

interface FakeBrowser {
  store: Map<string, string>;
  location: { pathname: string; search: string; href: string };
  dispatch: (type: string, event: unknown) => void;
  read: () => StoredSession | null;
  write: (value: StoredSession) => void;
}

const globals = globalThis as unknown as Record<string, unknown>;
let browser: FakeBrowser;

/**
 * A `navigator.locks` that serialises for real: a second request waits for
 * the first callback's promise, exactly what the Web Locks spec guarantees
 * across tabs of one origin.
 */
function makeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const requested: string[] = [];
  return {
    requested,
    request: <T>(name: string, work: () => Promise<T>): Promise<T> => {
      requested.push(name);
      const run = tail.then(() => work());
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

function installBrowser(options: { locks?: ReturnType<typeof makeLocks> | null } = {}): FakeBrowser {
  const store = new Map<string, string>();
  const listeners = new Map<string, Listener[]>();
  const location = { pathname: "/admin/orders", search: "?page=2", href: "http://localhost/admin/orders?page=2" };

  globals.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: () => {},
    location,
  };
  globals.document = { cookie: "" };
  const locks = options.locks === undefined ? makeLocks() : options.locks;
  Object.defineProperty(globalThis, "navigator", {
    value: locks ? { locks } : {},
    configurable: true,
    writable: true,
  });

  return {
    store,
    location,
    dispatch: (type, event) => (listeners.get(type) ?? []).forEach((fn) => fn(event)),
    read: () => {
      const raw = store.get(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    },
    write: (value) => void store.set(STORAGE_KEY, JSON.stringify(value)),
  };
}

function uninstallBrowser(): void {
  delete globals.window;
  delete globals.document;
  delete globals.navigator;
  delete globals.fetch;
  delete globals.XMLHttpRequest;
}

// ---------------------------------------------------------------------------
// The fake API
// ---------------------------------------------------------------------------

interface FakeApi {
  /** Refresh tokens the server has rotated away from. */
  spent: Set<string>;
  refreshCalls: string[];
  /** A spent token presented again — reuse, the thing that used to end sessions. */
  replays: number;
  rotations: number;
  /** What the next `/auth/refresh` does instead of rotating. */
  refreshBehaviour: (() => Promise<Response>) | null;
  /** Access tokens the API currently accepts. */
  validAccess: Set<string>;
  /** Authorization headers seen on `/data`. */
  dataAuth: Array<string | null>;
}

/**
 * Rotating-refresh semantics as the server has them: each refresh token
 * works once, the rotation mints a new pair, and a spent token is refused.
 */
function installApi(liveRefreshToken: string): FakeApi {
  const api: FakeApi = {
    spent: new Set(),
    refreshCalls: [],
    replays: 0,
    rotations: 0,
    refreshBehaviour: null,
    validAccess: new Set(),
    dataAuth: [],
  };
  let live = liveRefreshToken;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  globals.fetch = jest.fn(async (input: string, init?: { headers?: Record<string, string>; body?: string }) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      const presented = (JSON.parse(init?.body ?? "{}") as { refreshToken: string }).refreshToken;
      api.refreshCalls.push(presented);
      if (api.refreshBehaviour) return api.refreshBehaviour();
      if (api.spent.has(presented)) {
        api.replays += 1;
        return json(401, { error: { code: "UNAUTHORIZED", message: "Refresh token is no longer valid" } });
      }
      if (presented !== live) {
        return json(401, { error: { code: "UNAUTHORIZED", message: "Refresh token is no longer valid" } });
      }
      api.spent.add(presented);
      api.rotations += 1;
      live = `R${api.rotations}`;
      const accessToken = jwt(900);
      api.validAccess.add(accessToken);
      return json(200, { accessToken, refreshToken: live });
    }
    if (url.endsWith("/data")) {
      const auth = init?.headers?.Authorization ?? null;
      api.dataAuth.push(auth);
      const token = auth?.replace("Bearer ", "") ?? "";
      if (!api.validAccess.has(token)) {
        return json(401, { error: { code: "UNAUTHORIZED", message: "Invalid or expired access token" } });
      }
      return json(200, { ok: true });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return api;
}

// ---------------------------------------------------------------------------
// A "tab": an isolated copy of the modules, sharing the browser and the API
// ---------------------------------------------------------------------------

interface Tab {
  session: typeof import("@/lib/auth/session");
  http: typeof import("@/lib/api/http");
  uploads: typeof import("@/lib/api/uploads");
  /** This tab's copy of the mocked reachability module — each isolated registry builds its own `jest.fn`. */
  unreachable: typeof import("@/lib/api/unreachable");
}

async function openTab(): Promise<Tab> {
  let tab!: Tab;
  await jest.isolateModulesAsync(async () => {
    tab = {
      session: await import("@/lib/auth/session"),
      http: await import("@/lib/api/http"),
      uploads: await import("@/lib/api/uploads"),
      unreachable: await import("@/lib/api/unreachable"),
    };
  });
  return tab;
}

let api: FakeApi;

/**
 * Sign a tab in at `refreshToken` with an access token the API does **not**
 * accept (it expired), so its first authed request 401s and refreshes.
 */
function signInExpired(tab: Tab, refreshToken: string): void {
  tab.session.setSession(session(refreshToken, jwt(900)));
}

beforeEach(() => {
  browser = installBrowser();
  api = installApi("R0");
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  uninstallBrowser();
});

// ---------------------------------------------------------------------------

describe("a refresh that got no answer does not end the session", () => {
  const nobodyAnswered: Array<[string, () => Promise<Response>]> = [
    ["a 500", async () => new Response("boom", { status: 500 })],
    ["a 502 from the proxy while pm2 restarts the API", async () => new Response("<html>Bad Gateway</html>", { status: 502 })],
    ["a dropped connection", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a 200 that is not our JSON", async () => new Response("<html>captive portal</html>", { status: 200 })],
    ["a 200 with the tokens missing", async () => new Response(JSON.stringify({}), { status: 200 })],
  ];

  test.each(nobodyAnswered)("%s: the session survives and the request reports it could not be reached", async (label, behaviour) => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    api.refreshBehaviour = behaviour;

    const failure = await tab.http.http.get("/data").catch((e: unknown) => e);

    // Only a fetch that never got a response is worth probing our own origin
    // over (and beaconing). Every other row here *was answered* — a 500, a
    // 502, a page that is not ours — so a probe would report a rejected fetch
    // that did not happen and could tell somebody they are offline over a
    // request the server answered.
    const neverAnswered = label === "a dropped connection";
    expect(tab.unreachable.classifyAndReport).toHaveBeenCalledTimes(neverAnswered ? 1 : 0);
    if (neverAnswered) {
      expect(tab.unreachable.classifyAndReport).toHaveBeenCalledWith(expect.stringContaining("/auth/refresh"));
    }

    // The same status-0 error an unreachable API produces: callers already
    // know how to show it, and none of them read it as a verdict.
    expect(failure).toBeInstanceOf(tab.http.ApiError);
    expect(failure).toMatchObject({ status: 0, code: "SERVER_UNREACHABLE" });
    // The credential is exactly as it was — this is the whole point.
    expect(browser.read()?.refreshToken).toBe("R0");
    expect(tab.session.getRefreshToken()).toBe("R0");
    // And nobody is sent anywhere.
    expect(browser.location.href).toBe("http://localhost/admin/orders?page=2");
  });

  test("the failure is not sticky: the next request refreshes and succeeds", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    api.refreshBehaviour = async () => new Response("boom", { status: 500 });
    await expect(tab.http.http.get("/data")).rejects.toMatchObject({ status: 0 });

    api.refreshBehaviour = null;
    await expect(tab.http.http.get("/data")).resolves.toEqual({ ok: true });

    expect(tab.session.getRefreshToken()).toBe("R1");
  });

  test("a 429 from the throttler says so, with the wait, and does not probe or beacon", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    api.refreshBehaviour = async () =>
      new Response("slow down", { status: 429, headers: { "Retry-After": "42" } });

    const failure = await tab.http.http.get("/data").catch((e: unknown) => e);

    // Not "something on our end isn't responding": the server answered, and
    // what it said was to wait.
    expect(failure).toBeInstanceOf(tab.http.ApiError);
    expect(failure).toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many requests. Try again in about 42 seconds.",
    });
    expect(tab.unreachable.classifyAndReport).not.toHaveBeenCalled();
    // And the session is exactly as it was.
    expect(browser.read()?.refreshToken).toBe("R0");
  });

  test("a refresh that hangs is given up on, and it is still not an answer", async () => {
    jest.useFakeTimers();
    const tab = await openTab();
    signInExpired(tab, "R0");
    // A fetch that never settles by itself, only when aborted — a request
    // that would otherwise hold the cross-tab lock, and every sibling's
    // refresh with it, for ever.
    (globals.fetch as jest.Mock).mockImplementation(
      (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => {
        if (String(input).endsWith("/data")) {
          return Promise.resolve(new Response("{}", { status: 401 }));
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    );

    const outcome = tab.http.http.get("/data").catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(15_001);

    expect(await outcome).toMatchObject({ status: 0 });
    expect(browser.read()?.refreshToken).toBe("R0");
  });
});

describe("the server refusing the refresh token is an answer", () => {
  test("401 with nothing newer in storage ends the session and sends them to sign in", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    api.refreshBehaviour = async () =>
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "no" } }), { status: 401 });

    await expect(tab.http.http.get("/data")).rejects.toMatchObject({ status: 401 });

    expect(browser.read()).toBeNull();
    expect(tab.session.getSession()).toBeNull();
    // With the page they were on, so signing in returns them to it.
    expect(browser.location.href).toBe("/login?next=%2Fadmin%2Forders%3Fpage%3D2");
  });

  test("403 is an answer too", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    api.refreshBehaviour = async () => new Response("{}", { status: 403 });

    await expect(tab.http.http.get("/data")).rejects.toMatchObject({ status: 401 });

    expect(browser.read()).toBeNull();
  });

  test("no session left at all is rejected without asking the server", async () => {
    const tab = await openTab();
    // A 401 with no token to refresh: the pre-existing behaviour, kept.
    (globals.fetch as jest.Mock).mockImplementation(async () => new Response("{}", { status: 401 }));

    await expect(tab.http.http.get("/data")).rejects.toMatchObject({ status: 401 });

    expect(api.refreshCalls).toEqual([]);
  });

  test("a refusal while a sibling's result is already in storage adopts it instead of ending anything", async () => {
    // The tab without Web Locks: it loses the race to a sibling, the server
    // refuses its stale token, and by the time that answer arrives the
    // sibling's tokens are in storage.
    uninstallBrowser();
    browser = installBrowser({ locks: null });
    api = installApi("R0");
    const tab = await openTab();
    signInExpired(tab, "R0");

    const siblingAccess = jwt(900);
    api.validAccess.add(siblingAccess);
    api.refreshBehaviour = async () => {
      browser.write(session("R1", siblingAccess));
      return new Response("{}", { status: 401 });
    };

    await expect(tab.http.http.get("/data")).resolves.toEqual({ ok: true });

    expect(browser.read()?.refreshToken).toBe("R1");
    expect(api.dataAuth.at(-1)).toBe(`Bearer ${siblingAccess}`);
  });
});

describe("a refusal that says a sibling just rotated the token is waited on, not obeyed", () => {
  const rotatedRefusal = () =>
    new Response(
      JSON.stringify({ error: { code: "REFRESH_TOKEN_ROTATED", message: "Refresh token is no longer valid" } }),
      { status: 401 },
    );

  /** A tab with no Web Locks (or an old bundle beside it): the only protection is the storage re-read. */
  async function tabWithoutLocks(): Promise<Tab> {
    uninstallBrowser();
    browser = installBrowser({ locks: null });
    api = installApi("R0");
    const tab = await openTab();
    signInExpired(tab, "R0");
    return tab;
  }

  test("the winner's tokens land a moment after our 401: adopted, and nothing is deleted", async () => {
    const tab = await tabWithoutLocks();
    const siblingAccess = jwt(900);
    api.validAccess.add(siblingAccess);
    api.refreshBehaviour = async () => {
      // Our 401 arrives first; the sibling's 200 is written 250ms later.
      setTimeout(() => browser.write(session("R1", siblingAccess)), 250);
      return rotatedRefusal();
    };

    await expect(tab.http.http.get("/data")).resolves.toEqual({ ok: true });

    // Without the wait this read "nothing newer in storage", called the
    // refusal final and wiped the session the sibling was about to write.
    expect(browser.read()?.refreshToken).toBe("R1");
    expect(api.dataAuth.at(-1)).toBe(`Bearer ${siblingAccess}`);
    expect(browser.location.href).toBe("http://localhost/admin/orders?page=2");
  });

  test("nothing arrives in time: the session is kept, the request fails as unreachable, and nothing is probed", async () => {
    jest.useFakeTimers();
    const tab = await tabWithoutLocks();
    api.refreshBehaviour = async () => rotatedRefusal();

    const outcome = tab.http.http.get("/data").catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(2_500);
    const failure = await outcome;

    expect(failure).toMatchObject({ status: 0, code: "SERVER_UNREACHABLE" });
    // The winner may simply be slow: the credential stays, and the next
    // request looks again.
    expect(browser.read()?.refreshToken).toBe("R0");
    expect(browser.location.href).toBe("http://localhost/admin/orders?page=2");
    // The server answered; there is no rejected fetch to classify.
    expect(tab.unreachable.classifyAndReport).not.toHaveBeenCalled();
  });

  test("the session is cleared while it waits: that is a sign-out elsewhere, so it ends here too", async () => {
    const tab = await tabWithoutLocks();
    api.refreshBehaviour = async () => {
      setTimeout(() => browser.store.delete(STORAGE_KEY), 150);
      return rotatedRefusal();
    };

    await expect(tab.http.http.get("/data")).rejects.toMatchObject({ status: 401 });

    expect(browser.read()).toBeNull();
    expect(browser.location.href).toBe("/login?next=%2Fadmin%2Forders%3Fpage%3D2");
  });

  test("an ordinary 401 — no rotated code — is still final at once", async () => {
    const tab = await tabWithoutLocks();
    api.refreshBehaviour = async () =>
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "no" } }), { status: 401 });

    await expect(tab.http.http.get("/data")).rejects.toMatchObject({ status: 401 });

    expect(browser.read()).toBeNull();
  });
});

describe("two tabs, one refresh token", () => {
  test("a tab whose memory is stale adopts the rotated pair from storage and never posts the spent token", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");

    // Another tab rotated R0 -> R1 and wrote it. This tab's memory and its
    // storage event have not caught up: it still holds R0.
    const rotatedAccess = jwt(900);
    api.validAccess.add(rotatedAccess);
    browser.write(session("R1", rotatedAccess));
    api.spent.add("R0");

    await expect(tab.http.http.get("/data")).resolves.toEqual({ ok: true });

    // No `/auth/refresh` at all: posting R0 is the replay that used to be
    // read as reuse, and here it would also have wiped the session.
    expect(api.refreshCalls).toEqual([]);
    expect(api.replays).toBe(0);
    expect(browser.read()?.refreshToken).toBe("R1");
    expect(tab.session.getRefreshToken()).toBe("R1");
    expect(api.dataAuth.at(-1)).toBe(`Bearer ${rotatedAccess}`);
  });

  test("if what the sibling stored is itself about to expire, the tab spends the current token rather than trusting it", async () => {
    // A tab that slept through several rotations: storage holds R2 with an
    // access token 5 seconds from death.
    const tab = await openTab();
    signInExpired(tab, "R0");
    api = installApi("R2");
    browser.write(session("R2", jwt(5)));

    await expect(tab.http.http.get("/data")).resolves.toEqual({ ok: true });

    // It posted R2 — the token storage holds — never its own stale R0.
    expect(api.refreshCalls).toEqual(["R2"]);
    expect(browser.read()?.refreshToken).toBe("R1");
  });

  test("two tabs that expire together rotate the token exactly once, and both carry on", async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    signInExpired(tabA, "R0");
    // Same browser: B loads what A wrote, like a second tab opening.
    tabB.session.syncFromStorage();
    expect(tabB.session.getRefreshToken()).toBe("R0");

    const [a, b] = await Promise.all([tabA.http.http.get("/data"), tabB.http.http.get("/data")]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    // One rotation. Without the lock and the re-read both tabs post R0 and
    // the second is refused — the defect, reproduced.
    expect(api.rotations).toBe(1);
    expect(api.replays).toBe(0);
    expect(api.refreshCalls).toEqual(["R0"]);
    expect(browser.read()?.refreshToken).toBe("R1");
    expect(tabA.session.getRefreshToken()).toBe("R1");
    expect(tabB.session.getRefreshToken()).toBe("R1");
  });

  test("the lock is the one name every tab uses, held for the whole refresh", async () => {
    const locks = makeLocks();
    uninstallBrowser();
    browser = installBrowser({ locks });
    api = installApi("R0");
    const tab = await openTab();
    signInExpired(tab, "R0");

    await tab.http.http.get("/data");

    expect(locks.requested).toEqual(["hk-auth-refresh"]);
  });

  test("concurrent 401s inside one tab still make a single refresh call", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");

    await Promise.all([tab.http.http.get("/data"), tab.http.http.get("/data"), tab.http.http.get("/data")]);

    expect(api.refreshCalls).toEqual(["R0"]);
  });

  test("without Web Locks the refresh still runs, and the storage re-read is the fallback", async () => {
    uninstallBrowser();
    browser = installBrowser({ locks: null });
    api = installApi("R0");
    const tab = await openTab();
    signInExpired(tab, "R0");

    await expect(tab.http.http.get("/data")).resolves.toEqual({ ok: true });

    expect(api.rotations).toBe(1);
  });
});

describe("the token cache follows the store", () => {
  test("a storage event from another tab replaces this tab's memory", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    const rotated = session("R1", jwt(900));

    browser.write(rotated);
    browser.dispatch("storage", { key: STORAGE_KEY, newValue: JSON.stringify(rotated) });

    expect(tab.session.getRefreshToken()).toBe("R1");
    expect(tab.session.getAccessToken()).toBe(rotated.accessToken);
  });

  test("a sign-out in another tab empties this tab's memory and tells subscribers", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    const heard: Array<StoredSession | null> = [];
    tab.session.onSessionChangedElsewhere((next) => heard.push(next));

    browser.store.delete(STORAGE_KEY);
    browser.dispatch("storage", { key: STORAGE_KEY, newValue: null });

    expect(tab.session.getSession()).toBeNull();
    expect(heard).toEqual([null]);
  });

  test("localStorage.clear() elsewhere (key null) is a sign-out here", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    const heard: Array<StoredSession | null> = [];
    tab.session.onSessionChangedElsewhere((next) => heard.push(next));

    browser.store.clear();
    browser.dispatch("storage", { key: null, newValue: null });

    expect(tab.session.getSession()).toBeNull();
    expect(heard).toEqual([null]);
  });

  test("an unrelated key changing is none of this module's business", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    const heard: unknown[] = [];
    tab.session.onSessionChangedElsewhere((next) => heard.push(next));

    browser.dispatch("storage", { key: "hk_auth_v1", newValue: "{}" });

    expect(tab.session.getRefreshToken()).toBe("R0");
    expect(heard).toEqual([]);
  });

  test("an unsubscribed listener hears nothing", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    const heard: unknown[] = [];
    const stop = tab.session.onSessionChangedElsewhere((next) => heard.push(next));
    stop();

    browser.dispatch("storage", { key: STORAGE_KEY, newValue: null });

    expect(heard).toEqual([]);
  });

  test("syncFromStorage re-reads on demand, ahead of any event", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    browser.write(session("R1"));

    expect(tab.session.getRefreshToken()).toBe("R0");
    expect(tab.session.syncFromStorage()?.refreshToken).toBe("R1");
    expect(tab.session.getRefreshToken()).toBe("R1");
  });

  test("storage that cannot be read is not an empty session", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    (globals.window as { localStorage: { getItem: () => never } }).localStorage.getItem = () => {
      throw new Error("SecurityError");
    };

    // The cache misbehaving must not sign anybody out.
    expect(tab.session.syncFromStorage()?.refreshToken).toBe("R0");
    expect(tab.session.getRefreshToken()).toBe("R0");
  });
});

// ---------------------------------------------------------------------------
// The upload XHR
// ---------------------------------------------------------------------------

class FakeXhr {
  static sent: Array<{ auth: string | null }> = [];
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(): void {}
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  abort(): void {
    this.onabort?.();
  }
  send(): void {
    const auth = this.headers.Authorization ?? null;
    FakeXhr.sent.push({ auth });
    const token = auth?.replace("Bearer ", "") ?? "";
    queueMicrotask(() => {
      if (api.validAccess.has(token)) {
        this.status = 201;
        this.responseText = JSON.stringify({ url: "/uploads/a.webp", key: "a", bytes: 1, mime: "image/webp" });
      } else {
        this.status = 401;
        this.responseText = JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid or expired access token" } });
      }
      this.onload?.();
    });
  }
}

const FILE = new Blob(["x"]) as unknown as File;

describe("an upload goes through the same refresh", () => {
  beforeEach(() => {
    FakeXhr.sent = [];
    globals.XMLHttpRequest = FakeXhr;
  });

  test("a token that is about to expire is refreshed before the photo is sent", async () => {
    const tab = await openTab();
    tab.session.setSession(session("R0", jwt(10)));

    await expect(tab.uploads.uploadImage(FILE, "listing")).resolves.toMatchObject({ url: "/uploads/a.webp" });

    // Sent once, with the fresh token — not sent stale and bounced.
    expect(FakeXhr.sent).toHaveLength(1);
    expect(api.refreshCalls).toEqual(["R0"]);
    expect(tab.session.getRefreshToken()).toBe("R1");
  });

  test("a 401 on a token that looked fine refreshes once and sends again", async () => {
    // The admin who dwelt on a listing form: the token's `exp` says fine,
    // the server disagrees (revoked, or rotated by another tab).
    const tab = await openTab();
    signInExpired(tab, "R0");

    await expect(tab.uploads.uploadImage(FILE, "listing")).resolves.toMatchObject({ url: "/uploads/a.webp" });

    expect(FakeXhr.sent).toHaveLength(2);
    expect(api.rotations).toBe(1);
  });

  test("it is one retry, not a loop", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    // A refresh that "succeeds" with a token the API then refuses.
    api.refreshBehaviour = async () =>
      new Response(JSON.stringify({ accessToken: jwt(900), refreshToken: "R1" }), { status: 200 });

    await expect(tab.uploads.uploadImage(FILE, "listing")).rejects.toMatchObject({ status: 401 });

    expect(FakeXhr.sent).toHaveLength(2);
    expect(api.refreshCalls).toEqual(["R0"]);
  });

  test("a refresh that got no answer fails the upload and keeps the session", async () => {
    const tab = await openTab();
    tab.session.setSession(session("R0", jwt(10)));
    api.refreshBehaviour = async () => new Response("boom", { status: 502 });

    const failure = await tab.uploads.uploadImage(FILE, "listing").catch((e: unknown) => e);

    expect(failure).toMatchObject({ status: 0, code: "SESSION_UNVERIFIED" });
    expect(FakeXhr.sent).toHaveLength(0);
    expect(browser.read()?.refreshToken).toBe("R0");
    expect(browser.location.href).toBe("http://localhost/admin/orders?page=2");
  });

  test("a refresh the server refuses fails the upload without yanking the form away", async () => {
    const tab = await openTab();
    signInExpired(tab, "R0");
    api.refreshBehaviour = async () => new Response("{}", { status: 401 });

    const failure = await tab.uploads.uploadImage(FILE, "listing").catch((e: unknown) => e);

    // The `ImageUpload` component maps this code to "sign in again".
    expect(failure).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    // Not a redirect: somebody is halfway through a form with a photo on it.
    expect(browser.location.href).toBe("http://localhost/admin/orders?page=2");
  });

  test("a 401 with no token was never a session problem and is not retried", async () => {
    const tab = await openTab();

    await expect(tab.uploads.uploadImage(FILE, "application")).rejects.toMatchObject({ status: 401 });

    expect(FakeXhr.sent).toHaveLength(1);
    expect(api.refreshCalls).toEqual([]);
  });
});
