import { NextResponse } from "next/server";
import crypto from "crypto";
import parseDiff, { File } from "parse-diff";
import { Octokit } from "@octokit/core";
import { analyzeCode } from "@/lib/reviewer";

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
    less: "css",
  };
  return map[ext.toLowerCase()] || "javascript";
}

function mapAiLineToDiffLine(
  aiLineNumber: number,
  file: File,
  codeChunk: string
): number | null {
  const chunkLines = codeChunk.split("\n");
  if (aiLineNumber < 1 || aiLineNumber > chunkLines.length) return null;

  let currentChunkOffset = 0;

  for (const chunk of file.chunks) {
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

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret && webhookSecret !== "your_webhook_secret_here") {
      if (!verifyWebhookSignature(body, signature, webhookSecret)) {
        console.error("Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);

    if (event === "pull_request" && ["opened", "synchronize"].includes(payload.action)) {
      const pr = payload.pull_request;
      const token = process.env.GITHUB_TOKEN;

      if (!token) {
        console.error("Missing GITHUB_TOKEN");
        return NextResponse.json({ error: "Missing GITHUB_TOKEN" }, { status: 500 });
      }

      const octokit = new Octokit({ auth: token });

      const diffResponse = await fetch(pr.diff_url);
      if (!diffResponse.ok) {
        console.error("Failed to fetch PR diff:", diffResponse.status);
        return NextResponse.json({ error: "Failed to fetch diff" }, { status: 502 });
      }
      const diffText = await diffResponse.text();
      const parsedFiles = parseDiff(diffText);

      const allComments: { path: string; line: number; body: string }[] = [];

      for (const file of parsedFiles) {
        if (file.deleted || !file.to) continue;

        try {
          const codeChunk = file.chunks
            .map((c) => c.changes.map((ch) => ch.content).join("\n"))
            .join("\n");

          if (!codeChunk.trim()) continue;

          const ext = file.to.split(".").pop() || "js";
          const language = getLanguageFromExtension(ext);
          const issues = await analyzeCode(codeChunk, language);

          for (const issue of issues) {
            const diffLine = mapAiLineToDiffLine(issue.lineNumber, file, codeChunk);
            if (diffLine === null) continue;

            allComments.push({
              path: file.to!,
              line: diffLine,
              body: `🤖 **[AI Code Review] ${issue.title}**\n\nSeverity: ${issue.severity}\n\n${issue.message}\n\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\``,
            });
          }
        } catch (fileError) {
          console.error(`Error processing file ${file.to}:`, fileError);
        }
      }

      if (allComments.length > 0) {
        try {
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
          console.log(`Posted ${allComments.length} review comments`);
        } catch (apiError: unknown) {
          const message =
            apiError instanceof Error ? apiError.message : String(apiError);
          console.error("Failed to post review:", message);
          return NextResponse.json(
            { error: "Failed to post review", details: message },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        message: "PR Review Completed",
        commentsPosted: allComments.length,
      });
    }

    return NextResponse.json({ message: "Event ignored" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
