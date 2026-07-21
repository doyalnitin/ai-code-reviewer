# AI Code Reviewer

> Real-time AI-powered code analysis with instant feedback, live preview, and one-click fixes.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" />
  <img src="https://img.shields.io/badge/Monaco-Editor-blue?logo=visual-studio-code" />
  <img src="https://img.shields.io/badge/AI-Groq-purple?logo=openai" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## What It Does

Write code in the editor and get **instant AI feedback** on bugs, security issues, performance problems, and style violations — all in real time as you type.

```
┌─────────────────────────────────────────────────────────────────┐
│  [AI]  AI Code Reviewer        [JS] [TS] [PY] [C+] [HT]   ●  │
├───────────────────────────────────┬─────────────────────────────┤
│                                   │  AI Review │ Preview        │
│  1  // JavaScript Example         │────────────│────────────────│
│  2  function calculateTotal(items){│            │                │
│  3    let total = 0;              │  ⚠ Use     │  ┌──────────┐ │
│  4    for (var i = 0; i < items.le│  const     │  │ Preview  │ │
│  5      total += items[i].price;  │  instead   │  │   Box    │ │
│  6    }                           │  of var    │  └──────────┘ │
│  7    return total;               │            │                │
│  8  }                             │  [Apply Fix│                │
│                                   │            │                │
├───────────────────────────────────┴─────────────────────────────┤
│  JavaScript  |  8 lines  |  189 chars         1 issue  UTF-8   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### Real-time AI Analysis
- As-you-type code review powered by **Groq** (Llama 3.1)
- Detects logic bugs, security risks, performance issues, and syntax errors
- Inline Monaco editor markers highlight issues directly in the code

### Language Support
| Language | Syntax Highlighting | AI Review |
|----------|:------------------:|:---------:|
| JavaScript | ✅ | ✅ |
| TypeScript | ✅ | ✅ |
| Python | ✅ | ✅ |
| C++ | ✅ | ✅ |
| HTML/CSS | ✅ | ✅ |

### Live Preview
- **HTML/CSS**: Full live preview with hot-reload as you edit
- **Other languages**: Formatted code view with syntax awareness

### One-Click Fixes
- Each AI suggestion includes an **Apply Fix** button
- Click to instantly replace the problematic line with the corrected code
- Monaco editor scrolls to the changed line

### GitHub PR Bot
- Automatically reviews pull requests when opened or updated
- Posts inline review comments on the PR with AI suggestions
- Supports webhook signature verification for security

```
GitHub PR Opened
       │
       ▼
  Smee.io Proxy
       │
       ▼
  POST /api/github/webhook
       │
       ▼
  Fetch PR Diff ──► Parse Files ──► AI Analysis ──► Post Review
```

---

## Architecture

```
realtime-code-reviewer/
├── app/
│   ├── api/
│   │   ├── review/route.ts          # AI code review endpoint
│   │   └── github/webhook/route.ts  # GitHub PR bot webhook
│   ├── globals.css                  # Tailwind + custom styles
│   ├── layout.tsx                   # Root layout with fonts
│   └── page.tsx                     # Home page
├── components/
│   └── CodeEditor.tsx               # Main editor + preview + review UI
├── lib/
│   └── reviewer.ts                  # Groq AI integration
├── .env.local                       # Environment variables
└── package.json
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Editor | Monaco Editor |
| AI | Groq SDK (Llama 3.1) |
| GitHub | Octokit, parse-diff |
| Typography | Geist, Plus Jakarta Sans |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Groq API key](https://console.groq.com)
- (Optional) A [GitHub token](https://github.com/settings/tokens) for PR bot

### 1. Clone & Install

```bash
git clone https://github.com/doyalnitin/ai-code-reviewer.git
cd ai-code-reviewer
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
GROQ_API_KEY=gsk_your_key_here
GITHUB_TOKEN=github_pat_your_token_here     # Optional: for PR bot
GITHUB_WEBHOOK_SECRET=your_secret_here      # Optional: for PR bot
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## GitHub PR Bot Setup

### Option A: Smee.io (Local Development)

```bash
# Start the dev server
npm run dev

# In another terminal, start the Smee proxy
npx smee-client \
  --url https://smee.io/your_webhook_url \
  --target http://localhost:3000/api/github/webhook
```

Then configure your GitHub webhook:
1. Go to **Settings > Webhooks > Add webhook**
2. **Payload URL**: Your Smee URL
3. **Content type**: `application/json`
4. **Secret**: Match your `GITHUB_WEBHOOK_SECRET`
5. **Events**: Select **Pull requests**

### Option B: Production (Vercel)

Deploy to Vercel, then set the webhook URL directly to your deployed `/api/github/webhook` endpoint.

---

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add GROQ_API_KEY
vercel env add GITHUB_TOKEN
vercel env add GITHUB_WEBHOOK_SECRET
```

Or connect your GitHub repo at [vercel.com/new](https://vercel.com/new).

### Environment Variables for Production

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API key for AI analysis |
| `GITHUB_TOKEN` | ❌ | GitHub PAT for PR bot (needs `pull_requests:write`) |
| `GITHUB_WEBHOOK_SECRET` | ❌ | Secret for webhook signature verification |

---

## How It Works

1. **You type code** in the Monaco editor
2. After 800ms of inactivity, the code is sent to `/api/review`
3. The API calls **Groq** (Llama 3.1) with a structured prompt
4. AI returns a JSON array of issues with line numbers, severity, and fixes
5. Issues appear as inline markers in the editor and cards in the review panel
6. Click **Apply Fix** to instantly apply a suggested correction

---

## License

MIT
