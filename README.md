# MAAF Transport QR Management System

A TypeScript and Next.js App Router application for public transport information, Admin and Agent portals, QR identities, vehicle verification, and centralized MariaDB records.

## MariaDB setup

Create the database and an application user in MariaDB (use your own strong password):

```sql
CREATE DATABASE maaf_transport CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'maaf_app'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES ON maaf_transport.* TO 'maaf_app'@'localhost';
```

Copy `.env.example` to `.env.local` and enter the connection values. Then install and initialize:

```bash
npm install
npm run db:setup
npm run dev
```

The app creates the MariaDB tables for users, vehicles, and sessions. In development, if those role accounts do not exist yet, it adds these local demo users:

- Admin: `admin@maaf.local` / `Admin123!`
- Agent: `agent@maaf.local` / `Agent123!`

Change these demo passwords before using non-local environments. Production accounts are not seeded with demo credentials.

## Create additional portal users

Create one admin or agent account using the CLI. The password is requested interactively (or set `MAAF_NEW_USER_PASSWORD` for scripted setup):

```bash
npm run user:create -- --role=agent --email=agent2@example.com --name="Field Agent 2"
```

The account must choose the matching Admin or Agent login page. Direct dashboard access requires a valid session. Signing out revokes the matching MariaDB session.

## Run locally

Requires Node.js 20.9 or later and an accessible MariaDB server.

```bash
npm run dev
```

Open `http://localhost:3000`. Admin Portal login is at `/admin/login`; Agent Portal login is at `/agent/login`.

## Data and security

Vehicle data is stored in MariaDB. Passwords use Node.js scrypt hashes. Session cookies are HttpOnly, SameSite=Lax, and Secure in production; their random token hashes are stored in MariaDB and checked on protected requests. Admin-only vehicle registration and agent verification permissions are enforced by the API.
