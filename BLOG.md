# I Built a Real-Time AI Code Reviewer That Reviews Your Code as You Type

## And it also auto-reviews GitHub Pull Requests with one-click fixes

---

Every developer knows the pain. You push code, wait for CI, and then scroll through a wall of comments from reviewers telling you about that `var` you used, the missing null check, or the security hole you missed. What if your code could review itself — *while you're still writing it*?

That's exactly what I built: **AI Code Reviewer** — a real-time code analysis tool that watches your code as you type, catches bugs instantly, and even auto-reviews your GitHub Pull Requests.

Let me walk you through the entire build.

---

## What It Does

Write code in a Monaco-powered editor (the same engine behind VS Code), and get instant AI feedback on bugs, security risks, performance issues, and style violations — all before you even hit save.

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

## The Three-Panel Design

The UI is split into three distinct panels, each serving a purpose:

### 1. The Editor (Left Panel)
A full Monaco editor with syntax highlighting, bracket colorization, smooth scrolling, and inline error markers. As you type, the AI analyzes your code and marks problematic lines directly in the gutter.

### 2. AI Review (Right Panel — Tab 1)
Each issue appears as a severity-colored card:
- **Red** — Errors (bugs, security vulnerabilities)
- **Amber** — Warnings (code smells, potential issues)
- **Blue** — Info (suggestions, best practices)

Every card shows the issue title, line number, explanation, the suggested fix in a code block, and an **"Apply Fix"** button that replaces the line instantly.

### 3. Live Preview (Right Panel — Tab 2)
For HTML/CSS code, you get a live rendering that updates in real time as you edit. For other languages, it shows a formatted code view. No more switching to a browser tab to check your markup.

---

## The Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Editor | Monaco Editor |
| AI | Groq SDK (Llama 3.1) |
| GitHub | Octokit, parse-diff |
| Fonts | Geist, Plus Jakarta Sans |
| Deploy | Vercel |

Why Groq? Because it's fast. Like, *really* fast. The Llama 3.1 model responds in under a second, which makes the "real-time as you type" experience actually feel real-time. No lag, no waiting.

---

## How the AI Analysis Works

The flow is deceptively simple:

1. You type code
2. After 800ms of inactivity (debounced), the code is sent to `/api/review`
3. The API calls Groq with a structured prompt asking for JSON output
4. The AI returns issues with line numbers, severity, titles, messages, and fixes
5. Issues appear as inline markers in the editor and cards in the review panel
6. You click "Apply Fix" and the line is replaced instantly

Here's the prompt that does the magic:

```typescript
const systemPrompt = `You are an expert real-time code reviewer.
Analyze the provided code for logic bugs, security risks, syntax errors, and performance issues.
You MUST output ONLY a JSON array matching this exact schema:
[
  {
    "lineNumber": 1,
    "severity": "error",
    "title": "Short issue title",
    "message": "Clear explanation of what is wrong",
    "suggestion": "Exact fix or corrected code snippet"
  }
]`;
```

The key insight: by demanding structured JSON output, we can reliably parse the AI's response and map it directly to editor markers and UI cards. No messy text parsing, no regex gymnastics.

---

## The Apply Fix Feature

This was the trickiest part. The AI gives you a line number and a suggestion, but you need to map that back to the Monaco editor's internal model.

```typescript
const applyFix = (issue: ReviewIssue) => {
  const model = editorRef.current.getModel();
  const lineNumber = Math.min(issue.lineNumber, model.getLineCount());
  const lineContent = model.getLineContent(lineNumber);

  editorRef.current.executeEdits("ai-apply-fix", [{
    range: {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineContent.length + 1,
    },
    text: issue.suggestion,
    forceMoveMarkers: true,
  }]);
};
```

`executeEdits` is Monaco's way of making programmatic changes. It creates an undo stack entry too, so users can Ctrl+Z to revert if the fix isn't what they wanted.

---

## The GitHub PR Bot

This is where it gets interesting. I wanted the same AI to review code automatically when a Pull Request is opened — no manual triggering needed.

### Architecture

```
GitHub PR Opened
       │
       ▼
  Smee.io Proxy (local dev) / Vercel endpoint (production)
       │
       ▼
  POST /api/github/webhook
       │
       ▼
  Verify Signature ──► Fetch PR Diff ──► Parse Files ──► AI Analysis ──► Post Review
```

### The Hard Parts

**1. Line Number Mapping**

The AI gives line numbers relative to the *code chunk* (combined added/modified lines). But GitHub review comments need line numbers relative to the *file in the diff*. Wrong numbers = comments on wrong lines or 422 API errors.

I wrote a mapper that walks through the `parseDiff` chunks, tracks each change's actual file line number, and maps the AI's chunk-relative index to the real diff line:

```typescript
function mapAiLineToDiffLine(
  aiLineNumber: number,
  file: File,
  codeChunk: string
): number | null {
  let currentChunkOffset = 0;
  for (const chunk of file.chunks) {
    const chunkEnd = currentChunkOffset + chunk.changes.length;
    if (aiLineNumber <= chunkEnd) {
      const change = chunk.changes[aiLineNumber - currentChunkOffset - 1];
      if (change && "ln" in change && change.ln) return change.ln;
    }
    currentChunkOffset = chunkEnd;
  }
  return null;
}
```

**2. Webhook Signature Verification**

GitHub signs every webhook with HMAC-SHA256. Without verification, anyone could send fake events to your endpoint. I added crypto-based signature verification with timing-safe comparison:

```typescript
function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(body).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
```

**3. Per-File Error Isolation**

If one file's analysis fails (bad syntax, API timeout), the entire review loop shouldn't stop. Each file is wrapped in its own try/catch so one failure doesn't block the rest.

---

## Setting Up the PR Bot

### Local Development with Smee

Smee.io acts as a webhook proxy — it receives GitHub events and forwards them to your local server.

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Start Smee proxy
npx smee-client \
  --url https://smee.io/YOUR_WEBHOOK_URL \
  --target http://localhost:3000/api/github/webhook
```

Then configure the webhook in your GitHub repo settings.

### Production on Vercel

Deploy to Vercel, set your environment variables, and point the GitHub webhook directly to your deployed `/api/github/webhook` endpoint. No Smee needed.

---

## Deployment

One command:

```bash
vercel --prod
```

Set environment variables in the Vercel dashboard:

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API key for AI analysis |
| `GITHUB_TOKEN` | ❌ | GitHub PAT for PR bot |
| `GITHUB_WEBHOOK_SECRET` | ❌ | Secret for webhook verification |

---

## What I Learned

**1. Structured output is everything.** Asking the AI for JSON with a strict schema made parsing trivial. Without this, you'd be fighting regex all day.

**2. Debouncing is non-negotiable.** Without the 800ms debounce, every keystroke would fire an API call. Your API costs would explode and the UI would lag.

**3. Monaco's API is powerful but underrated.** `executeEdits`, `setModelMarkers`, `getModel` — once you understand the model layer, you can do anything programmatically.

**4. Webhook security isn't optional.** Even for a side project, signature verification takes 10 lines of code and prevents real attacks.

**5. The PR bot line mapping problem is subtle.** AI line numbers don't map 1:1 to diff line numbers. You need to understand the diff format to get it right.

---

## Try It Yourself

The app is live at **[realtime-code-reviewer.vercel.app](https://realtime-code-reviewer.vercel.app)**

Source code: **[github.com/doyalnitin/ai-code-reviewer](https://github.com/doyalnitin/ai-code-reviewer)**

Star the repo if you find it useful. Open an issue if you find a bug. And if you build something similar — I'd love to hear about it.

---

*Built with Next.js 16, Monaco Editor, Groq AI, and a lot of coffee.*
