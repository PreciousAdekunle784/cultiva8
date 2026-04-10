# 🌱 Cultiv8 — Backend API

**Carbon Credits & Post-Harvest Intelligence for Nigerian Smallholder Farmers**

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
node server.js

# 3. Open in browser
# API docs: http://localhost:3000/api
# Health:   http://localhost:3000/api/health
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | SQLite (via sql.js — pure JS, zero native deps) |
| Auth | JWT (jsonwebtoken) + bcrypt password hashing |
| Weather | Open-Meteo API (free, no key required) |
| CORS | Enabled for all origins |

## Project Structure

```
cultiv8-backend/
├── server.js              # Express entry point
├── database.js            # SQLite init, schema, helpers
├── .env                   # Config (JWT secret, port, etc.)
├── package.json
├── middleware/
│   └── auth.js            # JWT verification middleware
├── routes/
│   ├── auth.js            # Signup, login, Google auth, profile
│   ├── farms.js           # Farm CRUD + carbon calculation
│   ├── storage.js         # Storage logging, spoilage, weather, buyers
│   └── dashboard.js       # Dashboard, activities, alerts, marketplace
└── public/
    ├── api-client.js      # Frontend JS SDK (drop into your HTML)
    └── (your frontend files go here)
```

## Database Schema

**7 tables:**

- `users` — id, name, email, location, avatar, provider, password_hash, google_picture
- `farms` — id, user_id, name, size, crop, lat, lng, practices, total_carbon, breakdown, ndvi, soc
- `storage` — id, user_id, crop, qty, method, lat, lng, weather, spoilage
- `activities` — id, user_id, message, color, created_at
- `alerts` — id, user_id, message, type, is_read, created_at
- `carbon_transactions` — id, user_id, farm_id, buyer_name, tonnes, price_per_tonne, total_ngn, status
- `buyer_contacts` — id, user_id, storage_id, buyer_name, buyer_type, status

## API Endpoints

### Auth
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/signup` | Create account | No |
| POST | `/api/auth/login` | Sign in | No |
| POST | `/api/auth/google` | Google Sign-In | No |
| GET | `/api/auth/me` | Get profile | Yes |
| PUT | `/api/auth/profile` | Update profile | Yes |

### Farms
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/farms` | List all farms | Yes |
| POST | `/api/farms` | Register farm | Yes |
| GET | `/api/farms/:id` | Get farm detail | Yes |
| PUT | `/api/farms/:id` | Update farm | Yes |
| DELETE | `/api/farms/:id` | Delete farm | Yes |
| GET | `/api/farms/stats/summary` | Carbon stats | Yes |

### Storage & Post-Harvest
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/storage` | List storage | Yes |
| POST | `/api/storage` | Log produce | Yes |
| DELETE | `/api/storage/:id` | Delete entry | Yes |
| GET | `/api/storage/weather?lat=&lng=` | Get weather | Yes |
| GET | `/api/storage/spoilage-all` | All spoilage | Yes |
| GET | `/api/storage/buyers` | Matched buyers | Yes |
| POST | `/api/storage/contact-buyer` | Contact buyer | Yes |
| GET | `/api/storage/stats` | Storage stats | Yes |

### Dashboard & Marketplace
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard` | Full dashboard | Yes |
| GET | `/api/activities` | Activity feed | Yes |
| GET | `/api/alerts` | Active alerts | Yes |
| PUT | `/api/alerts/:id/read` | Mark read | Yes |
| GET | `/api/marketplace` | Marketplace | Yes |
| POST | `/api/marketplace/sell` | Sell credits | Yes |

## Connecting Your Frontend

1. Copy your frontend files into the `public/` folder
2. Add `<script src="api-client.js"></script>` to your HTML
3. Replace localStorage auth calls with `api.login()`, `api.signup()`, etc.
4. Replace data calls with `api.getDashboard()`, `api.createFarm()`, etc.

Example:
```javascript
// Old (localStorage)
const user = await AuthManager.signIn(email, password);

// New (backend API)
const user = await api.login(email, password);
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| JWT_SECRET | (set in .env) | Token signing key |
| JWT_EXPIRES_IN | 7d | Token expiry |
| DB_PATH | ./cultiv8.db | SQLite file path |
| GOOGLE_CLIENT_ID | (set in .env) | Google OAuth client ID |

## Features

- **Zero-cost deployment** — SQLite file-based DB, no external services needed
- **Real weather data** — Open-Meteo API (free, no key)
- **IPCC carbon estimation** — Tier 1 emission factors built in
- **FAO spoilage models** — 10 Nigerian crop types calibrated
- **JWT auth** — Secure, stateless authentication
- **Google Sign-In** — One-tap OAuth support
- **Auto-persisting DB** — SQLite saves to disk on every write
