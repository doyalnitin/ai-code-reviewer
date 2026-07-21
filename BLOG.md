# I Built a Real-Time AI Code Reviewer in TypeScript — Every Line Explained

*A Monaco-powered editor that reviews your code as you type, renders live HTML previews, and auto-reviews GitHub Pull Requests — built with Groq AI, Next.js 16, and strict TypeScript throughout.*

---

I got tired of pushing code, waiting 10 minutes for CI, and then reading reviewer comments about bugs I could have caught while typing.

So I built a tool that catches them *while you type*.

It's called **AI Code Reviewer**. You write code in a Monaco editor (the same engine behind VS Code), and an AI instantly tells you about bugs, security issues, and performance problems — with a button to fix each one in one click.

I also built a GitHub bot that does the same thing automatically on every Pull Request.

Everything is written in TypeScript. No `any` types. No shortcuts. Here's how every piece works.

> **Try it live:** [realtime-code-reviewer.vercel.app](https://realtime-code-reviewer.vercel.app)
> **Source code:** [github.com/doyalnitin/ai-code-reviewer](https://github.com/doyalnitin/ai-code-reviewer)

---

## The Big Picture

The app has three panels side by side:

On the left is a full Monaco code editor. In the middle (or as a tab) is a live preview that renders HTML/CSS in real time. On the right is the AI review panel showing issues as color-coded cards.

The flow is simple: you type, the app waits 800 milliseconds for you to stop, then sends your code to Groq's Llama 3.1 model. The AI returns a JSON array of issues. Each issue gets displayed as a card in the review panel and as an inline marker in the editor.

Click "Apply Fix" and the problematic line gets replaced instantly.

There's also a GitHub webhook endpoint that does the same thing automatically when someone opens or updates a Pull Request. It fetches the diff, runs AI analysis on each changed file, and posts review comments directly on the PR.

---

## Starting With Types

Every TypeScript project should start here. The `ReviewIssue` interface is the data contract that flows through the entire application — from the AI prompt to the API response to the editor markers to the UI cards.

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

This single interface drives everything. The AI is prompted to return JSON matching this schema. The API route returns `ReviewIssue[]`. The editor component maps each issue to a Monaco marker. The review panel renders each issue as a card.

If you want to add a field — say, a `category` or `confidence` score — you change it here and the entire pipeline adapts. That's the power of starting with types.

---

## The AI Engine

I chose Groq because it's fast. Llama 3.1 responds in under a second, which makes the "real-time" experience actually feel real-time. No loading spinners, no lag.

The integration is 30 lines of TypeScript:

```typescript
// lib/reviewer.ts

import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function analyzeCode(
  code: string,
  language: string
): Promise<ReviewIssue[]> {
  const systemPrompt = `You are an expert real-time code reviewer.
Analyze the provided code for logic bugs, security risks,
syntax errors, and performance issues.
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

The key detail is `response_format: { type: "json_object" }`. This tells Groq to return valid JSON, not free-form text. That means I don't need regex parsing or text extraction. The response goes straight from `JSON.parse` to `ReviewIssue[]`.

The prompt asks the AI to output issues with `lineNumber`, `severity`, `title`, `message`, and `suggestion`. The `lineNumber` is relative to the code chunk it receives — we'll handle the mapping later.

---

## The API Route

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

No business logic here. Just validation and delegation. The AI does the heavy lifting.

---

## The Editor Component

This is the heart of the app. A single React component that manages the Monaco editor, the AI review, the live preview, and the one-click fix feature.

### Setting Up Types and Constants

First, the language configuration and severity styling:

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

const SEVERITY_CONFIG: Record<
  Severity,
  { color: string; bg: string; border: string; badge: string; icon: string }
> = {
  error: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500",
    badge: "bg-red-500/20 text-red-300",
    icon: "!",
  },
  warning: {
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500",
    badge: "bg-amber-500/20 text-amber-300",
    icon: "!",
  },
  info: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500",
    badge: "bg-blue-500/20 text-blue-300",
    icon: "i",
  },
};
```

The `as const` on `LANGUAGES` gives us literal types. When you select a language, TypeScript knows exactly which values are valid.

### State and Refs

The component uses `useRef` for Monaco editor instances (they persist across renders without causing re-renders) and `useState` for app state:

```typescript
export default function CodeEditor() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);

  const [language, setLanguage] = useState<string>("javascript");
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string>(DEFAULT_CODE[language]);
  const [activeTab, setActiveTab] = useState<"review" | "preview">("review");

  const debouncedReviewRef = useRef<ReturnType<typeof debounce> | null>(null);
```

The `debouncedReviewRef` is important. If I created the debounced function inside the component body, it would be recreated on every render, defeating the debounce. Storing it in a ref means it persists across renders.

### The Review Pipeline

Here's the core flow. When the user types, `handleCodeChange` updates the code state and triggers the debounced review:

```typescript
  const handleCodeChange = (val: string | undefined) => {
    const newCode = val || "";
    setCode(newCode);
    getDebouncedReview()(newCode, language);
  };

  const getDebouncedReview = () => {
    if (!debouncedReviewRef.current) {
      debouncedReviewRef.current = debounce(reviewCode, 800);
    }
    return debouncedReviewRef.current;
  };
```

The actual `reviewCode` function sends the code to the API and maps the response to Monaco markers:

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

      // Map AI issues to Monaco editor markers
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
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };
```

The important part is `setModelMarkers`. This is Monaco's API for adding inline error/warning/info markers. Each marker has a line range, a message (shown on hover), and a severity level. After this call, the editor shows colored squiggles on the problematic lines — exactly like VS Code does for TypeScript errors.

### The Apply Fix Feature

This is the feature I'm most proud of. When you click "Apply Fix" on a review card, it replaces the problematic line in the editor:

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

`executeEdits` is Monaco's way of making programmatic changes. It takes an edit source string (used for undo grouping) and an array of edits. Each edit has a `range` (what to replace) and `text` (what to replace it with).

The magic is that `executeEdits` creates an undo entry. If the fix isn't what you wanted, just hit Ctrl+Z. The `forceMoveMarkers: true` flag ensures inline markers shift correctly if the replacement changes the line length.

After the edit, `revealLineInCenter` scrolls the editor to show the changed line, and `setCode` syncs the state.

### Live Preview

For HTML/CSS, the preview renders the raw code in an iframe. For other languages, it shows a formatted code view:

```typescript
  const previewContent = useMemo(() => {
    if (language === "html") return code;

    const langLabel =
      LANGUAGES.find((l) => l.value === language)?.label || language;

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

The `useMemo` is important. Without it, the preview HTML would be recomputed on every render, even if the code hasn't changed. With the dependency array `[code, language]`, it only recomputes when the code or language changes.

---

## The GitHub PR Bot

This is the most complex piece. It receives GitHub webhook events, parses the diff, runs AI analysis on each file, and posts review comments.

### Webhook Signature Verification

GitHub signs every webhook with HMAC-SHA256. Without verification, anyone could send fake events to your endpoint:

```typescript
// app/api/github/webhook/route.ts

import crypto from "crypto";

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(body).digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}
```

`crypto.timingSafeEqual` is critical. A regular `===` comparison would be vulnerable to timing attacks — an attacker could measure how long the comparison takes to guess the correct signature character by character. `timingSafeEqual` takes the same amount of time regardless of where the strings differ.

### Language Detection

The PR bot needs to figure out what language each file is written in. It maps file extensions to Monaco language IDs:

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

This is the hardest part of the entire project. Here's the problem:

The AI receives a "code chunk" — the combined added and modified lines from a file's diff. It returns line numbers relative to that chunk. But GitHub's review API needs line numbers relative to the *actual file in the diff*.

These are not the same thing.

Imagine a diff chunk that starts at line 10 of the file. The AI sees line 1 of the chunk, but GitHub needs line 10. If the chunk skips some lines (context lines), the mapping gets even more complex.

Here's the mapper:

```typescript
import { File } from "parse-diff";

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
        return change.ln;
      }
    }

    currentChunkOffset = chunkEnd;
  }

  return null;
}
```

It walks through the `parseDiff` chunks, tracking the offset. When it finds the chunk containing the AI's line number, it looks up the actual file line number from the change's `ln` property.

Without this mapping, review comments would land on wrong lines or the GitHub API would reject them with a 422 error.

### The Webhook Handler

The main handler ties everything together:

```typescript
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");

    // Verify signature
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

      // Process each file with error isolation
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
              issue.number, file, codeChunk
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

      // Post the review
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

The `try/catch` inside the `for` loop is important. If one file's analysis fails (bad syntax, API timeout, whatever), the loop continues to the next file. Without this, one broken file would kill the entire review.

---

## What I Learned

**1. Start with types, not components.** The `ReviewIssue` interface was the right starting point. It defined the data contract before any UI existed. When I added the GitHub bot later, the same interface worked without changes.

**2. `response_format: { type: "json_object" }` changes everything.** Forcing LLMs to return structured JSON eliminates parsing complexity. The alternative — asking for free-form text and parsing it with regex — is fragile and error-prone.

**3. Monaco's `executeEdits` is criminally underrated.** Programmatic code editing with undo support, marker preservation, and scroll-to-line. It's the key to the "Apply Fix" feature.

**4. Debouncing is not optional.** Without the 800ms debounce, every keystroke fires an API call. With it, the app makes 10-20x fewer calls while the user experience feels identical.

**5. The line number mapping problem is subtle.** AI line numbers, chunk line numbers, and file line numbers are three different things. Understanding the `parseDiff` data structure is essential.

**6. `crypto.timingSafeEqual` should be your default.** Any time you're comparing secrets (webhook signatures, tokens, passwords), use timing-safe comparison. It's 10 extra characters and prevents a real class of attacks.

---

> **Live demo:** [realtime-code-reviewer.vercel.app](https://realtime-code-reviewer.vercel.app)
> **Source code:** [github.com/doyalnitin/ai-code-reviewer](https://github.com/doyalnitin/ai-code-reviewer)

If you build something similar, I'd love to hear about it. Open an issue on the repo or find me on Twitter.

*Built with TypeScript, Next.js 16, Monaco Editor, Groq AI, and strict typing throughout.*
