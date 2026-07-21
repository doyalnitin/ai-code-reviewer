"use client";

import React, { useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import debounce from "lodash.debounce";
import { ReviewIssue } from "@/lib/reviewer";

const LANGUAGES = [
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "Python", value: "python" },
  { label: "C++", value: "cpp" },
  { label: "HTML/CSS", value: "html" },
] as const;

const DEFAULT_CODE: Record<string, string> = {
  javascript: `// Write code here...\nfunction calculateTotal(items) {\n  let total = 0;\n  for(var i=0; i<items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}`,
  typescript: `// Write code here...\nfunction calculateTotal(items: { price: number }[]): number {\n  let total = 0;\n  for(var i=0; i<items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}`,
  python: `# Write code here...\ndef calculate_total(items):\n    total = 0\n    for i in range(len(items)):\n        total += items[i]["price"]\n    return total`,
  cpp: `// Write code here...\n#include <vector>\n\nstruct Item { double price; };\n\ndouble calculateTotal(const std::vector<Item>& items) {\n  double total = 0;\n  for(int i=0; i<items.size(); i++) {\n    total += items[i].price;\n  }\n  return total;\n}`,
  html: `<!-- Write code here... -->\n<style>\n  .card {\n    background: white;\n    border-radius: 8px;\n    padding: 1rem;\n  }\n</style>\n<div class="card">\n  <h2>Hello World</h2>\n</div>`,
};

export default function CodeEditor() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [language, setLanguage] = useState<string>("javascript");
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedReviewRef = useRef<ReturnType<typeof debounce> | null>(null);

  const reviewCode = async (code: string, lang: string) => {
    if (!code.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: lang }),
      });
      const data = await res.json();
      const reviewIssues: ReviewIssue[] = data.issues || [];
      setIssues(reviewIssues);

      if (editorRef.current && monacoRef.current) {
    const model = editorRef.current.getModel();
    if (!model) return;
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

          monacoRef.current.editor.setModelMarkers(model, "ai-reviewer", markers);
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const getDebouncedReview = () => {
    if (!debouncedReviewRef.current) {
      debouncedReviewRef.current = debounce(reviewCode, 800);
    }
    return debouncedReviewRef.current;
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setIssues([]);
    if (editorRef.current) {
      editorRef.current.setValue(DEFAULT_CODE[newLang] || "");
    }
  };

  const applyFix = (issue: ReviewIssue) => {
    if (!editorRef.current || !issue.suggestion) return;

    const model = editorRef.current.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    const lineNumber = Math.min(issue.lineNumber, lineCount);
    const lineContent = model.getLineContent(lineNumber);

    const selection = {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineContent.length + 1,
    };

    const edits = [
      {
        range: selection,
        text: issue.suggestion,
        forceMoveMarkers: true,
      },
    ];

    editorRef.current.executeEdits("ai-apply-fix", edits);
    editorRef.current.revealLineInCenter(lineNumber);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      <header className="p-4 bg-slate-800 flex justify-between items-center border-b border-slate-700">
        <h1 className="text-xl font-bold">Real-time AI Code Reviewer</h1>
        <div className="flex items-center gap-4">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
          <span className="text-sm font-medium">
            {loading ? "Analyzing..." : "Ready"}
          </span>
        </div>
      </header>

      <div className="flex-1 flex">
        <div className="w-2/3 border-r border-slate-700">
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            defaultValue={DEFAULT_CODE[language]}
            onMount={handleEditorMount}
            onChange={(val) => getDebouncedReview()(val || "", language)}
          />
        </div>

        <div className="review-sidebar w-1/3 p-4 overflow-y-auto bg-slate-950">
          <h2 className="text-lg font-semibold mb-4">Review Feedback ({issues.length})</h2>
          {issues.length === 0 ? (
            <p className="text-slate-500 text-sm">No issues detected. Start typing to get feedback!</p>
          ) : (
            issues.map((issue, idx) => (
              <div key={idx} className="mb-3 p-3 bg-slate-900 border-l-4 rounded border-amber-500 text-sm">
                <div className="font-bold flex justify-between text-amber-400">
                  <span>Line {issue.lineNumber}: {issue.title}</span>
                  <span className="uppercase text-xs">{issue.severity}</span>
                </div>
                <p className="mt-1 text-slate-300">{issue.message}</p>
                {issue.suggestion && (
                  <>
                    <pre className="mt-2 p-2 bg-slate-950 text-emerald-400 text-xs rounded overflow-x-auto">
                      {issue.suggestion}
                    </pre>
                    <button
                      onClick={() => applyFix(issue)}
                      className="mt-2 px-3 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer"
                    >
                      Apply Fix
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}