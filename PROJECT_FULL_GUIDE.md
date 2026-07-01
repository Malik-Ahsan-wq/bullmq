# Todo App - Complete Project Guide

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Project Structure](#3-project-structure)
4. [Environment Setup](#4-environment-setup)
5. [Data Models](#5-data-models)
6. [Authentication System](#6-authentication-system)
7. [API Routes Reference](#7-api-routes-reference)
8. [Frontend Pages](#8-frontend-pages)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [Email & BullMQ Queue System](#10-email--bullmq-queue-system)
11. [Feature: Task Deadlines](#11-feature-task-deadlines)
12. [Styling & CSS](#12-styling--css)
13. [How Data Flows](#13-how-data-flows)
14. [Running the App](#14-running-the-app)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Project Overview

This is a **project-based task management app** built with Next.js. Users can:
- Register and log in (JWT auth stored in Redis)
- Create projects and become owners
- Invite other users to projects via email (BullMQ queue + Gmail SMTP)
- Create, assign, edit, delete, and toggle tasks within projects
- Set deadlines on tasks with visual overdue/approaching indicators
- Three roles: **Owner**, **Co-owner**, **Viewer** with different permissions

**Dual database architecture**: Redis handles auth/session data; MongoDB handles all project/task data.

---

## 2. Tech Stack & Dependencies

| Technology | Purpose | Version |
|---|---|---|
| Next.js (App Router) | Framework, API routes, pages | 16.2.9 |
| React | UI rendering | 19.2.4 |
| MongoDB + Mongoose | Projects, Todos, Users, Invites, Members | 9.7.3 |
| Redis + IORedis | Auth data, BullMQ job queue | 5.11.1 |
| BullMQ | Background email job processing | 5.79.2 |
| Nodemailer | Gmail SMTP email sending | 9.0.3 |
| bcryptjs | Password hashing | 3.0.3 |
| jsonwebtoken | JWT token generation/verification | 9.0.3 |
| Plain CSS | All styling (no Tailwind/component library) | - |

**NPM Scripts:**
- `npm run dev` — Start Next.js dev server (port 3000)
- `npm run build` — Production build
- `npm start` — Start production server
- `npm run worker` — Start BullMQ email worker (separate process)

---

## 3. Project Structure

```
E:\bullmq-learning\
│
├── .env.local                    # Environment variables (secrets, DB URIs)
├── package.json                  # Dependencies and scripts
├── jsconfig.json                 # Path aliases (@/* -> ./*)
├── next.config.mjs               # Next.js config (empty)
│
├── app/                          # Next.js App Router
│   ├── layout.js                 # Root layout, imports globals.css
│   ├── globals.css               # ALL application styles (616 lines)
│   ├── page.js                   # Login/Register page (client component)
│   │
│   ├── todos/
│   │   └── page.js               # Main dashboard: todos, projects, invites, email (719 lines)
│   │
│   ├── invite/
│   │   └── [token]/
│   │       └── page.js           # Accept invitation page (client component)
│   │
│   └── api/
│       ├── auth/
│       │   ├── login/route.js    # POST — Redis-based login
│       │   └── register/route.js # POST — Redis-based registration
│       │
│       ├── todos/route.js        # GET/POST/PUT/DELETE — Legacy Redis todos (standalone)
│       │
│       ├── email/route.js        # POST — Queue generic email job via BullMQ
│       │
│       ├── projects/
│       │   ├── route.js          # GET/POST — List/create projects (MongoDB)
│       │   └── [projectId]/
│       │       ├── todos/route.js      # GET/POST/PUT/DELETE — Project-scoped todos (MongoDB)
│       │       ├── members/route.js    # GET — List project members
│       │       └── invite/route.js     # POST — Send project invitation email
│       │
│       └── invite/
│           ├── [token]/route.js  # GET — Validate invite token
│           └── accept/route.js   # POST — Accept invitation, add member
│
├── models/                       # Mongoose schemas (MongoDB)
│   ├── Todo.js                   # Task model
│   ├── User.js                   # User model (MongoDB mirror)
│   ├── Project.js                # Project model
│   ├── ProjectMember.js          # Project membership model
│   └── Invite.js                 # Invitation model
│
├── lib/                          # Shared utility modules
│   ├── redis.js                  # IORedis connection
│   ├── mongodb.js                # Mongoose connection (cached)
│   ├── auth.js                   # JWT generation/verification
│   ├── getUserFromRequest.js     # Extract user from Authorization header
│   ├── queue.js                  # BullMQ email queue setup
│   └── email.js                  # Nodemailer SMTP transport + HTML email template
│
├── workers/
│   └── email.worker.js           # BullMQ background worker for emails
│
└── public/                       # Static assets (SVGs)
```

---

## 4. Environment Setup

### `.env.local` Configuration

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=todo-app-secret-key-123
MONGO_URI=mongodb://localhost:27017/todo-app
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Gmail SMTP (for invitation emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-here
EMAIL_FROM=your-email@gmail.com
```

### Required Services

| Service | Default | Purpose |
|---|---|---|
| Redis | `127.0.0.1:6379` | Auth data storage, BullMQ job queue |
| MongoDB | `localhost:27017/todo-app` | Projects, todos, users, invites, members |

### Getting Started

```bash
# Install dependencies
npm install

# Start Redis (must be running)
redis-server

# Start MongoDB (must be running)
mongod

# Start the Next.js dev server (Terminal 1)
npm run dev

# Start the BullMQ email worker (Terminal 2)
npm run worker
```

The app runs at `http://localhost:3000`.

---

## 5. Data Models

### 5.1 User (`models/User.js`)

MongoDB mirror of Redis auth users. Created automatically when a user is invited or creates their first project.

```javascript
{
  name:          String (required, trimmed)
  email:         String (required, unique, lowercase, trimmed)
  redisUserId:   Number (default: null)  // Links to Redis user ID
  createdAt:     Date (auto)
  updatedAt:     Date (auto)
}
```

**Indexes:** `{ email: 1 }` (unique)

### 5.2 Redis User (stored in `lib/redis.js`)

Auth data stored as Redis hashes:

```
user:{id}           → { id, name, email, password (bcrypt hash) }
user:email:{email}  → {id}   (email-to-ID lookup)
user:id_counter     → auto-incremented integer
```

### 5.3 Project (`models/Project.js`)

```javascript
{
  name:          String (required, trimmed)
  description:   String (default: "", trimmed)
  ownerId:       ObjectId → User (required)
  createdAt:     Date (auto)
  updatedAt:     Date (auto)
}
```

**Indexes:** `{ ownerId: 1 }`

### 5.4 ProjectMember (`models/ProjectMember.js`)

Links users to projects with a role.

```javascript
{
  projectId:     ObjectId → Project (required)
  userId:        ObjectId → User (required)
  role:          String enum ["owner", "co-owner", "viewer"] (default: "viewer")
  createdAt:     Date (auto)
  updatedAt:     Date (auto)
}
```

**Indexes:** `{ projectId: 1, userId: 1 }` (unique compound), `{ userId: 1 }`

### 5.5 Todo (`models/Todo.js`)

```javascript
{
  projectId:     ObjectId → Project (required)
  text:          String (required, trimmed)
  done:          Boolean (default: false)
  assignedTo:    ObjectId → User (default: null)
  assignedToName: String (default: null)   // Cached name
  assignedBy:    ObjectId → User (default: null)
  createdBy:     ObjectId → User (required)
  deadline:      Date (default: null)      // Optional task deadline
  createdAt:     Date (auto)
  updatedAt:     Date (auto)
}
```

**Indexes:** `{ projectId: 1, assignedTo: 1 }`, `{ projectId: 1, createdAt: -1 }`

### 5.6 Invite (`models/Invite.js`)

```javascript
{
  projectId:     ObjectId → Project (required)
  email:         String (required, lowercase, trimmed)
  token:         String (required, unique)  // 32-byte random hex
  invitedBy:     ObjectId → User (required)
  status:        String enum ["pending", "accepted", "expired"] (default: "pending")
  role:          String enum ["co-owner", "viewer"] (default: "viewer")
  expiresAt:     Date (required)            // 7 days from creation
  createdAt:     Date (auto)
  updatedAt:     Date (auto)
}
```

**Indexes:** `{ token: 1 }` (unique), `{ projectId: 1, email: 1 }`, `{ expiresAt: 1 }` (TTL)

---

## 6. Authentication System

### Flow

1. **Register** (`POST /api/auth/register`):
   - Stores user in Redis: `user:{id}` hash + `user:email:{email}` mapping
   - Password hashed with bcrypt (10 rounds)
   - Returns JWT token + user object

2. **Login** (`POST /api/auth/login`):
   - Looks up `user:email:{email}` in Redis to get user ID
   - Fetches `user:{id}` hash, compares bcrypt password
   - Returns JWT token + user object

3. **JWT Token** (`lib/auth.js`):
   - Payload: `{ id, email }`
   - Expires: 24 hours
   - Secret: `JWT_SECRET` env var (fallback: `todo-app-secret-key-123`)

4. **Client Storage**:
   - `localStorage.setItem("token", data.token)`
   - `localStorage.setItem("user", JSON.stringify(data.user))`

5. **Request Auth** (`lib/getUserFromRequest.js`):
   - Reads `Authorization: Bearer {token}` header
   - Verifies JWT, returns decoded payload `{ id, email }`
   - Returns `null` if missing/invalid

### Auth Pages

- **Login/Register** (`app/page.js`): Single form with toggle between login and register modes. On success, stores token and redirects to `/todos`.
- **Invite Accept** (`app/invite/[token]/page.js`): Validates token via `GET /api/invite/{token}`, shows invite details, has "Accept Invitation" button.

---

## 7. API Routes Reference

All project-scoped routes require `Authorization: Bearer {token}` header.

### 7.1 Auth Routes

| Method | Endpoint | Body | Response | Notes |
|--------|----------|------|----------|-------|
| POST | `/api/auth/register` | `{ name, email, password }` | `{ token, user }` | Creates Redis user |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` | Validates Redis user |

### 7.2 Project Routes

| Method | Endpoint | Body/Params | Response | Notes |
|--------|----------|-------------|----------|-------|
| GET | `/api/projects` | — | `{ projects: [...] }` | Lists projects user is member of |
| POST | `/api/projects` | `{ name, description? }` | `{ project }` | Creates project, auto-adds user as owner |

### 7.3 Project Todo Routes (`/api/projects/[projectId]/todos`)

| Method | Body/Params | Response | Permission |
|--------|-------------|----------|------------|
| GET | — | `{ todos: [...], userRole }` | Any member (viewer sees all; others see own + unassigned) |
| POST | `{ text, assignedTo?, deadline? }` | `{ todo }` | owner, co-owner |
| PUT | `{ id, text?, done?, assignedTo?, deadline? }` | `{ todo }` | owner, co-owner, creator, assignee |
| DELETE | `?id={todoId}` | `{ message }` | owner, co-owner, creator |

**Todo response object:**
```javascript
{
  id, text, done, deadline,
  assignedTo: { id, name, email } | null,
  assignedToName,
  assignedBy: { id, name } | null,
  createdBy: { id, name } | null,
  userRole,
  canEdit,       // boolean
  canDelete,     // boolean
  canAssign,     // boolean
  createdAt
}
```

### 7.4 Project Members Route

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/projects/[projectId]/members` | `{ members: [{ id, name, email, role }] }` |

### 7.5 Invite Routes

| Method | Endpoint | Body | Response | Notes |
|--------|----------|------|----------|-------|
| POST | `/api/projects/[projectId]/invite` | `{ email, role }` | `{ invite, jobId }` | Owner only. Queues email via BullMQ |
| GET | `/api/invite/[token]` | — | `{ invite, project, inviter, alreadyMember }` | Public, validates token |
| POST | `/api/invite/accept` | `{ token }` | `{ message, project }` | Public, accepts invite, adds member |

### 7.6 Email Route

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/email` | `{ subject, message }` | `{ jobId }` | Queues generic email via BullMQ |

### 7.7 Legacy Redis Todos (`/api/todos`)

| Method | Body | Notes |
|--------|------|-------|
| GET | — | Returns all todos for authenticated user (Redis) |
| POST | `{ text }` | Creates todo in Redis |
| PUT | `{ id, text?, done? }` | Updates todo in Redis |
| DELETE | `?id={id}` | Deletes todo from Redis |

**Note:** This legacy route is NOT used by the frontend dashboard. It exists as a standalone Redis-based CRUD.

---

## 8. Frontend Pages

### 8.1 Login/Register (`app/page.js`)

**Component:** `AuthPage` (client component)

**Behavior:**
- Toggle between Login and Register modes
- Register requires: Name, Email, Password
- Login requires: Email, Password
- On success: stores `token` and `user` in localStorage, redirects to `/todos`
- Error display in red text

### 8.2 Main Dashboard (`app/todos/page.js`)

**Component:** `TodosPage` (client component, 719 lines)

**State Variables:**
```
user, loading              — Auth state
projects, selectedProject  — Project selection
members                    — Current project members
todos, userRole            — Task list and user's role
newTodo, assignTo,         — Add task form
newDeadline                — Deadline picker for new tasks
todoStatus                 — Success/error messages
newProjectName, newProjectDesc, projectStatus  — Create project form
inviteEmail, inviteRole, inviteStatus          — Invite form
emailSubject, emailMessage, emailStatus        — Email form
editingDeadlineId, editingDeadlineValue        — Inline deadline edit
```

**Sections on the page (top to bottom):**

1. **Header** — App title, user name, role badge, logout button
2. **Project Selector** — Dropdown to switch between projects
3. **Add Todo Form** (owner/co-owner only) — Text input, assign dropdown, deadline picker, Add button
4. **Viewer Notice** (viewer only) — "You are a Viewer. You can only view tasks."
5. **Todo List** — Each item shows: checkbox, text, assignment badge, deadline badge, edit deadline button, created by, reassign dropdown, delete button
6. **Email Section** — Subject + message form to queue an email
7. **Projects & Invites** — Side-by-side panels: Create Project form + Invite form
8. **Members Section** — List of project members with name, email, role badge

### 8.3 Invite Accept (`app/invite/[token]/page.js`)

**Component:** `InvitePage` (client component)

**Behavior:**
- Fetches invite details via `GET /api/invite/{token}`
- Shows: inviter name, project name/description, "Accept Invitation" button
- On accept: calls `POST /api/invite/accept`, shows success, "Go to Dashboard" button
- Handles: already accepted, expired, already member states

---

## 9. Role-Based Access Control

### Roles

| Role | Description | How Assigned |
|------|-------------|--------------|
| **owner** | Full control. Can create/edit/delete tasks, manage members, send invites | Automatically when creating a project |
| **co-owner** | Can create/edit/delete tasks, reassign tasks | Invited by owner with `role: "co-owner"` |
| **viewer** | Read-only. Can see all tasks and deadlines | Invited by owner with `role: "viewer"` |

### Permission Matrix

| Action | Owner | Co-owner | Creator | Assignee | Viewer |
|--------|:-----:|:--------:|:-------:|:--------:|:------:|
| View tasks | Yes | Yes | Yes | Yes | Yes |
| Create task | Yes | Yes | - | - | No |
| Edit task (toggle done, edit text) | Yes | Yes | Yes | Yes | No |
| Delete task | Yes | Yes | Yes | - | No |
| Assign/reassign task | Yes | Yes | - | - | No |
| Set/edit deadline | Yes | Yes | Yes | Yes | No |
| Send invites | Yes | - | - | - | - |
| Create projects | Yes | - | - | - | - |

### Permission Functions (`app/api/projects/[projectId]/todos/route.js`)

```javascript
canCreateTask(role)       → owner, co-owner
canEditTask(role, todo, userId)  → owner, co-owner, creator, assignee
canDeleteTask(role, todo, userId) → owner, co-owner, creator
canAssignTask(role)       → owner, co-owner
canReassignTask(role)     → owner, co-owner
```

### Task Visibility

- **Viewer**: Sees ALL tasks in the project
- **Owner/Co-owner/Other roles**: Sees tasks where:
  - `assignedTo` is null (unassigned), OR
  - `assignedTo` is the current user, OR
  - `createdBy` is the current user, OR
  - `assignedBy` is the current user

---

## 10. Email & BullMQ Queue System

### Architecture

```
API Route (Next.js)
    → emailQueue.add() (BullMQ)
        → Redis (job storage)
            → email.worker.js (separate Node process)
                → Nodemailer (Gmail SMTP)
                    → Recipient inbox
```

### Queue Configuration (`lib/queue.js`)

```javascript
Queue: "emailQueue"
Rate Limiter: max 5 jobs per 1 second
Connection: Redis (shared with BullMQ)
```

### Worker Configuration (`workers/email.worker.js`)

```javascript
Concurrency: 3 (processes 3 jobs simultaneously)
Rate Limiter: max 3 jobs per 1 second
Retry: 3 attempts with exponential backoff (2s initial delay)
```

### Email Types

1. **Invitation Email** (`job.name: "sendInviteEmail"`):
   - HTML template with project name, inviter name, accept button
   - Link format: `{NEXT_PUBLIC_APP_URL}/invite/{token}`
   - Expires in 7 days

2. **Generic Email** (`job.name: "sendEmail"`):
   - Simulated 3-second delay (no actual SMTP for generic emails)
   - Logs subject and message to console

### SMTP Configuration

- Host: `smtp.gmail.com` (port 587)
- Auth: Gmail app password (not regular password)
- TLS: `rejectUnauthorized: false`
- Transport is cached after first use

---

## 11. Feature: Task Deadlines

### Overview

Tasks can have an optional deadline (date + time). The deadline is displayed as a color-coded badge and can be set during task creation or edited inline afterward.

### Schema Change

Added to `models/Todo.js`:
```javascript
deadline: {
  type: Date,
  default: null,
}
```

### Setting Deadlines

**During creation (add todo form):**
- datetime-local input appears in the `.add-todo` form row
- Value sent as ISO string in POST body: `{ text, assignedTo, deadline }`
- Optional — leaving it empty sets no deadline

**Editing existing tasks:**
- Each task with `canEdit: true` shows a small "Deadline" button in the meta area
- Clicking it opens an inline datetime-local input + Save + Clear buttons
- Save calls PUT with `{ id, deadline }` to update
- Clear calls PUT with `{ id, deadline: null }` to remove

### Deadline Status Logic (Client-side)

```javascript
getDeadlineInfo(deadline, done):
  if no deadline → null (no badge shown)
  if task is done → { className: "done", label: formatted date }
  if now > deadline → { className: "overdue", label: "Overdue" }
  if deadline - now < 24 hours → { className: "approaching", label: "In Xh Ym" }
  else → { className: "on-track", label: formatted date }
```

### Visual Indicators

| Status | CSS Class | Color | Label |
|--------|-----------|-------|-------|
| On track (>24h away) | `.deadline-badge.on-track` | Blue (#0070f3 on #e6f3ff) | `MM/DD/YYYY HH:MM AM/PM` |
| Approaching (<24h) | `.deadline-badge.approaching` | Orange (#856404 on #fff3cd) | `In Xh Ym` |
| Overdue (past deadline) | `.deadline-badge.overdue` | Red (white on #e00) | `Overdue` |
| Done (completed task) | `.deadline-badge.done` | Grey (#999 on #f0f0f0, strikethrough) | `MM/DD/YYYY HH:MM AM/PM` |

### API Behavior

- **GET**: Returns `deadline` as ISO string or `null`
- **POST**: Accepts `deadline` (ISO string or null), validates with `new Date()`, rejects invalid dates with 400
- **PUT**: Accepts `deadline` (ISO string, null, or omit to keep unchanged), validates, updates

### Who Can Set Deadlines

Same as `canEditTask`: owner, co-owner, task creator, task assignee. Viewers see the badge but cannot edit.

---

## 12. Styling & CSS

All styles are in `app/globals.css` (616 lines). No CSS modules, no Tailwind, no component library.

### Key CSS Classes

**Layout:**
- `.container` — Centered, max-width 600px, 20px padding
- `.todo-app` — White card with shadow, 30px padding, 8px border-radius

**Header:**
- `.todo-header` — Flex row, space-between, bottom border
- `.user-info` — Flex row with gap for name, role badge, logout

**Forms:**
- `.add-todo` — Flex row: text input (flex:1) + select + deadline input + button
- `.add-todo-section` — Container with bottom margin
- `.email-form` — Flex column for subject input + textarea + button
- `.invite-form` — Flex column for invite fields

**Todo List:**
- `.todo-list` — No list-style
- `.todo-item` — Flex row, align-items: flex-start, border, 8px margin-bottom
- `.todo-item.done` — Light grey background
- `.todo-text` — flex:1; strikethrough + grey when `.done`
- `.todo-content` — flex:1, min-width:0
- `.todo-meta` — Flex row with gap, wrap

**Badges:**
- `.role-badge` — 10px uppercase, border-radius 10px
  - `.owner` — Gold background
  - `.co-owner` — Blue background
  - `.viewer` — Grey background
- `.assigned-badge` — 11px, blue text on light blue
- `.unassigned-badge` — 11px, grey text on light grey
- `.deadline-badge` — 11px, color-coded (see Section 11)

**Buttons:**
- `.btn` — Full width, 12px padding, 4px radius
- `.btn-primary` — Blue (#0070f3)
- `.btn-secondary` — Grey (#666)
- `.btn-danger` — Red (#e00), small (6px 12px)
- `.btn-success` — Green (#0a0), small

**Other:**
- `.viewer-notice` — Centered grey notice for viewers
- `.members-list` — Flex column
- `.member-item` — Flex row with name, email, role badge
- `.loading` — Centered grey text
- `.success-msg` — Green text, centered
- `.error` — Red text, centered

---

## 13. How Data Flows

### Complete Request/Response Flow

```
┌─────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                    │
│  app/todos/page.js                                   │
│                                                      │
│  1. User logs in → localStorage stores token + user  │
│  2. useEffect fetches projects → GET /api/projects   │
│  3. User selects project → fetches members + todos   │
│  4. User adds task → POST /api/projects/{id}/todos   │
│  5. State updates → React re-renders todo list       │
└─────────────┬───────────────────────────────────────┘
              │ fetch() with Bearer token
              ▼
┌─────────────────────────────────────────────────────┐
│  API ROUTES (Next.js App Router)                     │
│  app/api/projects/[projectId]/todos/route.js         │
│                                                      │
│  1. getUserFromRequest() → extracts JWT from header  │
│  2. verifyProjectAccess() → checks MongoDB membership│
│  3. Permission checks → canCreate/canEdit/canDelete  │
│  4. Mongoose operations → reads/writes MongoDB       │
│  5. Returns JSON response                            │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  DATABASES                                           │
│                                                      │
│  Redis:                                              │
│    user:{id}          → auth data                   │
│    user:email:{email} → user ID lookup              │
│    todos:{userId}     → legacy todo IDs (set)       │
│    BullMQ queues      → email jobs                  │
│                                                      │
│  MongoDB:                                            │
│    users              → user profiles               │
│    projects           → project data                │
│    projectmembers     → membership + roles          │
│    todos              → tasks with deadlines        │
│    invites            → pending invitations         │
└─────────────────────────────────────────────────────┘
```

### Todo Creation Flow (Detailed)

```
1. User types task text, selects assignee, picks deadline
2. Frontend: addTodo() sends POST to /api/projects/{id}/todos
   Body: { text: "Buy milk", assignedTo: "user123", deadline: "2025-07-15T14:00" }
3. API route:
   a. Verifies JWT token → gets user email
   b. Finds MongoDB user by email
   c. Verifies project membership in ProjectMember collection
   d. Checks canCreateTask(role) → must be owner or co-owner
   e. Validates text is non-empty
   f. Validates deadline is valid Date or null
   g. Looks up assigned user in MongoDB
   h. Creates Todo document in MongoDB
   i. Returns formatted todo object with permission flags
4. Frontend: prepends new todo to state array
5. React re-renders → todo appears at top of list with deadline badge
```

---

## 14. Running the App

### Prerequisites

1. **Node.js** (v18+)
2. **Redis** server running on default port 6379
3. **MongoDB** server running on default port 27017
4. **Gmail account** with app password for SMTP (or modify `lib/email.js` for another provider)

### Start Commands

```bash
# Terminal 1: Next.js dev server
cd E:\bullmq-learning
npm run dev

# Terminal 2: BullMQ email worker
cd E:\bullmq-learning
npm run worker

# Optional: Production build
npm run build
npm start
```

### First-Time Setup

1. Open `http://localhost:3000`
2. Register a new account (stored in Redis)
3. Create a project (you become the owner)
4. Invite others via email (requires working SMTP)
5. Accept invites via the link sent to email
6. Create tasks, assign them, set deadlines

---

## 15. Troubleshooting

| Problem | Solution |
|---------|----------|
| `MongoServerError: connect ECONNREFUSED` | Start MongoDB: `mongod` |
| `Error: connect ECONNREFUSED 127.0.0.1:6379` | Start Redis: `redis-server` |
| `SMTP credentials not configured` | Set `SMTP_USER` and `SMTP_PASS` in `.env.local` |
| `JWT verification fails` | Check `JWT_SECRET` matches between server restarts |
| `Invite email not sending` | Run `npm run worker` in a separate terminal |
| `Todos not showing` | Ensure you're a project member (create a project first) |
| `Cannot create tasks` | You need owner or co-owner role (create a project or get invited as co-owner) |
| `Stale data after invite accept` | Refresh the page to re-fetch projects and members |
| Legacy `/api/todos` returns different format | This route uses Redis and is NOT connected to the project-scoped MongoDB todos |

---

## Appendix: File-by-File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `app/page.js` | 101 | Login/Register form |
| `app/todos/page.js` | 719 | Main dashboard (all features) |
| `app/invite/[token]/page.js` | 147 | Invitation accept page |
| `app/layout.js` | 14 | Root HTML layout |
| `app/globals.css` | 616 | All application styles |
| `app/api/auth/login/route.js` | 55 | Redis-based login |
| `app/api/auth/register/route.js` | 52 | Redis-based registration |
| `app/api/todos/route.js` | 167 | Legacy Redis todo CRUD |
| `app/api/email/route.js` | 57 | Queue email job |
| `app/api/projects/route.js` | 101 | List/create projects |
| `app/api/projects/[projectId]/todos/route.js` | 405 | Project-scoped todo CRUD |
| `app/api/projects/[projectId]/members/route.js` | 65 | List project members |
| `app/api/projects/[projectId]/invite/route.js` | 141 | Send project invitation |
| `app/api/invite/[token]/route.js` | 80 | Validate invite token |
| `app/api/invite/accept/route.js` | 100 | Accept invitation |
| `models/Todo.js` | 55 | Todo Mongoose schema |
| `models/User.js` | 33 | User Mongoose schema |
| `models/Project.js` | 32 | Project Mongoose schema |
| `models/ProjectMember.js` | 36 | ProjectMember Mongoose schema |
| `models/Invite.js` | 54 | Invite Mongoose schema |
| `lib/redis.js` | 9 | IORedis connection |
| `lib/mongodb.js` | 31 | Mongoose connection (cached) |
| `lib/auth.js` | 17 | JWT utilities |
| `lib/getUserFromRequest.js` | 10 | Extract user from request |
| `lib/queue.js` | 12 | BullMQ queue setup |
| `lib/email.js` | 112 | Nodemailer transport + email template |
| `workers/email.worker.js` | 84 | BullMQ email worker |
