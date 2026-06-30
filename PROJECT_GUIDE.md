# Complete Project Guide - Todo List with BullMQ

## Table of Contents

1. [Project Overview](#project-overview)
2. [How It All Connects](#how-it-all-connects)
3. [File-by-File Guide](#file-by-file-guide)
4. [Application Flow](#application-flow)
5. [Redis Data Structure](#redis-data-structure)
6. [BullMQ and Worker Explained](#bullmq-and-worker-explained)

---

## Project Overview

This is a **Todo List app** where:
- Users can register and login
- Each user sees only their own todos
- Users can add, complete, and delete todos
- Users can send email notifications (processed in background)

**Tech Stack:**
- **Next.js** - Frontend (React) + Backend (API Routes)
- **Redis** - Database (stores users and todos)
- **BullMQ** - Job queue for email sending
- **Worker** - Background process that sends emails

---

## How It All Connects

```
┌──────────────────────────────────────────────────────────────┐
│                     YOUR BROWSER                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  Login/Register  │  │  Todo Dashboard  │                   │
│  │    (page.js)     │  │  (todos/page.js) │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                              │
│           │  fetch("/api/...") │                              │
│           └────────┬───────────┘                              │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   NEXT.JS SERVER                             │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   API ROUTES                         │    │
│  │                                                      │    │
│  │  /api/auth/register  →  Creates user in Redis       │    │
│  │  /api/auth/login     →  Verifies user, returns JWT  │    │
│  │  /api/todos          →  CRUD operations on Redis    │    │
│  │  /api/email          →  Adds job to BullMQ queue    │    │
│  └───────────┬──────────────┬───────────────┬──────────┘    │
│              │              │               │                │
│              ▼              ▼               ▼                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     Redis     │  │     Redis     │  │   BullMQ     │      │
│  │  (users)      │  │  (todos)      │  │   (queue)    │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
└──────────────────────────────────────────────┼───────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │    EMAIL WORKER      │
                                    │  (separate process)  │
                                    │                      │
                                    │  Picks jobs from     │
                                    │  queue and processes │
                                    └─────────────────────┘
```

---

## File-by-File Guide

### 1. Configuration Files

#### `.env.local`
```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=todo-app-secret-key-123
```

**What it does:** Stores environment variables (secret settings).

- `REDIS_HOST` - Where Redis is running (your computer)
- `REDIS_PORT` - Which port Redis uses (default 6379)
- `JWT_SECRET` - Secret key for signing login tokens (keep this safe!)

---

#### `package.json`
```json
{
  "scripts": {
    "dev": "next dev",
    "worker": "node workers/email.worker.js"
  },
  "dependencies": {
    "next": "16.2.9",
    "react": "19.2.4",
    "ioredis": "5.11.1",
    "bullmq": "5.79.2",
    "jsonwebtoken": "9.0.3",
    "bcryptjs": "3.0.3"
  }
}
```

**What it does:** Defines project scripts and dependencies.

- `npm run dev` - Starts the Next.js app
- `npm run worker` - Starts the email worker

**Dependencies:**
| Package | Purpose |
|---------|---------|
| next | React framework (frontend + API) |
| react | UI library |
| ioredis | Redis client (connects to Redis) |
| bullmq | Job queue system |
| jsonwebtoken | Creates/verifies login tokens |
| bcryptjs | Hashes passwords (security) |

---

### 2. Library Files (`lib/`)

#### `lib/redis.js`
```javascript
const IORedis = require("ioredis");

const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

module.exports = connection;
```

**What it does:** Creates a connection to Redis.

**How it works:**
1. Reads Redis host and port from `.env.local`
2. Creates a connection using `ioredis` library
3. Exports the connection for other files to use

**Used by:**
- `lib/queue.js` - BullMQ needs Redis connection
- `app/api/auth/register/route.js` - Store user data
- `app/api/auth/login/route.js` - Read user data
- `app/api/todos/route.js` - Store/read todos
- `workers/email.worker.js` - Worker connects to same Redis

---

#### `lib/auth.js`
```javascript
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "todo-app-secret-key-123";

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, {
    expiresIn: "24h",
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
```

**What it does:** Creates and verifies login tokens (JWT).

**How JWT works:**
1. When user logs in, server creates a token with user's ID and email
2. Token is sent to browser and stored in `localStorage`
3. Browser sends token with every request
4. Server verifies token to know who is making the request

**Two functions:**
- `generateToken(user)` - Creates a new token (expires in 24 hours)
- `verifyToken(token)` - Checks if token is valid

**Used by:**
- `app/api/auth/register/route.js` - Generate token after registration
- `app/api/auth/login/route.js` - Generate token after login
- `app/api/todos/route.js` - Verify token on every request
- `app/api/email/route.js` - Verify token on every request

---

#### `lib/queue.js`
```javascript
const { Queue } = require("bullmq");
const connection = require("./redis");

const emailQueue = new Queue("emailQueue", {
  connection,
  limiter: {
    max: 5,
    duration: 1000,
  },
});

module.exports = emailQueue;
```

**What it does:** Creates a BullMQ queue for email jobs.

**How BullMQ works:**
1. **Queue** - Where jobs wait to be processed
2. **Worker** - Processes jobs from the queue
3. **Job** - A unit of work (e.g., "send this email")

**Rate limiter:**
- `max: 5` - Maximum 5 jobs
- `duration: 1000` - Per 1 second
- This prevents spamming emails too fast

**Used by:**
- `app/api/email/route.js` - Adds jobs to this queue

---

### 3. API Routes (`app/api/`)

#### `app/api/auth/register/route.js`

**What it does:** Creates a new user account.

**Flow:**
```
Browser sends: { name, email, password }
        │
        ▼
┌─────────────────────────────────┐
│ 1. Check if email exists        │
│    → Return error if exists     │
│                                 │
│ 2. Generate unique user ID      │
│    → Uses Redis INCR command    │
│                                 │
│ 3. Hash password                │
│    → "password123" becomes      │
│       "$2a$10$..." (encrypted)  │
│                                 │
│ 4. Save user to Redis           │
│    → user:{id} = { name, email, │
│       password }                │
│                                 │
│ 5. Save email-to-ID mapping     │
│    → user:email:{email} = id    │
│                                 │
│ 6. Generate JWT token           │
│    → For automatic login        │
└─────────────────────────────────┘
        │
        ▼
Returns: { token, user: { id, name, email } }
```

**Redis keys created:**
- `user:1` → Hash: `{ id: "1", name: "John", email: "john@test.com", password: "..." }`
- `user:email:john@test.com` → String: `"1"`
- `user:id_counter` → Number: `1`

---

#### `app/api/auth/login/route.js`

**What it does:** Verifies user credentials and logs them in.

**Flow:**
```
Browser sends: { email, password }
        │
        ▼
┌─────────────────────────────────┐
│ 1. Find user by email           │
│    → user:email:{email} = id    │
│                                 │
│ 2. Get user data                │
│    → user:{id} = { password }   │
│                                 │
│ 3. Compare password             │
│    → bcrypt.compare(input, hash)│
│                                 │
│ 4. Generate JWT token           │
└─────────────────────────────────┘
        │
        ▼
Returns: { token, user: { id, name, email } }
```

---

#### `app/api/todos/route.js`

**What it does:** Handles all todo operations (CRUD).

**4 Operations:**

##### GET - Fetch all todos
```
Request: GET /api/todos
Headers: Authorization: Bearer {token}
        │
        ▼
┌─────────────────────────────────┐
│ 1. Verify JWT token             │
│    → Get user ID from token     │
│                                 │
│ 2. Get all todo IDs             │
│    → SMEMBERS todos:{userId}    │
│                                 │
│ 3. Get each todo's data         │
│    → HGETALL todo:{userId}:{id} │
│                                 │
│ 4. Sort by newest first         │
└─────────────────────────────────┘
        │
        ▼
Returns: { todos: [{ id, text, done, createdAt }] }
```

##### POST - Create a todo
```
Request: POST /api/todos
Body: { text: "Buy groceries" }
        │
        ▼
┌─────────────────────────────────┐
│ 1. Generate todo ID             │
│    → INCR todos:id_counter:{id} │
│                                 │
│ 2. Save todo as hash            │
│    → todo:{userId}:{todoId} =   │
│       { id, text, done, date }  │
│                                 │
│ 3. Add ID to user's todo set    │
│    → SADD todos:{userId} {id}   │
└─────────────────────────────────┘
        │
        ▼
Returns: { todo: { id, text, done: false, createdAt } }
```

##### PUT - Update a todo (toggle done)
```
Request: PUT /api/todos
Body: { id: 1, done: true }
        │
        ▼
┌─────────────────────────────────┐
│ 1. Check todo exists            │
│    → EXISTS todo:{userId}:{id}  │
│                                 │
│ 2. Update the field             │
│    → HSET todo:{userId}:{id}    │
│       done "true"               │
└─────────────────────────────────┘
```

##### DELETE - Delete a todo
```
Request: DELETE /api/todos?id=1
        │
        ▼
┌─────────────────────────────────┐
│ 1. Check todo exists            │
│                                 │
│ 2. Delete todo hash             │
│    → DEL todo:{userId}:{id}     │
│                                 │
│ 3. Remove ID from user's set    │
│    → SREM todos:{userId} {id}   │
└─────────────────────────────────┘
```

---

#### `app/api/email/route.js`

**What it does:** Adds an email job to the BullMQ queue.

**Flow:**
```
Browser sends: { subject, message }
        │
        ▼
┌─────────────────────────────────┐
│ 1. Verify JWT token             │
│                                 │
│ 2. Add job to queue             │
│    → emailQueue.add("sendEmail",│
│       { email, subject, message │
│       })                        │
│                                 │
│ 3. Job waits in Redis queue     │
└─────────────────────────────────┘
        │
        ▼
Returns: { jobId: 1 }
```

**Important:** The email is NOT sent here. It's just added to a queue. The worker will process it later.

---

### 4. Worker File

#### `workers/email.worker.js`

**What it does:** Processes email jobs from the queue.

**This runs as a SEPARATE process** (Terminal 2).

**Flow:**
```
┌─────────────────────────────────┐
│ Worker starts and listens       │
│ to "emailQueue"                 │
└─────────────────────────────────┘
        │
        │  (waits for jobs...)
        │
        ▼
┌─────────────────────────────────┐
│ Job arrives in queue            │
│ Job 1: { email, subject, msg }  │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Worker picks up job             │
│                                 │
│ console.log:                    │
│ "Job 1 Processing..."           │
│ "To: john@test.com"             │
│ "Subject: Test Email"           │
│                                 │
│ (simulates sending - 3 sec)     │
│                                 │
│ console.log:                    │
│ "Job 1 Email Sent in 3001ms"    │
└─────────────────────────────────┘
```

**Worker settings:**
- `concurrency: 3` - Can process 3 jobs at the same time
- `limiter: max 3 per second` - Rate limiting

---

### 5. Frontend Pages

#### `app/layout.js`

**What it does:** Root layout for all pages. Wraps every page with:
- Global CSS
- HTML structure

---

#### `app/page.js` (Login/Register Page)

**What it does:** Shows login and registration form.

**How it works:**
1. Shows either Login or Register form (toggles)
2. On submit, sends data to API routes
3. Stores JWT token in `localStorage`
4. Redirects to `/todos` page

**Key code:**
```javascript
// After successful login/register
localStorage.setItem("token", data.token);
localStorage.setItem("user", JSON.stringify(data.user));
router.push("/todos");
```

---

#### `app/todos/page.js` (Todo Dashboard)

**What it does:** Shows the todo list and email form.

**How it works:**

1. **On page load:**
   - Check if user is logged in (token exists)
   - If not, redirect to login page
   - Fetch todos from API

2. **Add todo:**
   - User types todo text
   - Sends POST to `/api/todos`
   - Adds new todo to state

3. **Toggle todo (done/not done):**
   - User clicks checkbox
   - Sends PUT to `/api/todos`
   - Updates todo in state

4. **Delete todo:**
   - User clicks delete button
   - Sends DELETE to `/api/todos?id=X`
   - Removes todo from state

5. **Send email:**
   - User fills subject and message
   - Sends POST to `/api/email`
   - Shows "Email queued!" message
   - Worker processes it in background

---

#### `app/globals.css`

**What it does:** Styles for the entire app.

**Key classes:**
| Class | Purpose |
|-------|---------|
| `.auth-container` | Login/Register form box |
| `.todo-app` | Todo dashboard container |
| `.todo-item` | Single todo row |
| `.todo-item.done` | Completed todo (strikethrough) |
| `.email-section` | Email form area |

---

## Application Flow

### Flow 1: User Registration

```
1. User fills registration form
           │
2. Browser sends POST /api/auth/register
   { name, email, password }
           │
3. API route creates user in Redis
   - Generates ID (INCR)
   - Hashes password (bcrypt)
   - Stores user hash
   - Stores email→ID mapping
           │
4. API returns JWT token
           │
5. Browser stores token in localStorage
           │
6. Browser redirects to /todos
```

### Flow 2: User Login

```
1. User fills login form
           │
2. Browser sends POST /api/auth/login
   { email, password }
           │
3. API route finds user in Redis
   - Looks up ID by email
   - Gets user hash
   - Compares password
           │
4. API returns JWT token
           │
5. Browser stores token, redirects to /todos
```

### Flow 3: Todo Operations

```
ADD TODO:
1. User types "Buy groceries"
2. Browser sends POST /api/todos with token
3. API creates todo in Redis
4. Browser shows new todo

TOGGLE TODO:
1. User clicks checkbox
2. Browser sends PUT /api/todos with token
3. API updates todo.done in Redis
4. Browser shows strikethrough

DELETE TODO:
1. User clicks delete
2. Browser sends DELETE /api/todos?id=1
3. API removes todo from Redis
4. Browser removes from list
```

### Flow 4: Email Sending

```
1. User fills email form
2. Browser sends POST /api/email with token
3. API adds job to BullMQ queue
4. API returns immediately (non-blocking)
5. Browser shows "Email queued!"
           │
           │  (meanwhile, in Terminal 2...)
           │
6. Worker picks up job from queue
7. Worker processes email (3 sec)
8. Worker logs "Email Sent in 3000ms"
```

---

## Redis Data Structure

```
┌─────────────────────────────────────────────────────────┐
│                      REDIS DATABASE                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  COUNTERS:                                               │
│  ┌──────────────────────┬───────┐                       │
│  │ user:id_counter      │   2   │  (auto-increment)     │
│  │ todos:id_counter:1   │   3   │  (user 1's todos)     │
│  │ todos:id_counter:2   │   1   │  (user 2's todos)     │
│  └──────────────────────┴───────┘                       │
│                                                          │
│  USERS:                                                  │
│  ┌──────────────────────┬────────────────────────┐      │
│  │ user:1               │ { id: "1",             │      │
│  │                      │   name: "John",        │      │
│  │                      │   email: "john@test",  │      │
│  │                      │   password: "$2a$..." }│      │
│  ├──────────────────────┼────────────────────────┤      │
│  │ user:2               │ { id: "2",             │      │
│  │                      │   name: "Jane",        │      │
│  │                      │   email: "jane@test",  │      │
│  │                      │   password: "$2a$..." }│      │
│  └──────────────────────┴────────────────────────┘      │
│                                                          │
│  EMAIL→ID MAPPINGS:                                      │
│  ┌──────────────────────┬───────┐                       │
│  │ user:email:john@test │   1   │                       │
│  │ user:email:jane@test │   2   │                       │
│  └──────────────────────┴───────┘                       │
│                                                          │
│  TODO LISTS (sets of IDs):                               │
│  ┌──────────────────────┬───────────┐                   │
│  │ todos:1              │ { 1, 2 }  │  (user 1's IDs)   │
│  │ todos:2              │ { 1 }     │  (user 2's IDs)   │
│  └──────────────────────┴───────────┘                   │
│                                                          │
│  TODO DATA (hashes):                                     │
│  ┌──────────────────────┬────────────────────────┐      │
│  │ todo:1:1             │ { id: "1",             │      │
│  │                      │   text: "Buy milk",    │      │
│  │                      │   done: "false",       │      │
│  │                      │   createdAt: "..." }   │      │
│  ├──────────────────────┼────────────────────────┤      │
│  │ todo:1:2             │ { id: "2",             │      │
│  │                      │   text: "Read book",   │      │
│  │                      │   done: "true",        │      │
│  │                      │   createdAt: "..." }   │      │
│  └──────────────────────┴────────────────────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Why this structure?**
- Users are stored as hashes (key-value pairs) - fast to read/write
- Email→ID mapping allows quick lookup during login
- Todos are stored per-user (userId in the key) - data isolation
- Todo IDs are stored in a set - easy to get all IDs for a user

---

## BullMQ and Worker Explained

### What is BullMQ?

BullMQ is a job queue system. Think of it like a waiting line at a bank:

```
┌─────────────────────────────────────────┐
│              BULLMQ QUEUE                │
│                                          │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐   │
│  │Job 1│→ │Job 2│→ │Job 3│→ │Job 4│   │
│  └─────┘  └─────┘  └─────┘  └─────┘   │
│                                          │
│  First In, First Out (FIFO)              │
└─────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │     WORKER      │
            │  (processes     │
            │   one by one)   │
            └────────────────┘
```

### Why use BullMQ?

1. **Non-blocking** - API returns immediately, email sends in background
2. **Retry** - If email fails, it retries (3 attempts with exponential backoff)
3. **Rate limiting** - Prevents spamming emails too fast
4. **Scalability** - Can add more workers to process faster

### How the Queue and Worker Connect

```
Terminal 1 (Next.js)          Terminal 2 (Worker)
┌─────────────────┐          ┌─────────────────┐
│                  │          │                  │
│  API Route       │          │  Worker          │
│  emailQueue.add()│  ──────▶ │  listens to      │
│                  │  Redis   │  "emailQueue"    │
│  Returns: {      │          │                  │
│    jobId: 1      │          │  Processes job   │
│  }               │          │  Logs output     │
│                  │          │                  │
└─────────────────┘          └─────────────────┘
        │                              │
        └──────────┬───────────────────┘
                   │
                   ▼
            ┌────────────┐
            │   REDIS    │
            │ (stores    │
            │  the jobs) │
            └────────────┘
```

---

## Summary

| File | What It Does | Connects To |
|------|-------------|-------------|
| `lib/redis.js` | Connects to Redis | Used by all API routes + worker |
| `lib/auth.js` | Creates/verifies JWT tokens | Used by API routes |
| `lib/queue.js` | Creates email queue | Used by email API + worker |
| `app/api/auth/register/route.js` | Creates user | Redis |
| `app/api/auth/login/route.js` | Logs in user | Redis, auth.js |
| `app/api/todos/route.js` | CRUD for todos | Redis, auth.js |
| `app/api/email/route.js` | Adds email job | queue.js, auth.js |
| `workers/email.worker.js` | Processes emails | queue.js, Redis |
| `app/page.js` | Login/Register UI | API routes |
| `app/todos/page.js` | Todo dashboard UI | API routes |
