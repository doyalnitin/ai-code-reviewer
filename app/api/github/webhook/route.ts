import { NextResponse } from "next/server";
import parseDiff from "parse-diff";
import { Octokit } from "@octokit/core";
import { analyzeCode } from "@/lib/reviewer";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const event = req.headers.get("x-github-event");

    // Only trigger when a Pull Request is opened or updated
    if (event === "pull_request" && ["opened", "synchronize"].includes(payload.action)) {
      const pr = payload.pull_request;
      const token = process.env.GITHUB_TOKEN;

      if (!token) {
        console.error("Missing GITHUB_TOKEN in environment variables.");
        return NextResponse.json({ error: "Missing GITHUB_TOKEN" }, { status: 500 });
      }

      const octokit = new Octokit({ auth: token });

      // 1. Fetch the PR Diff from GitHub
      const diffResponse = await fetch(pr.diff_url);
      const diffText = await diffResponse.text();
      const parsedFiles = parseDiff(diffText);

      // 2. Iterate through modified files
      for (const file of parsedFiles) {
        if (file.deleted || !file.to) continue;

        // Combine added/modified lines for analysis
        const codeChunk = file.chunks
          .map((c) => c.changes.map((ch) => ch.content).join("\n"))
          .join("\n");

        if (!codeChunk.trim()) continue;

        const fileExtension = file.to.split(".").pop() || "javascript";
        const issues = await analyzeCode(codeChunk, fileExtension);

        // 3. Map AI suggestions into GitHub line-by-line review comments
        if (issues.length > 0) {
          const comments = issues.map((issue) => ({
            path: file.to!,
            line: issue.lineNumber || 1,
            body: `🤖 **[AI Code Review] ${issue.title}**\n\n${issue.message}\n\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\``,
          }));

          // 4. Submit the review to the PR
          await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            pull_number: pr.number,
            event: "COMMENT",
            comments: comments,
          });
        }
      }

      return NextResponse.json({ message: "PR Review Completed" });
    }

    return NextResponse.json({ message: "Event ignored" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}