# Project Invite by Email — Complete Setup Guide

## Overview

This guide covers the **Project Invite by Email** feature added to the Todo application. Users can create projects, invite others by email, and accept invitations through a secure link. Emails are sent via Gmail SMTP through a BullMQ background worker.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 16 (App Router) | Frontend + API routes |
| Redis | User auth data, todo data, BullMQ job queue |
| MongoDB (Mongoose) | Projects, members, invites |
| BullMQ | Background job queue for sending emails |
| Nodemailer | Email delivery via Gmail SMTP |
| JWT | Authentication tokens |
| bcryptjs | Password hashing |

---

## Folder Structure

```
bullmq-learning/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.js          # POST /api/auth/login
│   │   │   └── register/route.js       # POST /api/auth/register
│   │   ├── email/route.js              # POST /api/email (generic email queue)
│   │   ├── invite/
│   │   │   ├── [token]/route.js        # GET /api/invite/:token (validate invite)
│   │   │   └── accept/route.js         # POST /api/invite/accept (accept invite)
│   │   ├── projects/
│   │   │   ├── route.js                # GET/POST /api/projects
│   │   │   └── [projectId]/
│   │   │       └── invite/route.js     # POST /api/projects/:id/invite
│   │   └── todos/route.js              # GET/POST/PUT/DELETE /api/todos
│   ├── invite/
│   │   └── [token]/page.js             # /invite/:token (accept invite page)
│   ├── todos/page.js                   # /todos (main dashboard)
│   ├── page.js                         # / (login/register)
│   ├── layout.js                       # Root layout
│   └── globals.css                     # All styles
├── lib/
│   ├── auth.js                         # JWT generate/verify
│   ├── email.js                        # Nodemailer transport + sendInviteEmail
│   ├── getUserFromRequest.js           # Reusable auth helper
│   ├── mongodb.js                      # Mongoose connection (cached)
│   ├── queue.js                        # BullMQ queue setup
│   └── redis.js                        # IORedis connection
├── models/
│   ├── Invite.js                       # Invite schema
│   ├── Project.js                      # Project schema
│   ├── ProjectMember.js                # ProjectMember schema
│   └── User.js                         # User schema (MongoDB)
├── workers/
│   └── email.worker.js                 # BullMQ worker (sends emails)
├── .env.local                          # Environment variables
└── package.json                        # Dependencies
```

---

## Prerequisites

1. **Node.js** — v18 or higher
2. **Redis** — running on `127.0.0.1:6379`
3. **MongoDB** — running on `localhost:27017`
4. **Gmail account** — with 2FA enabled and an App Password generated

---

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

Installed packages:
- `mongoose` — MongoDB ODM
- `nodemailer` — Email sending
- `bullmq` — Job queue (already installed)
- `ioredis` — Redis client (already installed)

### 2. Configure Environment Variables

Edit `.env.local`:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=your-secret-key
MONGO_URI=mongodb://localhost:27017/todo-app

# Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-digit-app-password
EMAIL_FROM=your-email@gmail.com
```

### 3. Generate Gmail App Password

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Select **Mail** and **Other (Custom name)** → name it "Todo App"
5. Copy the 16-character password (e.g., `puco eeqm afrx wjio`)
6. Paste it as `SMTP_PASS` in `.env.local`

> **Important:** Use the App Password, NOT your regular Gmail password.

### 4. Start Services

Open 3 terminals:

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — BullMQ email worker
npm run worker

# Terminal 3 — Redis (if not running as service)
redis-server

# Terminal 4 — MongoDB (if not running as service)
mongod
```

### 5. Verify SMTP Connection

When the worker starts, you should see:

```
Email worker started. Waiting for jobs...
Gmail SMTP connected successfully
```

If you see an error, check your SMTP credentials.

---

## Database Models

### User (MongoDB)

```javascript
{
  name: String,          // User's display name
  email: String,         // Unique, lowercase
  redisUserId: Number,   // Link to Redis user ID (nullable)
  timestamps: true
}
```

### Project (MongoDB)

```javascript
{
  name: String,          // Project name
  description: String,   // Optional description
  ownerId: ObjectId,     // Reference to User (owner)
  timestamps: true
}
```

### ProjectMember (MongoDB)

```javascript
{
  projectId: ObjectId,   // Reference to Project
  userId: ObjectId,      // Reference to User
  role: String,          // "owner" or "member"
  timestamps: true
}
// Compound unique index on (projectId, userId) — prevents duplicates
```

### Invite (MongoDB)

```javascript
{
  projectId: ObjectId,   // Reference to Project
  email: String,         // Invitee's email
  token: String,         // Secure random token (unique)
  invitedBy: ObjectId,   // Reference to User (inviter)
  status: String,        // "pending", "accepted", "expired"
  expiresAt: Date,       // 7 days from creation
  timestamps: true
}
// TTL index on expiresAt — auto-deletes expired invites
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | `{ name, email, password }` | Create account |
| POST | `/api/auth/login` | `{ email, password }` | Login, get JWT |

### Todos

| Method | Endpoint | Body/Params | Description |
|--------|----------|-------------|-------------|
| GET | `/api/todos` | — | Get all todos |
| POST | `/api/todos` | `{ text }` | Create todo |
| PUT | `/api/todos` | `{ id, text, done }` | Update todo |
| DELETE | `/api/todos?id=X` | — | Delete todo |

### Projects

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | — | List user's projects |
| POST | `/api/projects` | `{ name, description }` | Create project |

### Invites

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/projects/:projectId/invite` | `{ email }` | Send invite |
| GET | `/api/invite/:token` | — | Validate invite token |
| POST | `/api/invite/accept` | `{ token }` | Accept invite |

---

## How the Invite Flow Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User A creates a project                                    │
│     POST /api/projects                                          │
│     → Project + ProjectMember (role: owner) created in MongoDB  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. User A invites User B by email                              │
│     POST /api/projects/:id/invite { email: "bob@test.com" }     │
│     → Finds or creates User B in MongoDB                        │
│     → Checks not already a member                               │
│     → Checks no existing pending invite                         │
│     → Creates Invite document (token, status: pending)          │
│     → Adds job to BullMQ emailQueue                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Worker picks up the job                                     │
│     npm run worker                                              │
│     → Connects to Gmail SMTP                                    │
│     → Sends HTML email with /invite/:token link                 │
│     → Logs success/failure to console                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. User B receives email                                       │
│     → Clicks "Accept Invitation" button                         │
│     → Navigates to /invite/:token                               │
│     → Page fetches invite details from GET /api/invite/:token   │
│     → Shows project name, inviter name, Accept button           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. User B accepts                                              │
│     POST /api/invite/accept { token }                           │
│     → Validates token, checks expiry                            │
│     → Creates or finds User B in MongoDB                        │
│     → Creates ProjectMember (role: member)                      │
│     → Updates Invite status to "accepted"                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Duplicate Prevention

The system prevents duplicates at multiple levels:

1. **ProjectMember unique index** — `(projectId, userId)` compound index ensures a user can't be added twice
2. **Pending invite check** — Before creating a new invite, checks if a pending (non-expired) invite already exists for that email + project
3. **Member check** — Before inviting, checks if the user is already a project member

---

## Error Handling

| Error | Status | Cause |
|-------|--------|-------|
| "Unauthorized" | 401 | Missing or invalid JWT token |
| "Project not found" | 404 | Invalid projectId |
| "Only the project owner can send invites" | 403 | Non-owner trying to invite |
| "User is already a member" | 409 | Duplicate membership |
| "A pending invite already exists" | 409 | Duplicate pending invite |
| "Invalid invite token" | 404 | Token doesn't exist |
| "This invite has expired" | 410 | Token older than 7 days |
| "This invite has already been accepted" | 410 | Invite already used |
| "SMTP connection failed" | — | Bad Gmail credentials |

---

## Testing Checklist

### Prerequisites
- [ ] Redis running on port 6379
- [ ] MongoDB running on port 27017
- [ ] Gmail App Password generated
- [ ] `.env.local` configured with real credentials

### Step-by-Step Test

1. **Start the app:** `npm run dev`
2. **Start the worker:** `npm run worker`
3. **Verify SMTP:** Worker logs `Gmail SMTP connected successfully`
4. **Register a user:** Sign up at `http://localhost:3000`
5. **Create a project:** Use the "Create Project" form on `/todos`
6. **Send an invite:** Enter an email and click "Send Invite"
7. **Check worker logs:** Should show `Invite email sent in XXXms`
8. **Check inbox:** Recipient gets the invitation email
9. **Click link:** Opens `/invite/:token` page
10. **Accept invite:** Click "Accept Invitation"
11. **Verify:** User is now a project member

### Reset Test Data

```bash
mongosh
use todo-app
db.users.deleteMany({})
db.projects.deleteMany({})
db.projectmembers.deleteMany({})
db.invites.deleteMany({})
```

---

## Troubleshooting

### "Missing credentials for PLAIN"
- **Cause:** SMTP_USER or SMTP_PASS is empty in `.env.local`
- **Fix:** Fill in your Gmail address and App Password

### "SMTP connection verification failed"
- **Cause:** Wrong App Password or 2FA not enabled
- **Fix:** Generate a new App Password at https://myaccount.google.com/apppasswords

### "User already exists" after deleting from MongoDB
- **Cause:** Old Invite records still exist
- **Fix:** Delete old invites: `db.invites.deleteMany({})`

### Worker not sending emails
- **Check:** Is the worker running? (`npm run worker`)
- **Check:** Is Redis running?
- **Check:** Worker console for error messages

### Invite page shows "Invalid invite token"
- **Cause:** Token was deleted or never created
- **Fix:** Send a new invite

---

## Key Files Explained

| File | Purpose |
|------|---------|
| `lib/mongodb.js` | Cached Mongoose connection — prevents multiple connections |
| `lib/email.js` | Gmail SMTP transport + HTML email template |
| `lib/queue.js` | BullMQ queue with rate limiting (5 jobs/sec) |
| `lib/redis.js` | IORedis connection for auth + BullMQ |
| `lib/auth.js` | JWT token generation and verification |
| `lib/getUserFromRequest.js` | Extracts user from Authorization header |
| `models/*.js` | Mongoose schemas with indexes and validations |
| `workers/email.worker.js` | Processes email jobs (concurrency: 3) |
| `app/api/projects/[projectId]/invite/route.js` | Core invite logic |
| `app/api/invite/accept/route.js` | Accept invite + create membership |
| `app/invite/[token]/page.js` | Frontend invite acceptance page |
| `app/todos/page.js` | Dashboard with project + invite forms |
