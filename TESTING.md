# Testing Guideline - Todo List with BullMQ

## Overview

This project uses:
- **Next.js** - Frontend + API Routes
- **Redis** - Database (stores users and todos)
- **BullMQ** - Job queue for sending emails
- **Worker** - Standalone process that processes email jobs

## Prerequisites

Before testing, make sure you have:

1. **Node.js** installed (v18+)
2. **Redis** installed and running

### Check Redis is Running

```bash
redis-cli ping
```

Should return `PONG`. If not, start Redis:

```bash
# Windows
redis-server

# Mac/Linux
sudo systemctl start redis
# or
redis-server
```

---

## Step 1: Install Dependencies

```bash
cd frontend
npm install
```

---

## Step 2: Start the Next.js App

Open Terminal 1:

```bash
npm run dev
```

The app runs at `http://localhost:3000`

---

## Step 3: Start the Email Worker

Open Terminal 2 (new terminal):

```bash
npm run worker
```

You should see:
```
Email worker started. Waiting for jobs...
```

**Important**: The worker MUST be running for emails to be processed.

---

## Step 4: Test User Registration

1. Open `http://localhost:3000` in your browser
2. Click "Register" link
3. Fill in the form:
   - Name: `John Doe`
   - Email: `john@example.com`
   - Password: `password123`
4. Click "Register"

**Expected**: You should be redirected to `/todos` page

### Verify in Redis

Open Terminal 3:

```bash
redis-cli
> KEYS *
```

You should see:
- `user:1` (hash with user data)
- `user:email:john@example.com` (string with user ID)
- `user:id_counter` (counter)

---

## Step 5: Test User Login

1. Logout by clicking the "Logout" button
2. Login with:
   - Email: `john@example.com`
   - Password: `password123`

**Expected**: Redirected to `/todos` page

---

## Step 6: Test Todo CRUD

### Add a Todo

1. Type "Buy groceries" in the input
2. Click "Add"

**Expected**: Todo appears in the list

### Add More Todos

- "Finish homework"
- "Call mom"

### Toggle a Todo (Mark as Done)

1. Click the checkbox next to "Buy groceries"

**Expected**: Text gets strikethrough style

### Delete a Todo

1. Click "Delete" button on "Call mom"

**Expected**: Todo is removed from the list

### Verify in Redis

```bash
redis-cli
> KEYS todos:1
> SMEMBERS todos:1
> HGETALL todo:1:1
```

---

## Step 7: Test Email Sending

1. Scroll to "Send Email Notification" section
2. Fill in:
   - Subject: `Test Email`
   - Message: `This is a test email from the todo app`
3. Click "Send Email"

**Expected**:
- Message: "Email queued! Job ID: 1"
- In Terminal 2 (worker), you should see:

```
--- Email Worker ---
Job 1 Processing...
To: john@example.com
Subject: Test Email
Message: This is a test email from the todo app
Job 1 Email Sent in 3001ms
--- End ---
```

---

## Step 8: Test Multiple Users

### Register a Second User

1. Logout
2. Register with:
   - Name: `Jane Smith`
   - Email: `jane@example.com`
   - Password: `password123`

### Add Todos for Second User

1. Add: "Read a book"
2. Add: "Go for a run"

### Verify User Isolation

**Expected**:
- Jane sees only her todos (Read a book, Go for a run)
- John's todos are NOT visible to Jane

### Verify in Redis

```bash
redis-cli
> KEYS todos:*
```

Should show `todos:1` and `todos:2` (separate sets for each user)

---

## Step 9: Test Bulk Emails (Optional)

You can test the email queue with multiple jobs:

```bash
# In Terminal 3
curl -X POST http://localhost:3000/api/email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"subject":"Bulk Test","message":"Testing queue"}'
```

Run this multiple times quickly. Watch the worker process them one by one (rate limited to 3 per second).

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER FLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Register/Login                                          │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Browser  │───▶│ API Route │───▶│  Redis   │              │
│  │  (React)  │◀───│ (Next.js) │◀───│ (Store)  │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                                                       │
│       │ JWT Token stored in localStorage                    │
│       │                                                       │
│  2. Manage Todos                                            │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Browser  │───▶│ API Route │───▶│  Redis   │              │
│  │  (Todos)  │◀───│ (CRUD)    │◀───│ (Hashes) │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                                                       │
│  3. Send Email                                              │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐│
│  │  Browser  │───▶│ API Route │───▶│ BullMQ   │───▶│ Worker ││
│  │  (Email)  │    │ (Queue)   │    │  Queue   │    │ (Process)│
│  └──────────┘    └──────────┘    └──────────┘    └────────┘│
│                                            │                │
│                                            ▼                │
│                                      ┌──────────┐          │
│                                      │  Console  │          │
│                                      │   Log     │          │
│                                      └──────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Problem: "Redis connection refused"

**Solution**: Make sure Redis is running:
```bash
redis-cli ping
# Should return PONG
```

### Problem: "Email not sending"

**Solution**: Make sure the worker is running:
```bash
npm run worker
```

### Problem: "Unauthorized error"

**Solution**: You need to login again. The JWT token may have expired.

### Problem: "Port 3000 already in use"

**Solution**: Kill the process using that port:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

---

## Redis Commands Reference

```bash
# Connect to Redis
redis-cli

# List all keys
KEYS *

# Get user data
HGETALL user:1

# Get user's todos
SMEMBERS todos:1

# Get specific todo
HGETALL todo:1:1

# Delete all data (reset)
FLUSHALL
```

---

## What Each Component Does

| Component | File | Purpose |
|-----------|------|---------|
| Redis Config | `lib/redis.js` | Connects to Redis server |
| Auth Helper | `lib/auth.js` | Generates/verifies JWT tokens |
| Queue Setup | `lib/queue.js` | Creates BullMQ email queue |
| Register API | `app/api/auth/register/route.js` | Creates new user |
| Login API | `app/api/auth/login/route.js` | Authenticates user |
| Todos API | `app/api/todos/route.js` | CRUD for todos |
| Email API | `app/api/email/route.js` | Adds email job to queue |
| Worker | `workers/email.worker.js` | Processes email jobs |
| Login Page | `app/page.js` | Login/Register form |
| Todos Page | `app/todos/page.js` | Todo dashboard |
