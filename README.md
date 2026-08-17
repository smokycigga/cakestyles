# 🎂 Cakestyles

A full bakery operating system: customer website with a shareable digital menu and online ordering, plus an admin platform for menu CMS, orders (every channel), customer CRM, custom-cake enquiries, invoices with PDF, expense tracking, and a business dashboard.

Built to run anywhere Node runs — locally with plain `npm run dev`, and in production on **Vercel + MongoDB Atlas** with no servers to manage.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, Recharts, jsPDF, framer-motion |
| Backend | Node.js, Express 5, Mongoose |
| Database | MongoDB (local instance for dev, Atlas free tier for production) |
| Payments | Razorpay (optional; offline UPI/cash/bank also supported) |
| Tests | Vitest |

## Local development

Prerequisites: **Node 20+** and a MongoDB to point at (a local instance or an Atlas cluster).

```bash
# 1. Configure environment
cp .env.example .env        # then edit MONGO_URI, JWT_SECRET, owner credentials

# 2. Install dependencies
npm install                 # server deps (root)
cd client && npm install    # client deps
cd ..

# 3. Seed the owner account + demo data
npm run seed

# 4. Run both dev servers (two terminals)
npm run dev                 # API on http://localhost:5000
cd client && npm run dev    # site on http://localhost:5173 (proxies /api)
```

Sign in at **http://localhost:5173/admin/login** with `OWNER_EMAIL` / `OWNER_PASSWORD` from your `.env`.

Run tests: `npm test`

## Deploying to Vercel

1. **Database**: create a free cluster on [MongoDB Atlas](https://cloud.mongodb.com). Add a database user, allow network access from anywhere (`0.0.0.0/0` — required because Vercel functions have rotating IPs), and copy the connection string.
2. **Push this repo to GitHub**.
3. **Import the repo on Vercel** — no special settings needed; `vercel.json` handles the build (`npm run build` → `client/dist`) and routes `/api/*` to the Express serverless function.
4. **Set environment variables** in Vercel → Project → Settings → Environment Variables:
   - `MONGO_URI` (Atlas connection string)
   - `JWT_SECRET` (long random string)
   - `OWNER_EMAIL`, `OWNER_PASSWORD` (used by the seed below)
   - optionally `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
5. **Create the owner account** — run the seed once against production:
   ```bash
   MONGO_URI="<your-atlas-uri>" OWNER_EMAIL=you@yourshop.com OWNER_PASSWORD=... npm run seed
   ```
6. Visit `https://your-app.vercel.app/admin/login` and configure your store (Admin → Settings): name, address, hours, delivery zones, pickup slots, tax, payment methods.

Razorpay online payments: add test keys to the env, enable "Online payment" in Admin → Settings, and add `VITE_RAZORPAY_KEY_ID` is **not** needed — the key is passed to the browser via the payment API.

## Feature map (P0 MVP)

**Customer website** — Home, digital menu (shareable URL + QR), product pages with variants/add-ons/customisation, cart (persists across refreshes), checkout with pickup/delivery + slots + prep-time validation, online (Razorpay) or offline payment, order confirmation with tracking number, order tracking page, custom-cake enquiry form, About/Contact, SEO metadata + product structured data.

**Admin platform** — Dashboard (sales/orders/AOV/new-vs-repeat/outstanding/expenses/profit + trend, channel, product, expense charts + date filters), Orders (table + status board, detail with timeline & payments, manual orders for Instagram/WhatsApp/phone/walk-in with custom line items and deposits), Products CMS (variants, add-ons, availability, orderability, featured, tags, prep time, SEO, internal notes, image upload with compression, duplicate, bulk price/visibility, CSV import/export, draft/publish/schedule/archive), Menu manager (categories, ordering, QR/share link), CRM (profiles, metrics, tags, notes, full timeline, CSV export), Enquiry pipeline (statuses, quote → convert to order with deposit), Invoices (from orders or standalone, payments, deposits/balance, jsPDF download, statuses, numbering via settings), Expenses (categories, vendors, receipts, recurring flags, summaries), Reports (6 CSV exports with date filters), Users & roles (owner/manager/staff/accounts), Audit log.

**Integrity rules enforced** (PRD §22): order/invoice lines snapshot prices at transaction time; product edits never rewrite history; server recomputes all totals from database prices; archiving never deletes; every financially meaningful change is audited with actor + timestamp; reporting uses Asia/Kolkata boundaries and INR.

## Security

- Server-enforced role permissions on every admin route (UI hiding is convenience only).
- bcrypt password hashing, JWT sessions (7-day expiry), login rate limiting.
- zod validation on all writes; client-supplied prices are never trusted.
- Register endpoint removed — owner is seeded, further users created in Admin → Users.

## Project structure

```
├── api/index.js          # Vercel serverless entry (mounts the Express app)
├── server/
│   ├── app.js            # Express app (all routes under /api)
│   ├── index.js          # Local dev entry (connect DB + listen :5000)
│   ├── config/           # db, constants
│   ├── models/           # User, Customer, Category, Product, Media, Order,
│   │                     # Enquiry, Invoice, Expense, AuditLog, Setting, Counter
│   ├── controllers/      # one per resource
│   ├── middleware/       # auth (protect/requirePerm), permissions, validate
│   ├── utils/            # pricing, dates (IST), numbers, csv, audit, notify
│   ├── seed/seed.js      # owner + demo data
│   └── tests/            # vitest suites
├── client/
│   ├── src/lib/          # api client, formatting, image compression, enums
│   ├── src/store/        # Cart / Settings / Auth contexts
│   ├── src/components/   # public/ + admin/ shared UI
│   └── src/pages/        # public pages + admin/ pages
└── vercel.json           # build + /api rewrite + SPA fallback
```

## Deferred (per PRD §5/§27)

Coupons/gift cards, WhatsApp automation, segmentation campaigns, recipe-level COGS, ingredient inventory, accounting integrations, Zomato/Swiggy, customer accounts, native app.
