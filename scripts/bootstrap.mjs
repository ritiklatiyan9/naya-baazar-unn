import { readFile } from "node:fs/promises";
import { neonRequest, passwordHash, randomHex } from "../src/server-api.mjs";

const runtimeRole = "naya_baazar_app";
const sql = (query, params = []) => ({ query, params });
async function runStage(label, dsn, statement) {
  try {
    return await neonRequest(dsn, statement);
  } catch (error) {
    throw new Error(`${label} failed. ${error.message}`);
  }
}

async function readConfiguration() {
  if (process.env.DATABASE_URL && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    return {
      databaseUrl: process.env.DATABASE_URL,
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      runtimeRolePassword: process.env.RUNTIME_ROLE_PASSWORD,
    };
  }
  let input = "";
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdout.write("Ready for one line of bootstrap JSON on stdin (input hidden).\n");
  }
  try {
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (input.includes("\u0003") || input.length > 8192) throw new Error("Invalid bootstrap input.");
      if (process.stdin.isTTY && /[\r\n]/.test(input)) break;
    }
  } finally {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }
  try {
    return JSON.parse(input.trim());
  } catch {
    throw new Error("Supply databaseUrl, email and password as a JSON object on stdin.");
  }
}

async function bootstrap() {
  const config = await readConfiguration();
  const email = config.email?.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "") || email.length > 254 ||
      typeof config.password !== "string" || !config.password.length || config.password.length > 512) {
    throw new Error("Supply a valid admin email and password.");
  }
  const plans = JSON.parse(await readFile(new URL("../src/plan-data.json", import.meta.url), "utf8"));
  const numbers = new Set(plans.map(shop => shop.id));
  if (plans.length !== 216 || numbers.size !== 216 ||
      !plans.every(({ id, floor }) => Number.isInteger(id) &&
        ((floor === "ground" && id >= 1 && id <= 108) || (floor === "first" && id >= 112 && id <= 219)))) {
    throw new Error("The plan inventory does not match the two source floors.");
  }

  let runtimeUrl;
  if (config.runtimeRolePassword !== undefined) {
    if (!/^[\x21-\x7e]{24,128}$/.test(config.runtimeRolePassword)) {
      throw new Error("Use a generated 24–128 character printable ASCII runtime role password.");
    }
    runtimeUrl = new URL(config.databaseUrl);
    runtimeUrl.username = runtimeRole;
    runtimeUrl.password = config.runtimeRolePassword;
    const existing = await runStage("Owner connection and runtime role lookup", config.databaseUrl,
      sql("SELECT rolname FROM pg_roles WHERE rolname = $1", [runtimeRole]));
    if (existing.rows.length) {
      try {
        await neonRequest(runtimeUrl.href, sql("SELECT current_user"));
      } catch {
        throw new Error("The runtime role already exists. Supply its current credential to reuse it.");
      }
    }
  }
  const salt = randomHex(16);
  const passwordVerifier = await passwordHash(config.password, salt);
  const statements = [
    sql("SELECT pg_advisory_xact_lock(hashtext('naya_baazar.bootstrap'))"),
    sql("CREATE SCHEMA IF NOT EXISTS naya_baazar"),
    sql(`CREATE TABLE IF NOT EXISTS naya_baazar.admins (
      email text PRIMARY KEY,
      salt text NOT NULL CHECK (length(salt) = 32),
      password_hash text NOT NULL CHECK (length(password_hash) = 64)
    )`),
    sql(`CREATE TABLE IF NOT EXISTS naya_baazar.shops (
      id integer PRIMARY KEY,
      floor text NOT NULL,
      status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked')),
      version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((floor = 'ground' AND id BETWEEN 1 AND 108) OR (floor = 'first' AND id BETWEEN 112 AND 219))
    )`),
    sql(`CREATE TABLE IF NOT EXISTS naya_baazar.sessions (
      token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
      email text NOT NULL REFERENCES naya_baazar.admins(email) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`),
    sql("CREATE INDEX IF NOT EXISTS nb_sessions_expiry ON naya_baazar.sessions (expires_at)"),
    sql(`CREATE TABLE IF NOT EXISTS naya_baazar.login_limits (
      client_key text PRIMARY KEY,
      started_at timestamptz NOT NULL,
      attempts integer NOT NULL
    )`),
    sql("REVOKE ALL ON SCHEMA naya_baazar FROM PUBLIC"),
    sql("REVOKE ALL ON naya_baazar.admins, naya_baazar.shops, naya_baazar.sessions, naya_baazar.login_limits FROM PUBLIC"),
    sql("INSERT INTO naya_baazar.admins (email, salt, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
      [email, salt, passwordVerifier]),
    sql(`INSERT INTO naya_baazar.shops (id, floor)
      SELECT id, floor FROM jsonb_to_recordset($1::jsonb) AS plan(id integer, floor text)
      ON CONFLICT (id) DO NOTHING`, [JSON.stringify(plans.map(({ id, floor }) => ({ id, floor })))]),
  ];
  if (runtimeUrl) {
    statements.push(
      // Neon requires the original runtime credential when creating a LOGIN role.
      // Bind it over HTTPS, keep it transaction-local, and return only a boolean.
      sql("SELECT set_config('naya_baazar.bootstrap_password', $1, true) IS NOT NULL AS configured",
        [config.runtimeRolePassword]),
      sql(`DO $role$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'naya_baazar_app') THEN
            EXECUTE format('CREATE ROLE naya_baazar_app LOGIN NOINHERIT PASSWORD %L',
              current_setting('naya_baazar.bootstrap_password'));
          END IF;
        END;
      $role$`),
      sql("GRANT USAGE ON SCHEMA naya_baazar TO naya_baazar_app"),
      sql("GRANT SELECT (id, status, version), UPDATE (status, version, updated_at) ON naya_baazar.shops TO naya_baazar_app"),
      sql("GRANT SELECT (email, salt, password_hash) ON naya_baazar.admins TO naya_baazar_app"),
      sql("GRANT SELECT, INSERT, DELETE ON naya_baazar.sessions TO naya_baazar_app"),
      sql("GRANT SELECT, INSERT, UPDATE, DELETE ON naya_baazar.login_limits TO naya_baazar_app"),
    );
  }
  await runStage("Schema, inventory and permission transaction", config.databaseUrl, { queries: statements });
  const access = runtimeUrl?.href ?? config.databaseUrl;
  const current = await runStage("Runtime connection and account verification", access,
    sql("SELECT salt, password_hash FROM naya_baazar.admins WHERE email = $1", [email]));
  const admin = current.rows[0];
  if (!admin || await passwordHash(config.password, admin.salt) !== admin.password_hash) {
    throw new Error("The admin account already exists with a different password. Existing credentials were preserved.");
  }
  const inventory = await runStage("Seeded inventory verification", access, sql("SELECT id FROM naya_baazar.shops ORDER BY id"));
  if (inventory.rows.length !== 216 || inventory.rows.some(row => !numbers.has(Number(row.id)))) {
    throw new Error("The database inventory differs from the source plan.");
  }
  console.log(`Verified 216 shops and the admin account${runtimeUrl ? " using the scoped runtime role" : ""}.`);
}

bootstrap().catch(error => {
  // Do not print raw input, URLs, response bodies or nested fetch causes.
  console.error(error.code === "ERR_INVALID_URL" ? "Invalid database URL." : error.message);
  process.exitCode = 1;
});
