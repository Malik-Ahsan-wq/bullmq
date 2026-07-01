# Task Deadline Feature - Implementation Plan

## Overview
Add a deadline (date + optional time) to tasks. Owner/co-owner can set it when creating or editing. Displayed wherever tasks appear with visual indicators for overdue and approaching deadlines.

---

## Files to Modify (4 files only)

### 1. `models/Todo.js` — Add deadline field to schema
- Add `deadline` field: `{ type: Date, default: null }`
- No indexes needed (queried within project scope already)

### 2. `app/api/projects/[projectId]/todos/route.js` — Accept & return deadline
- **POST** (create): Accept `deadline` in request body, validate it's a valid Date or null, store on new todo
- **PUT** (update): Accept `deadline` in request body, validate, update on existing todo
- **GET**: Include `deadline` in formatted todo response (ISO string or null)
- Validation: If provided, must be a valid date string. Reject past deadlines on create (allow on update since tasks can be moved). Convert to Date object before storing.

### 3. `app/todos/page.js` — Frontend form & display
- **State**: Add `newDeadline` state (empty string)
- **Add form**: Add `<input type="datetime-local">` next to the assign dropdown, inside the existing `.add-todo` form
- **Todo display**: In each `<li>`, add deadline badge in `.todo-meta` section:
  - If no deadline: nothing shown
  - If deadline exists and task is not done:
    - Overdue (past deadline): red badge "Overdue"
    - Approaching (< 24 hours): orange badge with countdown
    - On track: blue badge with formatted date
  - If deadline exists and task is done: muted/grey badge, crossed out
- **Edit deadline**: Add a small "edit" icon/button next to deadline badge that toggles inline `<input type="datetime-local">` for quick edits (only for users with canEdit permission)
- **Cleanup**: Reset `newDeadline` after successful add
- **Payload**: Include `deadline` in POST and PUT request bodies

### 4. `app/globals.css` — Deadline styles
- `.deadline-badge` — base style (small badge, like assigned-badge)
- `.deadline-badge.overdue` — red background, white text
- `.deadline-badge.approaching` — orange background, dark text
- `.deadline-badge.on-track` — blue background (like assigned-badge)
- `.deadline-badge.done` — grey/muted style
- `.deadline-input-inline` — small datetime-local for inline editing
- Keep all existing styles untouched

---

## Deadline Logic (Client-side)
```
if (!deadline || done) → no indicator (or muted if done + deadline)
else if (now > deadline) → "overdue" (red)
else if (deadline - now < 24h) → "approaching" (orange, show "in Xh Ym")
else → "on-track" (blue, show formatted date)
```

## What stays the same
- Existing layout, spacing, and component structure
- All permission checks (owner/co-owner/creator/assignee)
- All other CRUD operations
- Legacy Redis todos (untouched)
- All other pages and sections

## Verification
1. Start dev server: `npm run dev`
2. Create a task with deadline → verify it appears in list
3. Create a task without deadline → verify no deadline badge
4. Set a past deadline → verify red "Overdue" badge
5. Set a deadline within 24h → verify orange "approaching" badge
6. Mark task as done → verify deadline badge mutes
7. Edit deadline inline → verify it updates
8. Check viewer role → verify no deadline input shown
9. Verify no layout shifts or broken styling
