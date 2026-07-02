# FairShare

FairShare is a bill-splitting web app. Snap a photo of a receipt, let OCR + an LLM turn it into structured line items, assign each item to the people who ordered it, and get an exact per-person total (including a fair share of tax).

## How it works

1. **Upload** a photo of a receipt (multi-page bills are supported).
2. **OCR** ([EasyOCR](https://github.com/JaidedAI/EasyOCR)) extracts raw text from the image.
3. **LLM parsing** (OpenAI, `gpt-4o-mini` by default) turns the raw OCR text into clean structured items — stripping headers/footers, totals, optional charges, and fixing common OCR mistakes (misread currency symbols, garbled quantities, duplicated/split lines, etc.).
4. **Assign** each item to one or more people, splitting it equally, by percentage, or by custom amount.
5. **Calculate** — tax is split evenly across everyone, item costs are split per the assignments, and a final rounding pass ensures individual totals always add up to the bill's grand total.

## Tech stack

**Backend** — Python / Flask
- `flask`, `flask-cors` — REST API
- `easyocr` — receipt text extraction
- `openai` — LLM-based receipt parsing
- `PyJWT`, `bcrypt` — authentication (access + refresh tokens, hashed passwords)
- `sqlite3` — storage (no external DB required)

**Frontend** — React / TypeScript
- `vite` — build tooling
- `@mantine/core`, `@mantine/notifications` — UI components
- `react-router-dom` — routing
- `zustand` — client state (auth + active bill)
- `axios` — API client
- `react-dropzone` — receipt image upload

## Project structure

```
FairShare/
├── backend/
│   ├── run.py                  # entry point (flask dev server, port 5000)
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py         # app factory, CORS, global JWT auth guard
│   │   ├── config.py           # env-based configuration
│   │   ├── database.py         # SQLite schema + migrations
│   │   ├── routes/             # auth, bills, persons, assignments, calculate, ocr, health
│   │   ├── services/           # auth_service, ocr_service, llm_service, split_service
│   │   └── middleware/         # per-route auth decorator
│   ├── data/                   # SQLite database file (gitignored)
│   └── uploads/                # uploaded receipt images (gitignored)
└── frontend/
    ├── src/
    │   ├── pages/               # HomePage, BillPage, LoginPage, RegisterPage
    │   ├── api/                 # axios wrappers per resource
    │   ├── store/                # zustand stores (auth, bill)
    │   ├── components/, hooks/, utils/, types/
    │   └── App.tsx               # routing + protected layout
    └── package.json
```

## Getting started

### Prerequisites
- Python 3.10+
- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys) (for receipt parsing)

### Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows (use `source .venv/bin/activate` on macOS/Linux)
pip install -r requirements.txt
```

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```ini
DATABASE_PATH=data/fairshare.db
UPLOAD_FOLDER=uploads
FLASK_DEBUG=true

# Auth — change JWT_SECRET to a long random string in production
JWT_SECRET=CHANGE-THIS-IN-PRODUCTION
JWT_ACCESS_EXPIRY=900
JWT_REFRESH_EXPIRY=604800

# Required for receipt parsing
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Run the server:

```bash
python run.py
```

The API is served at `http://localhost:5000/api`. The SQLite database is created automatically on first run, along with a seeded default account (`admin@admin.com` / `admin123`) for local testing.

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` by default and proxies API calls to the Flask backend.

### Other frontend scripts

```bash
npm run build     # type-check and build for production
npm run lint       # run ESLint
npm run preview    # preview the production build locally
```

## API overview

All routes are prefixed with `/api`. Except for `auth/register`, `auth/login`, `auth/refresh`, and the `health` endpoints, every route requires a `Bearer` access token.

| Resource | Routes |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` |
| Bills | `GET/POST /bills`, `GET/PATCH/DELETE /bills/:id`, image upload/replace/delete under `/bills/:id/images/:filename` |
| Items | `GET/POST/DELETE /bills/:id/items`, `PATCH/DELETE /items/:id` |
| Persons | `GET/POST /bills/:id/persons`, `DELETE /persons/:id` |
| Assignments | `GET /bills/:id/assignments`, `PUT/DELETE /items/:id/assignments`, `PUT/DELETE /bills/:id/assignments/person/:id` |
| OCR | `POST /ocr/upload` — runs OCR + LLM parsing on an uploaded receipt image |
| Calculate | `POST /bills/:id/calculate`, `GET /bills/:id/results` |
| Health | `GET /health`, `GET /health/llm` |

## Data model

SQLite tables: `users`, `bills`, `persons`, `bill_items`, `item_assignments`, `calculation_results`. Each bill belongs to a user; each item can be split `equal`, `percentage`, or `custom` among assigned persons; tax lines are always split evenly across all persons on the bill.

## Security notes

- Passwords are hashed with `bcrypt`.
- Auth uses short-lived JWT access tokens (15 min default) plus longer-lived refresh tokens (7 days default).
- Set a strong, random `JWT_SECRET` before deploying — the default value is only safe for local development.
- The seeded `admin@admin.com` account exists for local development convenience only; remove or change it before deploying anywhere reachable by others.
