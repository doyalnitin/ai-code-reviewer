# I Built a Real-Time AI Code Reviewer in TypeScript — Here's the Full Source Code

## A deep dive into building a Monaco-powered editor with Groq AI, live preview, and a GitHub PR bot

---

Every developer knows the loop: push code, wait for CI, scroll through reviewer comments about that `var` you used or the null check you forgot. What if your code could review itself — *while you're still writing it*?

I built **AI Code Reviewer** — a TypeScript app that analyzes your code in real time as you type, shows a live preview for HTML/CSS, and auto-reviews GitHub Pull Requests with one-click fixes.

Here's every line of TypeScript that makes it work.

> **Live demo:** [realtime-code-reviewer.vercel.app](https://realtime-code-reviewer.vercel.app)
> **Source:** [github.com/doyalnitin/ai-code-reviewer](https://github.com/doyalnitin/ai-code-reviewer)

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React 19)                           │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Monaco Editor   │  │ Live Preview │  │    AI Review Panel     │ │
│  │  (TypeScript)    │  │  (iframe)    │  │  (cards + apply fix)   │ │
│  └────────┬────────┘  └──────────────┘  └───────────┬────────────┘ │
│           │                                          │              │
│           └──────────── debounce 800ms ──────────────┘              │
│                              │                                      │
│                              ▼                                      │
│                    POST /api/review                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        SERVER (Next.js 16)                           │
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │  Groq SDK     │────▶│  Llama 3.1   │────▶│  JSON Response   │    │
│  │  (TypeScript) │     │  (AI Model)  │     │  (ReviewIssue[]) │    │
│  └──────────────┘     └──────────────┘     └──────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              GitHub Webhook (Optional)                        │   │
│  │  Webhook → Parse Diff → AI Review → Post PR Comments         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. The Type System — Foundation of Everything

Every great TypeScript project starts with well-defined types. Here's the `ReviewIssue` interface that flows through the entire app:

```typescript
// lib/reviewer.ts

export interface ReviewIssue {
  lineNumber: number;
  severity: "error" | "warning" | "info";
  title: string;
  message: string;
  suggestion: string;
}
```

This single interface drives the AI prompt, the API response, the Monaco editor markers, the review cards, and the Apply Fix button. Change the type here, and the entire pipeline updates.

---

## 2. The AI Engine — Groq + Llama 3.1

The AI integration is clean and type-safe. Groq gives us sub-second responses, making the "real-time" experience actually feel real-time.

```typescript
// lib/reviewer.ts

import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function analyzeCode(
  code: string,
  language: string
): Promise<ReviewIssue[]> {
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

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Language: ${language}\n\nCode:\n${code}` },
    ],
    model: "llama-3.1-8b-instant",
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "[]";
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : (parsed.issues || []);
}
```

**Key insight:** The `response_format: { type: "json_object" }` parameter forces Groq to return valid JSON. No regex parsing, no text extraction — just structured data we can use directly.

---

## 3. The API Route — Thin Server Layer

The review endpoint is intentionally thin. It validates input and delegates to the AI:

```typescript
// app/api/review/route.ts

import { NextResponse } from "next/server";
import { analyzeCode } from "@/lib/reviewer";

export async function POST(req: Request) {
  try {
    const { code, language } = await req.json();

    if (!code || !language) {
      return NextResponse.json(
        { error: "Code and language required" },
        { status: 400 }
      );
    }

    const issues = await analyzeCode(code, language);
    return NextResponse.json({ issues });
  } catch {
    return NextResponse.json(
      { error: "Failed to process review" },
      { status: 500 }
    );
  }
}
```

---

## 4. The Monaco Editor Component — Where It All Comes Together

This is the heart of the app. A 370-line TypeScript component that manages the editor, AI review, live preview, and one-click fixes.

### Type Definitions and Constants

```typescript
// components/CodeEditor.tsx

import type { editor } from "monaco-editor";
import { ReviewIssue } from "@/lib/reviewer";

const LANGUAGES = [
  { label: "JavaScript", value: "javascript", icon: "JS" },
  { label: "TypeScript", value: "typescript", icon: "TS" },
  { label: "Python", value: "python", icon: "PY" },
  { label: "C++", value: "cpp", icon: "C+" },
  { label: "HTML/CSS", value: "html", icon: "HT" },
] as const;

type Severity = "error" | "warning" | "info";

const SEVERITY_CONFIG: Record<Severity, {
  color: string;
  bg: string;
  border: string;
  badge: string;
  icon: string;
}> = {
  error: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500",
    badge: "bg-red-500/20 text-red-300",
    icon: "!"
  },
  warning: {
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500",
    badge: "bg-amber-500/20 text-amber-300",
    icon: "!"
  },
  info: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500",
    badge: "bg-blue-500/20 text-blue-300",
    icon: "i"
  },
};
```

### State Management with useRef for Editor Instances

```typescript
export default function CodeEditor() {
  // Editor refs — typed with Monaco's interfaces
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);

  // App state
  const [language, setLanguage] = useState<string>("javascript");
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string>(DEFAULT_CODE[language]);
  const [activeTab, setActiveTab] = useState<"review" | "preview">("review");

  // Debounce ref — avoids re-creating on every render
  const debouncedReviewRef = useRef<ReturnType<typeof debounce> | null>(null);
```

### The Debounced Review Function

This is the key to making it "real-time" without hammering the API:

```typescript
  const reviewCode = async (codeStr: string, lang: string) => {
    if (!codeStr.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeStr, language: lang }),
      });
      const data = await res.json();
      const reviewIssues: ReviewIssue[] = data.issues || [];
      setIssues(reviewIssues);

      // Map AI issues → Monaco editor markers
      if (editorRef.current && monacoRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          const markers = reviewIssues.map((issue) => ({
            startLineNumber: issue.lineNumber || 1,
            startColumn: 1,
            endLineNumber: issue.lineNumber || 1,
            endColumn: 1000,
            message: `${issue.title}: ${issue.message}\nFix: ${issue.suggestion}`,
            severity:
              issue.severity === "error"
                ? monacoRef.current!.MarkerSeverity.Error
                : issue.severity === "warning"
                ? monacoRef.current!.MarkerSeverity.Warning
                : monacoRef.current!.MarkerSeverity.Info,
          }));
          monacoRef.current.editor.setModelMarkers(
            model, "ai-reviewer", markers
          );
        }
      }
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  // Lazy-init debounced function
  const getDebouncedReview = () => {
    if (!debouncedReviewRef.current) {
      debouncedReviewRef.current = debounce(reviewCode, 800);
    }
    return debouncedReviewRef.current;
  };
```

The flow:

```
User types → handleCodeChange → setCode → debouncedReview (800ms)
    → POST /api/review → Groq AI → JSON response
    → setIssues (UI cards) + setModelMarkers (editor squiggles)
```

### The Apply Fix Feature

This uses Monaco's `executeEdits` API to programmatically replace a line:

```typescript
  const applyFix = (issue: ReviewIssue) => {
    if (!editorRef.current || !issue.suggestion) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const lineNumber = Math.min(issue.lineNumber, lineCount);
    const lineContent = model.getLineContent(lineNumber);

    const selection: editor.IRange = {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineContent.length + 1,
    };

    editorRef.current.executeEdits("ai-apply-fix", [
      {
        range: selection,
        text: issue.suggestion,
        forceMoveMarkers: true,
      },
    ]);

    editorRef.current.revealLineInCenter(lineNumber);
    setCode(editorRef.current.getValue());
  };
```

**Why this works:**
- `executeEdits` creates an undo-able edit (Ctrl+Z reverts it)
- `forceMoveMarkers: true` shifts inline markers if the line length changes
- `revealLineInCenter` scrolls the editor to show the changed line

### Live Preview with useMemo

The preview panel uses `useMemo` to avoid recomputing on every render:

```typescript
  const previewContent = useMemo(() => {
    if (language === "html") return code;

    const langLabel = LANGUAGES.find(
      (l) => l.value === language
    )?.label || language;

    return `<!DOCTYPE html>
<html><head><style>
  body {
    font-family: 'Geist Mono', monospace;
    background: #0f172a;
    color: #e2e8f0;
    padding: 2rem;
  }
  .header {
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 1rem;
  }
  .code { white-space: pre-wrap; line-height: 1.6; }
</style></head><body>
  <div class="header">${langLabel} Output Preview</div>
  <div class="code">${
    code.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }</div>
</body></html>`;
  }, [code, language]);
```

For HTML/CSS, it renders the raw code in an iframe. For other languages, it shows a formatted code view.

---

## 5. The GitHub PR Bot — Webhook in TypeScript

This is the most complex piece. It receives GitHub webhook events, parses the diff, runs AI analysis on each file, and posts review comments.

### Webhook Signature Verification

```typescript
// app/api/github/webhook/route.ts

import crypto from "crypto";
import parseDiff, { File } from "parse-diff";
import { Octokit } from "@octokit/core";

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(body).digest("hex")}`;

  // Timing-safe comparison prevents timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}
```

### Language Detection from File Extensions

```typescript
function getLanguageFromExtension(ext: string): string {
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    c: "cpp",
    h: "cpp",
    hpp: "cpp",
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
  };
  return map[ext.toLowerCase()] || "javascript";
}
```

### The Line Number Mapping Problem

This is the hardest part. The AI gives line numbers relative to the *code chunk* (combined added/modified lines). GitHub needs line numbers relative to the *file in the diff*. Here's the mapper:

```typescript
function mapAiLineToDiffLine(
  aiLineNumber: number,
  file: File,
  codeChunk: string
): number | null {
  const chunkLines = codeChunk.split("\n");
  if (aiLineNumber < 1 || aiLineNumber > chunkLines.length) return null;

  let currentChunkOffset = 0;

  for (const chunk of file.changes) {
    const chunkSize = chunk.changes.length;
    const chunkEnd = currentChunkOffset + chunkSize;

    if (aiLineNumber <= chunkEnd) {
      const indexInChunk = aiLineNumber - currentChunkOffset - 1;
      const change = chunk.changes[indexInChunk];

      if (change && "ln" in change && change.ln) {
        return change.ln;  // Actual file line number
      }
    }

    currentChunkOffset = chunkEnd;
  }

  return null;
}
```

```
AI chunk line:     1   2   3   4   5
                   │   │   │   │   │
Actual diff line: 10  11  15  16  17   ← These are the lines GitHub needs
                   │   │   │   │   │
                   ▼   ▼   ▼   ▼   ▼
mapAiLineToDiffLine() maps chunk-relative → file-relative
```

### The Main Webhook Handler

```typescript
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");

    // Verify webhook signature
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret && webhookSecret !== "your_webhook_secret_here") {
      if (!verifyWebhookSignature(body, signature, webhookSecret)) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(body);

    if (
      event === "pull_request" &&
      ["opened", "synchronize"].includes(payload.action)
    ) {
      const pr = payload.pull_request;
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        return NextResponse.json(
          { error: "Missing GITHUB_TOKEN" },
          { status: 500 }
        );
      }

      const octokit = new Octokit({ auth: token });

      // Fetch and parse the PR diff
      const diffResponse = await fetch(pr.diff_url);
      const diffText = await diffResponse.text();
      const parsedFiles = parseDiff(diffText);

      const allComments: {
        path: string;
        line: number;
        body: string;
      }[] = [];

      // Process each changed file
      for (const file of parsedFiles) {
        if (file.deleted || !file.to) continue;

        try {
          const codeChunk = file.chunks
            .map((c) =>
              c.changes.map((ch) => ch.content).join("\n")
            )
            .join("\n");

          if (!codeChunk.trim()) continue;

          const ext = file.to.split(".").pop() || "js";
          const language = getLanguageFromExtension(ext);
          const issues = await analyzeCode(codeChunk, language);

          for (const issue of issues) {
            const diffLine = mapAiLineToDiffLine(
              issue.lineNumber, file, codeChunk
            );
            if (diffLine === null) continue;

            allComments.push({
              path: file.to!,
              line: diffLine,
              body: [
                `**[AI Code Review] ${issue.title}**`,
                "",
                `Severity: ${issue.severity}`,
                "",
                issue.message,
                "",
                "```suggestion",
                issue.suggestion,
                "```",
              ].join("\n"),
            });
          }
        } catch (fileError) {
          console.error(`Error processing ${file.to}:`, fileError);
        }
      }

      // Post the review to GitHub
      if (allComments.length > 0) {
        await octokit.request(
          "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
          {
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            pull_number: pr.number,
            event: "COMMENT",
            comments: allComments,
          }
        );
      }

      return NextResponse.json({
        message: "PR Review Completed",
        commentsPosted: allComments.length,
      });
    }

    return NextResponse.json({ message: "Event ignored" });
  } catch (error) {
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
```

---

## 6. The Review API Card Component

Each issue renders as a severity-colored card with an Apply Fix button:

```
┌─────────────────────────────────────────────┐
│  !  Use const instead of var     WARNING    │
│                                             │
│  'var' is function-scoped and can lead      │
│  to unexpected behavior. Use 'const' or     │
│  'let' instead.                             │
│                                             │
│  Line 4                                     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ const i = 0;                        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │           Apply Fix                  │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

The Apply Fix button appears on hover (`opacity-0 group-hover:opacity-100`) to keep the UI clean.

---

## 7. Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 16 | App Router, server components, API routes |
| UI | React 19 + Tailwind CSS 4 | Fast rendering, utility-first styling |
| Editor | Monaco Editor | Same engine as VS Code |
| AI | Groq SDK (Llama 3.1) | Sub-second response times |
| GitHub | Octokit + parse-diff | Type-safe GitHub API |
| Fonts | Geist + Plus Jakarta Sans | Clean, modern typography |
| Deploy | Vercel | Zero-config Next.js hosting |

---

## 8. Getting Started

```bash
# Clone
git clone https://github.com/doyalnitin/ai-code-reviewer.git
cd ai-code-reviewer

# Install
npm install

# Configure
echo "GROQ_API_KEY=gsk_your_key" > .env.local

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start coding.

---

## What I Learned Building This

**1. TypeScript interfaces are your API contract.** The `ReviewIssue` interface defined once flows through AI prompts, API responses, editor markers, and UI components. One type change updates everything.

**2. Monaco's `executeEdits` is underrated.** Programmatic code editing with undo support, marker preservation, and scroll-to-line — all in one call.

**3. `response_format: { type: "json_object" }` is a game-changer.** Forcing structured output from LLMs eliminates 90% of the parsing complexity.

**4. Debouncing is non-negotiable.** Without the 800ms debounce, every keystroke fires an API call. With it, you get 10-20x fewer calls with the same UX.

**5. The line number mapping problem is subtle.** AI line numbers ≠ diff line numbers ≠ file line numbers. You need to understand the diff format to bridge them.

---

> **Try it:** [realtime-code-reviewer.vercel.app](https://realtime-code-reviewer.vercel.app)
> **Star it:** [github.com/doyalnitin/ai-code-reviewer](https://github.com/doyalnitin/ai-code-reviewer)

*Built with TypeScript, Next.js 16, Monaco Editor, Groq AI, and a lot of type safety.*
