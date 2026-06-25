# Kairos — Act at the right moment, every time

Kairos is an AI-powered, context-aware productivity companion that proactively helps you plan, prioritize, and master your tasks before deadlines slip away. By analyzing your active calendar schedules, current stress thresholds, and task list details, Kairos transforms passive to-do tracking into an optimized, action-oriented hourly daily battle plan.

Designed to keep you in flow, Kairos works dynamically and resiliently, operating entirely within **100% free-tier resources**.

---

## 🌟 Key Features

### 🎙️ 1. Dynamic Voice & Text Task Intake
- **Voice Transcript Parsing**: Dictate your tasks naturally. Kairos uses the Google Gemini API to parse voice transcripts or written text blocks, automatically extracting title, deadline, priority, and estimated minutes.
- **Robust Local Heuristics Fallback**: If Gemini rate limits are reached (e.g., 429 Quota Exceeded on the free tier) or under transient high-demand spikes (503), Kairos seamlessly activates an on-device heuristic analyzer to extract variables without breaking your experience.

### 🧠 2. Deep Intake Task Analyzer
- **Urgency Scoring**: Computes a dynamic 1-10 priority scale based on how close the deadline is to the current time and current priority tier.
- **Subtask Decomposition**: Decomposes large objectives into bite-sized, actionable milestones based on semantic context clues.
- **Timeline & Conflict Warnings**: Scans active task structures to alert you of potential overlapping deadlines or double bookings.
- **Time Window Suggestions**: Recommends the optimal daily block (morning vs. afternoon slots) to schedule the activity.

### 📅 3. Interactive Daily Battle Plan
- **Calendar-Informed Schedule Grid**: Maps your tasks onto a chronologically sorted timeline.
- **Action Guides & Breaks**: Inserts scientific energy recovery blocks and break slots to prevent digital fatigue.
- **Google Calendar Sync**: Integrates with your Google Calendar through OAuth to detect true free slots and write optimized blocks automatically.

### 🔔 4. Motivational Nudges & Performance Summaries
- **Proactive Reminders**: Drafts personalized coaching messages based on completion percentages.
- **Productivity Wins Tracker**: Reflects on completed tasks, highlights daily wins, delivers actionable coaching tips, and sets priority targets for tomorrow.

---

## 🛠️ Free-Tier Architecture & Dynamic Tech Stack

Kairos leverages premium capabilities but operates strictly under **fully free-tier resources**:

1. **Google Gemini API (`@google/genai`)**
   - Uses `gemini-3.5-flash` via the standard **Gemini Free Tier** (5 requests/min).
   - Incorporates a smart exponential retry mechanism and automatically falls back to local NLP heuristics when the free quota is exhausted.
   - Requires **no credit card/billing** to run.

2. **Google Calendar API (OAuth 2.0)**
   - Accesses standard Google developer services.
   - Offers up to **1,000,000 free requests per day**, perfect for individual or team productivity calendars.

3. **Firebase Firestore (NoSQL Database)**
   - Utilizes the **Firebase Spark (Free) Plan**.
   - Grants **50,000 free reads, 20,000 free writes**, and **1 GiB of data storage** daily, preserving your lists securely across logins.

4. **Full-Stack Runtime**
   - **Frontend**: React 18 with Vite, styled with responsive, high-contrast Tailwind CSS, and powered by smooth animations via `motion/react`.
   - **Backend**: Express.js server that acts as a secure, server-side API proxy to sign requests and keep your secret API keys hidden from client browsers.

---

## 🚀 Getting Started

### 📋 Prerequisites
Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### 🔑 Environment Configuration
Create a `.env` file in the root directory based on `.env.example`:

```env
# Google Gemini API Key (Secret - Server Side Only)
GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 💻 Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run in Development Mode**:
   ```bash
   npm run dev
   ```
   The backend server and client-side Vite dev server will boot concurrently, accessible on port `3000`.

3. **Build and Compile**:
   ```bash
   npm run build
   ```
   This compiles the React web app into `/dist` and bundles the Express `server.ts` entry point into standalone CommonJS inside `dist/server.cjs` via `esbuild`.

4. **Production Run**:
   ```bash
   npm run start
   ```

---

## 🛡️ Resilience & Security Invariants
- **API Key Protection**: Secrets like `GEMINI_API_KEY` are kept strictly in server-side memory. No API keys are ever transmitted to the client.
- **Fail-Safe Heuristics**: Our lazy-initialization logic and heuristic parsing blocks ensure that offline states or rate limits never cause page crashes or block your planning loops.
