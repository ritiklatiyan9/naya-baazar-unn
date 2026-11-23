# Naya Baazar

The landing page opens the interactive shop plan for Naya Baazar in Unn, Shamli. Both vector plans and all 216 shop dimension records come from the supplied four-page drawing. The gallery uses the 16 project renders. The walkthrough is a short film assembled from those renders.

## Staff access

Use **Staff login** in the footer. Once signed in, select a shop on the plan or search by its original number in **Manage shops**. Choose **Booked** or **Available** and save. The current layout updates immediately. Other open viewers refresh on focus and every 30 seconds. New inventory starts available.

## Run locally

Use Node 22.13 or later and npm. From this folder run:

```sh
npm ci
npm run build
node scripts/preview.mjs
```

The preview prompts privately for a Neon connection string. It also accepts the `DATABASE_URL` environment variable. Use the local address printed by the server. For development with live reload use `node scripts/preview.mjs dev`.

## Database

`node scripts/bootstrap.mjs` creates the project's PostgreSQL schema and seeds missing shops. Supply `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` through the process environment, or provide a single JSON object with `databaseUrl`, `email`, and `password` at its hidden terminal prompt. The optional `runtimeRolePassword` provisions a restricted PostgreSQL role for the running app. Bootstrap preserves existing booking states and admin passwords.

The server reads its database connection from `DATABASE_URL`. Store the production value as a runtime secret. Passwords in PostgreSQL use salted PBKDF2. Staff sessions use expiring HTTP-only cookies, and each availability write checks the shop's current version.
