# FCM Push Notifications — Complete Implementation Guide

---

## What Was Built

Firebase Cloud Messaging (FCM) push notifications integrated into the existing
BullMQ queue/worker system. No new queues were created. FCM was wired into the
three existing workers following this exact flow:

```
User Action
    │
    ▼
Next.js API Route
    │
    ▼
BullMQ Queue  (loginQueue / deadlineQueue / emailQueue)
    │
    ▼
BullMQ Worker  (login.worker / deadline.worker / email.worker)
    │
    ▼
Notification Service  (lib/notificationService.js)
    │
    ▼
Firebase Admin SDK  (lib/firebase-admin.js)
    │
    ▼
FCM Server  (Google)
    │
    ▼
User Device  (Browser Push Notification)
```

---

## Files Created

### 1. `lib/firebase-admin.js`
**Purpose:** Firebase Admin SDK singleton for the server side (workers).

```js
const { initializeApp, getApps, getApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

module.exports = { messaging: () => getMessaging(getApp()) };
```

**How it works:**
- Uses the modular Firebase Admin SDK v10+ API (`firebase-admin/app`, `firebase-admin/messaging`)
- `getApps().length` check prevents re-initializing when the module is required multiple times
- `FIREBASE_PRIVATE_KEY` has literal `\n` strings in .env.local — `.replace(/\\n/g, "\n")` converts them to real newlines
- Exports a `messaging()` factory function so each worker calls it fresh without holding a stale reference

**Environment variables used (server-only):**
```
FIREBASE_PROJECT_ID=my-task-app-7f76f
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@my-task-app-7f76f.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
```

---

### 2. `lib/notificationService.js`
**Purpose:** Single reusable function all three workers call to send a push notification.

```js
const { messaging } = require("./firebase-admin");
const { createLogger } = require("./logger");

const log = createLogger("NotificationService");

const INVALID_TOKEN_CODES = [
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
];

async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) {
    log.warn("No FCM token — skipping push notification");
    return false;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data,
    webpush: { notification: { title, body, icon: "/favicon.ico" } },
  };

  try {
    const messageId = await messaging().send(message);
    log.info("Push notification sent", { messageId, title });
    return true;
  } catch (err) {
    if (INVALID_TOKEN_CODES.includes(err.code)) {
      log.warn("FCM token invalid/expired", { code: err.code });
      return false;   // caller clears the token from DB
    }
    log.error("Failed to send push notification", { error: err.message });
    throw err;        // unexpected error — BullMQ will retry the job
  }
}

module.exports = { sendPushNotification };
```

**How it works:**
- Takes an `fcmToken` and a `{ title, body, data }` payload
- Returns `true` on success
- Returns `false` (does NOT throw) when the token is invalid or expired — this tells the worker to clear the token from MongoDB
- Throws on all other errors so BullMQ retries the job automatically
- `data` field carries structured metadata (type, todoId, etc.) for the client to act on

---

### 3. `lib/firebase.js`
**Purpose:** Firebase Web SDK for the browser — requests permission and generates the FCM token.

```js
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const registration = await navigator.serviceWorker.register(
      "/api/firebase-messaging-sw",
      { scope: "/" }
    );
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (err) {
    console.error("FCM token error:", err);
    return null;
  }
}

export function onForegroundMessage(handler) {
  if (typeof window === "undefined") return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, handler);
}
```

**How it works:**
- `requestNotificationPermission()`:
  1. Guards against SSR (server has no `window`, `Notification`, or `serviceWorker`)
  2. Calls `Notification.requestPermission()` — browser shows the allow/block popup
  3. Registers the service worker at `/api/firebase-messaging-sw` with `scope: "/"`
  4. Waits for `navigator.serviceWorker.ready` — ensures SW is active before token request
  5. Calls `getToken()` with the VAPID key — this makes an outbound fetch to `fcmregistrations.googleapis.com` to register the device and get a unique FCM token
  6. Returns the token string or `null`
- `onForegroundMessage(handler)` — listens for push messages while the tab is open and calls the handler

**Environment variables used (public, sent to browser):**
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY
```

---

### 4. `app/api/firebase-messaging-sw/route.js`
**Purpose:** Serves the service worker as raw JavaScript, bypassing Turbopack's bundler.

```js
export async function GET() {
  const swContent = `
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "New Notification", body: event.data.text() } };
  }

  const notification =
    payload.notification ||
    (payload.data && { title: payload.data.title, body: payload.data.body }) ||
    { title: "New Notification", body: "" };

  event.waitUntil(
    self.registration.showNotification(notification.title || "New Notification", {
      body: notification.body || "",
      icon: "/favicon.ico",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow("/");
    })
  );
});
`;

  return new Response(swContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-store",
    },
  });
}
```

**How it works:**
- Why an API route instead of `public/firebase-messaging-sw.js`?
  Turbopack (Next.js 16 dev bundler) intercepts all `.js` files under `public/`
  and tries to bundle them as ES modules. Service workers use `importScripts()`
  and browser globals (`self`, `clients`) that don't exist in a module context —
  Turbopack throws `ServiceWorker script evaluation failed`.
  An API route returns a raw `Response` — Turbopack never touches it.
- Why no `importScripts`?
  The original approach used `importScripts("https://gstatic.com/firebasejs/...")`.
  The CSP header `connect-src 'self'` blocked those external CDN URLs.
  The fix: use the browser's native `push` event listener — no external scripts needed.
  FCM delivers the push payload natively; the SW just reads `event.data` and calls
  `showNotification()`.
- `Service-Worker-Allowed: /` header — required to allow the SW registered at
  `/api/firebase-messaging-sw` to control the root scope `/`
- `Cache-Control: no-store` — ensures the browser always fetches the latest version

---

### 5. `app/api/fcm/token/route.js`
**Purpose:** Authenticated API endpoint that saves the FCM token to MongoDB.

```js
import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/getUserFromRequest";
import UserModel from "../../../../models/User";

export async function POST(request) {
  try {
    const authUser = getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fcmToken } = await request.json();
    if (!fcmToken) {
      return NextResponse.json({ error: "fcmToken is required" }, { status: 400 });
    }

    const User = await UserModel();
    await User.findOneAndUpdate(
      { email: authUser.email },
      { fcmToken },
      { new: true }
    );

    return NextResponse.json({ message: "FCM token saved" });
  } catch (error) {
    console.error("FCM token save error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**How it works:**
- Requires a valid JWT in the `Authorization: Bearer <token>` header
- Reads `fcmToken` from the request body
- Uses `findOneAndUpdate` with `{ email }` as the filter — upserts the token on the existing user document
- Called by the browser immediately after `getToken()` succeeds

---

## Files Modified

### 6. `models/User.js`
**Change:** Added `fcmToken` field to the schema.

```js
// ADDED:
fcmToken: {
  type: String,
  default: null,
},
```

**Why:** Workers need to look up a user's FCM token by email to send them a push notification. MongoDB stores it here. When a token expires or becomes invalid, workers set it back to `null`.

---

### 7. `workers/login.worker.js`
**Change:** Added MongoDB connection, User model lookup, and FCM push after email send.

**What was added:**
```js
const mongoose = require("mongoose");
const { sendPushNotification } = require("../lib/notificationService");

// After sending email:
const user = await User.findOne({ email }).lean();
if (user?.fcmToken) {
  const valid = await sendPushNotification(user.fcmToken, {
    title: "New Login Detected",
    body: `Your account was accessed${ip ? ` from ${ip}` : ""} at ${loginTime}`,
    data: { type: "login", ip: ip || "" },
  });
  if (!valid) {
    await User.updateOne({ email }, { fcmToken: null });
    log.warn("Cleared invalid FCM token", { email });
  }
}
```

**Trigger:** Every time a user logs in successfully, `loginQueue` gets a job. The worker sends the email first, then sends the push notification.

**Notification shown:** "New Login Detected — Your account was accessed from 192.168.x.x at 7/10/2026, 12:00:00 PM"

---

### 8. `workers/deadline.worker.js`
**Change:** Added User model lookup and FCM push after deadline email send.

**What was added:**
```js
const { sendPushNotification } = require("../lib/notificationService");

// Determines if task is already past deadline:
const isOverdue = new Date(todo.deadline) < new Date();
const notifTitle = isOverdue ? "Task Overdue!" : "Deadline Reminder";
const notifBody = isOverdue
  ? `"${taskName}" in ${projectName} is overdue.`
  : `"${taskName}" in ${projectName} is due now.`;

// After sending email:
const user = await User.findOne({ email }).lean();
if (user?.fcmToken) {
  const valid = await sendPushNotification(user.fcmToken, {
    title: notifTitle,
    body: notifBody,
    data: { type: isOverdue ? "deadline_overdue" : "deadline_reminder", todoId },
  });
  if (!valid) {
    await User.updateOne({ email }, { fcmToken: null });
  }
}
```

**Trigger:** When a todo is created/updated with a deadline, `deadlineQueue` schedules a delayed job. The delay = `deadline time - now`. When the job fires, the worker checks if the task is still pending, sends the email, then sends the push.

**Notifications shown:**
- "Deadline Reminder — "Fix login bug" in My Project is due now."
- "Task Overdue! — "Fix login bug" in My Project is overdue."

---

### 9. `workers/email.worker.js` (Invitation Worker)
**Change:** Added MongoDB connection, User model lookup, and FCM push for `sendInviteEmail` jobs.

**What was added:**
```js
const { sendPushNotification } = require("../lib/notificationService");

// After sending invite email:
await connectMongo();
const user = await User.findOne({ email }).lean();
if (user?.fcmToken) {
  const valid = await sendPushNotification(user.fcmToken, {
    title: "You've been invited!",
    body: `${inviterName} invited you to join "${projectName}"`,
    data: { type: "invitation", projectName, inviterName, token },
  });
  if (!valid) {
    await User.updateOne({ email }, { fcmToken: null });
  }
}
```

**Trigger:** When a project owner sends an invite via `POST /api/projects/:id/invite`, the `emailQueue` gets a `sendInviteEmail` job. The worker sends the email, then sends the push to the invitee.

**Notification shown:** "You've been invited! — John invited you to join "My Project""

---

### 10. `app/page.js`
**Change:** Added fire-and-forget FCM initialization after successful login/register.

**What was added:**
```js
async function initFcm(authToken) {
  try {
    const { requestNotificationPermission, onForegroundMessage } = await import("../lib/firebase");
    const fcmToken = await requestNotificationPermission();
    if (!fcmToken) return;

    await fetch("/api/fcm/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ fcmToken }),
    });

    onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      if (title && Notification.permission === "granted") {
        new Notification(title, { body: body || "", icon: "/favicon.ico" });
      }
    });
  } catch (err) {
    console.warn("FCM init failed (non-critical):", err.message);
  }
}

// Inside handleSubmit, after successful login:
initFcm(data.token);   // NO await — fire and forget
router.push("/todos");
```

**Key design decision — fire-and-forget:**
`initFcm` is called WITHOUT `await`. This means:
- Login/register always navigates to `/todos` immediately
- FCM errors (permission denied, network issue, browser unsupported) NEVER show "Network error" to the user
- Firebase SDK is dynamically imported (`await import(...)`) — it only loads after login succeeds, not on initial page load

---

### 11. `proxy.js`
**Change:** Updated `Content-Security-Policy` `connect-src` to allow Firebase endpoints.

**Before:**
```
connect-src 'self'
```

**After:**
```
connect-src 'self' https://*.googleapis.com https://*.firebase.com https://*.firebaseio.com
```

**Why:** Firebase's `getToken()` makes outbound HTTPS requests to:
- `https://fcmregistrations.googleapis.com` — registers the device token
- `https://firebaseinstallations.googleapis.com` — creates a Firebase Installation ID

The old `connect-src 'self'` blocked these, causing `Failed to fetch` inside the Firebase SDK.

---

## Complete Flow Walkthrough

### Login Flow
```
1. User submits login form
2. POST /api/auth/login → validates credentials → returns JWT
3. loginQueue.add("sendLoginNotification", { email, name, ip })
4. login.worker picks up job:
   a. sendLoginNotification() → sends email via SMTP
   b. User.findOne({ email }) → gets fcmToken from MongoDB
   c. sendPushNotification(fcmToken, { title: "New Login Detected", ... })
   d. Firebase Admin SDK → POST to FCM server
   e. FCM → delivers push to user's browser
5. Browser service worker receives "push" event → showNotification()
```

### Deadline Flow
```
1. User creates todo with deadline via POST /api/projects/:id/todos
2. deadlineQueue.add("sendDeadlineReminder", { todoId, email, ... }, { delay: ms })
3. Job sits in queue until deadline time arrives
4. deadline.worker picks up job:
   a. Checks todo still exists, not done, deadline not removed
   b. sendDeadlineReminder() → sends email
   c. User.findOne({ email }) → gets fcmToken
   d. sendPushNotification(fcmToken, { title: "Deadline Reminder" / "Task Overdue!", ... })
   e. Firebase Admin SDK → FCM → browser push
```

### Invitation Flow
```
1. Owner sends invite via POST /api/projects/:id/invite
2. emailQueue.add("sendInviteEmail", { email, projectName, inviterName, token })
3. email.worker picks up job:
   a. sendInviteEmail() → sends invite email
   b. User.findOne({ email }) → gets invitee's fcmToken
   c. sendPushNotification(fcmToken, { title: "You've been invited!", ... })
   d. Firebase Admin SDK → FCM → invitee's browser push
```

### FCM Token Registration Flow
```
1. User logs in successfully → JWT returned
2. initFcm(jwt) called fire-and-forget (no await)
3. dynamic import("../lib/firebase") → loads Firebase Web SDK
4. Notification.requestPermission() → browser shows allow/block popup
5. navigator.serviceWorker.register("/api/firebase-messaging-sw") → registers SW
6. navigator.serviceWorker.ready → waits for SW to activate
7. getToken(messaging, { vapidKey, serviceWorkerRegistration })
   → Firebase SDK fetches https://fcmregistrations.googleapis.com
   → Returns unique FCM token string
8. POST /api/fcm/token { fcmToken } → saves to User.fcmToken in MongoDB
9. onForegroundMessage() → listens for pushes while tab is open
```

---

## Invalid Token Handling

When a user clears browser data, revokes permission, or the token expires:

```
Worker calls sendPushNotification(staleToken, ...)
  → Firebase Admin SDK throws error with code:
    "messaging/invalid-registration-token" OR
    "messaging/registration-token-not-registered"
  → notificationService returns false (does not throw)
  → Worker calls: User.updateOne({ email }, { fcmToken: null })
  → Token cleared from DB
  → Next login: browser generates a fresh token and saves it again
```

---

## New Files Summary

| File | Type | Purpose |
|------|------|---------|
| `lib/firebase-admin.js` | Server (Node.js) | Firebase Admin SDK singleton |
| `lib/notificationService.js` | Server (Node.js) | Reusable FCM send function |
| `lib/firebase.js` | Client (Browser) | Firebase Web SDK, token generation |
| `app/api/firebase-messaging-sw/route.js` | API Route | Serves service worker JS, bypasses Turbopack |
| `app/api/fcm/token/route.js` | API Route | Saves FCM token to MongoDB |

## Modified Files Summary

| File | What Changed |
|------|-------------|
| `models/User.js` | Added `fcmToken: String` field |
| `workers/login.worker.js` | Added FCM push after login email |
| `workers/deadline.worker.js` | Added FCM push after deadline email |
| `workers/email.worker.js` | Added FCM push after invite email |
| `app/page.js` | Added fire-and-forget FCM init after login |
| `proxy.js` | Added Firebase domains to `connect-src` CSP |

---

## Testing Steps

### 1. Start everything
```bash
# Terminal 1 — Next.js app
npm run dev

# Terminal 2 — All workers
npm run workers
```

### 2. Test FCM token registration
1. Open `http://localhost:3000`
2. Login with your credentials
3. Browser shows notification permission popup → click **Allow**
4. Check MongoDB: `db.users.findOne({ email: "your@email.com" })` → `fcmToken` field should be populated

### 3. Test Login notification
1. Login → within a few seconds you receive a push notification:
   "New Login Detected — Your account was accessed at ..."

### 4. Test Deadline notification
1. Create a task with a deadline 2 minutes from now
2. Wait for the deadline → push notification arrives:
   "Deadline Reminder — "Task name" in Project is due now."

### 5. Test Invitation notification
1. Send an invite to a user who has logged in and granted permission
2. That user receives push notification:
   "You've been invited! — You invited them to join "Project name""

### 6. Test invalid token cleanup
1. In browser DevTools → Application → Service Workers → Unregister
2. Clear site data
3. Worker will receive `messaging/registration-token-not-registered`
4. Check MongoDB → `fcmToken` is set to `null`
5. Next login → fresh token is generated and saved
