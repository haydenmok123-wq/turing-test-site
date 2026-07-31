# Turing Test Site Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new Next.js site for a human-vs-AI blind test with timed chat rooms, moderated messaging, reconnect support, anti-abuse matching, and a hidden admin center.

**Architecture:** Use a Next.js App Router application with client-side room state persistence in localStorage plus shared domain utilities for matchmaking, moderation, scoring, and admin access. Keep the first implementation self-contained so the full experience runs locally without requiring a separate backend, while leaving clear seams for later real-time and server-side upgrades.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, localStorage persistence, lightweight utility modules

---

### Task 1: Scaffold The App

**Files:**
- Create: `turing-test-app/*`
- Modify: `turing-test-app/package.json`
- Test: `npm run lint`

**Step 1: Generate the application**

Run: `npx create-next-app@latest turing-test-app --ts --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*" --yes`

**Step 2: Verify dependencies install**

Run: `npm install`
Expected: install completes without dependency errors

**Step 3: Verify the scaffold**

Run: `npm run lint`
Expected: lint passes on the fresh scaffold

### Task 2: Build Shared Domain Modules

**Files:**
- Create: `turing-test-app/src/lib/types.ts`
- Create: `turing-test-app/src/lib/matchmaking.ts`
- Create: `turing-test-app/src/lib/moderation.ts`
- Create: `turing-test-app/src/lib/storage.ts`
- Create: `turing-test-app/src/lib/mock-opponent.ts`
- Test: `turing-test-app/src/lib/*.ts`

**Step 1: Define domain models**

Add types for user profile, room state, room messages, opponent identity, moderation outcomes, and admin settings.

**Step 2: Implement moderation**

Add sensitive-word masking and toxic-message blocking helpers with structured reasons for UI feedback.

**Step 3: Implement matchmaking helpers**

Add device identity, recent-pair memory, cooldown logic, and duplicate-pair prevention to improve fairness.

**Step 4: Implement room persistence**

Add localStorage helpers for restoring room state, admin settings, and session metadata across refresh/re-entry.

**Step 5: Implement mock opponent behavior**

Create a response generator that can impersonate either a human-like or AI-like partner with varied reply delays and styles.

### Task 3: Build The Landing And Lobby Experience

**Files:**
- Modify: `turing-test-app/src/app/page.tsx`
- Create: `turing-test-app/src/components/hero.tsx`
- Create: `turing-test-app/src/components/lobby-panel.tsx`
- Create: `turing-test-app/src/components/admin-entry.tsx`
- Test: `npm run lint`

**Step 1: Build the hero**

Create a polished landing page with the product copy, core promises, and entry CTA aligned to the requested blind-test concept.

**Step 2: Build the lobby**

Create a lobby panel explaining random pairing, the 10-minute timer, the 10-second guess lock, and dual identification mechanics.

**Step 3: Add hidden admin access**

Add a five-click trigger plus password `398398` to reveal the admin center entry without cluttering the main UI.

### Task 4: Build The Blind-Test Room

**Files:**
- Create: `turing-test-app/src/app/room/[roomId]/page.tsx`
- Create: `turing-test-app/src/components/chat-room.tsx`
- Create: `turing-test-app/src/components/chat-message.tsx`
- Create: `turing-test-app/src/components/guess-controls.tsx`
- Test: `npm run lint`

**Step 1: Render the room shell**

Create a two-panel layout with room metadata, timer, reconnect banner, chat transcript, composer, and result state.

**Step 2: Enforce the 10-minute session**

Add countdown handling and room expiration behavior with visible status updates.

**Step 3: Enforce the 10-second guess lock**

Keep the `對方是真人` and `對方是 AI` buttons disabled until 10 seconds after the chat starts.

**Step 4: Preserve transcript continuity**

Restore message history, countdown progress, and opponent state when the user refreshes or re-enters the room.

**Step 5: Fix the result loop**

Ensure guessing does not silently reset the case, and route all retries through an explicit post-result action.

### Task 5: Build The Admin Center

**Files:**
- Create: `turing-test-app/src/app/admin/page.tsx`
- Create: `turing-test-app/src/components/admin-center.tsx`
- Modify: `turing-test-app/src/lib/storage.ts`
- Test: `npm run lint`

**Step 1: Build the admin gate**

Support the hidden trigger path and password validation.

**Step 2: Build moderation controls**

Expose toggles and editable word lists for masking/blocking rules.

**Step 3: Build matching controls**

Expose fairness knobs such as repeat-pair cooldown and suspicious-device thresholds.

**Step 4: Build AI controls**

Add fields for local AI deployment metadata so later integration has a clear configuration surface.

### Task 6: Verify Quality

**Files:**
- Modify: `turing-test-app/src/**/*`
- Test: `npm run lint`
- Test: `npm run build`

**Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS

**Step 3: Smoke test**

Run the dev server and verify:
- Landing page renders
- Matchmaking creates a room
- Guess buttons unlock after 10 seconds
- Moderation blocks banned content
- Refreshing the room restores chat history
- Hidden admin entry works after five clicks and password entry
