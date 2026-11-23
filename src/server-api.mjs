const encoder = new TextEncoder();
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_BODY_BYTES = 4096;

export async function neonRequest(connectionString, statement) {
  let database;
  try {
    database = new URL(connectionString);
  } catch {
    throw new Error("The Neon connection is missing or invalid.");
  }
  if (!["postgresql:", "postgres:"].includes(database.protocol) ||
      !database.hostname.endsWith(".neon.tech") || !database.password) {
    throw new Error("A Neon PostgreSQL connection with credentials is required.");
  }
  const response = await fetch(`https://${database.hostname}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": connectionString,
      "Neon-Array-Mode": "false",
      "Neon-Raw-Text-Output": "false",
    },
    body: JSON.stringify(statement),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Database diagnostics can contain SQL, connection details or submitted values.
    const failure = await response.json().catch(() => ({}));
    const code = /^[A-Z0-9]{5}$/.test(failure.code) ? ` (SQLSTATE ${failure.code})` : "";
    const details = [failure.message, failure.detail, failure.hint].filter(item => typeof item === "string").join(" ");
    const categories = [
      [/quota|compute (time|hours)|usage limit|spending limit|payment required|plan limit|billing/i, "project quota or billing limit"],
      [/suspend|disabled|inactive|not active/i, "project, branch or endpoint is inactive"],
      [/not found|does not exist/i, "a required endpoint, role, database or object could not be found"],
      [/password authentication|authentication failed|invalid (credentials|password)|invalid endpoint password/i, "credential verification failed"],
      [/permission denied|insufficient privilege|must be (a )?(superuser|member|owner)|not permitted/i, "insufficient database privileges"],
      [/unsupported.*(option|parameter)|unknown.*(parameter|option)|channel.binding/i, "connection parameter unsupported by the transport"],
      [/ip.*(allow|restrict)|allowlist|not allowed to connect|public network access|public access|private.link/i, "project network access restrictions"],
      [/rate limit|too many (requests|connections)/i, "database connection or request rate limit"],
      [/temporarily|timed out|timeout|unavailable|could not (connect|wake)|failed to wake/i, "compute wake-up or availability issue"],
      [/read.only/i, "read-only database connection"],
      [/feature.*not supported|unsupported|not supported/i, "unsupported database or proxy feature"],
      [/malformed|invalid connection string|invalid.*header/i, "invalid connection string or protocol header"],
      [/internal.*error/i, "Neon reported an internal error"],
    ];
    const category = categories.find(([pattern]) => pattern.test(details))?.[1];
    throw new Error(`Database request failed with HTTP ${response.status}${code}${category ? ": " + category : ""}.`);
  }
  return response.json();
}

function hex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function passwordHash(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g), pair => parseInt(pair, 16));
  // Web Crypto in Cloudflare Workers supports up to 100,000 PBKDF2 iterations.
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt, iterations: 100000 }, key, 256);
  return hex(new Uint8Array(hash));
}

function equalHashes(left, right) {
  let difference = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Send the request as JSON.");
  }
  if (!request.body) throw new HttpError(400, "The request body is missing.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let content = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "The request is too large.");
    }
    content += decoder.decode(value, { stream: true });
  }
  try {
    const body = JSON.parse(content + decoder.decode());
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new HttpError(400, "The request body must be a JSON object.");
}

function cookieConfig(url) {
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return { name: local ? "nb_local_admin" : "__Host-nb_admin", secure: local ? "" : "; Secure" };
}

function sessionCookie(url, token = "", maxAge = 0) {
  const { name, secure } = cookieConfig(url);
  return `${name}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

async function sessionKey(request, url) {
  const { name } = cookieConfig(url);
  const match = (request.headers.get("Cookie") || "").split(";").map(part => part.trim())
    .find(part => part.startsWith(name + "="));
  const token = match?.slice(name.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? digest(token) : null;
}

async function currentUser(query, key) {
  if (!key) return null;
  const [user] = await query("SELECT email FROM naya_baazar.sessions WHERE token_hash = $1 AND expires_at > now()", [key]);
  return user ?? null;
}

async function login(request, url, query, clientIp) {
  const body = await readBody(request);
  if (typeof body.email !== "string" || body.email.length > 254 ||
      typeof body.password !== "string" || body.password.length > 512 || !body.password.length) {
    throw new HttpError(400, "Enter your email address and password.");
  }
  const email = body.email.trim().toLowerCase();
  const client = await digest(clientIp);
  const granted = await query(`
    INSERT INTO naya_baazar.login_limits AS limits (client_key, started_at, attempts)
    VALUES ($1, now(), 1)
    ON CONFLICT (client_key) DO UPDATE SET
      started_at = CASE WHEN limits.started_at <= now() - interval '15 minutes' THEN now() ELSE limits.started_at END,
      attempts = CASE WHEN limits.started_at <= now() - interval '15 minutes' THEN 1 ELSE limits.attempts + 1 END
    WHERE limits.attempts < 8 OR limits.started_at <= now() - interval '15 minutes'
    RETURNING attempts`, [client]);
  if (!granted.length) {
    return json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, 429, { "Retry-After": String(LOGIN_WINDOW_SECONDS) });
  }

  const [account] = await query("SELECT email, salt, password_hash FROM naya_baazar.admins WHERE email = $1", [email]);
  const calculated = await passwordHash(body.password, account?.salt ?? "0".repeat(32));
  if (!equalHashes(calculated, account?.password_hash ?? "0".repeat(64)) || !account) {
    throw new HttpError(401, "The email or password is incorrect.");
  }
  const token = randomHex(32);
  const previousKey = await sessionKey(request, url);
  await query(`
    WITH expired AS (DELETE FROM naya_baazar.sessions WHERE expires_at <= now() OR token_hash = $3),
    cleared AS (DELETE FROM naya_baazar.login_limits WHERE client_key = $4 OR started_at < now() - interval '1 day')
    INSERT INTO naya_baazar.sessions (token_hash, email, expires_at)
    VALUES ($1, $2, now() + interval '8 hours')`, [await digest(token), email, previousKey, client]);
  return json({ user: { email } }, 200, { "Set-Cookie": sessionCookie(url, token, SESSION_SECONDS) });
}

function shopRow(row) {
  return { id: Number(row.id), status: row.status, version: Number(row.version) };
}

async function updateShop(request, query, key, id) {
  if (!await currentUser(query, key)) throw new HttpError(401, "Sign in to manage shops.");
  const { status, version } = await readBody(request);
  if (!["available", "booked"].includes(status) || !Number.isSafeInteger(version) || version < 0) {
    throw new HttpError(400, "Choose Available or Booked and reload the current shop version.");
  }
  const [updated] = await query(`
    UPDATE naya_baazar.shops SET status = $2, version = version + 1, updated_at = now()
    WHERE id = $1 AND version = $3
      AND EXISTS (SELECT 1 FROM naya_baazar.sessions WHERE token_hash = $4 AND expires_at > now())
    RETURNING id, status, version`, [id, status, version, key]);
  if (updated) return json({ shop: shopRow(updated) });
  if (!await currentUser(query, key)) throw new HttpError(401, "Your session expired. Sign in again.");
  const [current] = await query("SELECT id, status, version FROM naya_baazar.shops WHERE id = $1", [id]);
  if (!current) throw new HttpError(404, "Shop not found.");
  return json({ error: "This shop changed since you opened it. Review its current status.", shop: shopRow(current) }, 409);
}

export async function handleApi(request, env, {
  url = new URL(request.url),
  clientIp = request.headers.get("CF-Connecting-IP") || "local",
} = {}) {
  const path = url.pathname;
  const shop = /^\/api\/shops\/([1-9][0-9]{0,4})$/.exec(path);
  const allowed = { "/api/shops": "GET", "/api/session": "GET", "/api/login": "POST", "/api/logout": "POST" }[path]
    ?? (shop ? "PATCH" : null);
  if (!allowed) return json({ error: "Route not found." }, 404);
  if (request.method !== allowed) return json({ error: "Method not allowed." }, 405, { Allow: allowed });
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) {
    return json({ error: "Open the project in this browser to make changes." }, 403);
  }
  const query = async (sql, params = []) => {
    const result = await neonRequest(env.DATABASE_URL, {
      query: sql,
      params: params.map(value => value == null ? null : String(value)),
    });
    return result.rows;
  };
  try {
    if (path === "/api/shops") {
      const rows = await query("SELECT id, status, version FROM naya_baazar.shops ORDER BY id");
      return json({ shops: rows.map(shopRow) });
    }
    if (path === "/api/login") return await login(request, url, query, clientIp);
    const key = await sessionKey(request, url);
    if (path === "/api/session") return json({ user: await currentUser(query, key) });
    if (path === "/api/logout") {
      if (key) await query("DELETE FROM naya_baazar.sessions WHERE token_hash = $1", [key]);
      return json({ user: null }, 200, { "Set-Cookie": sessionCookie(url) });
    }
    return await updateShop(request, query, key, Number(shop[1]));
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    const message = String(error?.message ?? "");
    const runtimeHint = ["redirect", "certificate", "ssl", "url", "abortsignal", "timeout", "invalid header", "illegal invocation", "network connection lost", "not a function"].find(term => message.toLowerCase().includes(term));
    const safeReason = /^(Database request failed with HTTP [0-9]{3}|The Neon connection is missing or invalid|A Neon PostgreSQL connection with credentials is required)/.test(message)
      ? message : /timeout|abort/i.test(message) ? "Request timeout or cancellation"
      : error instanceof TypeError ? "Network or runtime TypeError" + (runtimeHint ? " (" + runtimeHint + ")" : "") : "Unexpected database response";
    console.error("Naya Baazar API", path, safeReason);
    return json({ error: "The project database is temporarily unavailable. Try again shortly." }, 503, { "Retry-After": "5", ...(url.hostname === "127.0.0.1" ? {"X-Local-Database-Check": safeReason} : {}) });
  }
}
