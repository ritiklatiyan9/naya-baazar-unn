# Naya Baazar

The homepage introduces Naya Baazar in Unn, Shamli. **Map Layout** in the header opens the interactive floor plans, with dimensions and availability for all 216 shops in the supplied drawing. The site also includes a 3D model, 16 architectural renders and a video walkthrough.

## Manage shop bookings

Choose **Manage shops** in the header and sign in with your staff account. Select a shop by number or from the plan, choose **Booked** (red) or **Available** (green), and save. Changes persist in Neon PostgreSQL. Other open viewers refresh on focus and every 30 seconds.

## Deploy to Vercel

1. Import the project repository into Vercel. Use the folder containing this README and `package.json` as the **Root Directory**. This is `naya-baazar` when importing the containing workspace, or `.` when importing this folder as the repository.
2. Select the **Next.js** preset and Node.js **24.x**. The included `vercel.json` runs `npm run build:vercel`. Keep the default output directory.
3. In **Settings → Environment Variables**, set the sensitive server-side variable `DATABASE_URL` to the connection string for the existing Neon database. Use the pooled TLS connection and a credential with access to the `naya_baazar` schema. Set it for **Production** and for each preview environment that should access inventory.
4. Deploy. Open **Manage shops** on the new domain and sign in using the existing staff account. Each deployment origin has its own sign-in cookie.

Using the same Neon database preserves existing bookings. Configure a different initialized database for preview deployments if they should carry independent booking data. The application runs the database setup only when the bootstrap script is explicitly called.

## Run the Vercel application locally

Use Node.js 24 and npm. From the project folder, run `npm ci`. Set `DATABASE_URL` in your shell environment or in an ignored `.env.local` file. Start the development server with `npm run dev:vercel`. For a production check, run the following commands.

```sh
npm run build:vercel
npm run start:vercel
```

The existing Worker deployment uses `npm run build` and `node scripts/preview.mjs`. Its preview accepts the connection string through the environment or a hidden terminal prompt. Use `node scripts/preview.mjs dev` for its development server.

## Initialize a new database

The existing project database already contains the staff account and shop inventory. For a fresh Neon database, `node scripts/bootstrap.mjs` creates the project schema and seeds missing shops. Pass `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` through the environment or enter a JSON object with `databaseUrl`, `email`, and `password` at the hidden terminal prompt. The optional `runtimeRolePassword` field provisions a restricted application role. Bootstrap preserves existing booking states and admin passwords.

Staff passwords use salted PBKDF2. Sessions use expiring HTTP-only cookies, and each booking change checks the shop version to protect concurrent edits.
