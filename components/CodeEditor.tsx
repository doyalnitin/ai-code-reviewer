"use client";

import React, { useRef, useState, useMemo } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import debounce from "lodash.debounce";
import { ReviewIssue } from "@/lib/reviewer";

const LANGUAGES = [
  { label: "JavaScript", value: "javascript", icon: "JS" },
  { label: "TypeScript", value: "typescript", icon: "TS" },
  { label: "Python", value: "python", icon: "PY" },
  { label: "C++", value: "cpp", icon: "C+" },
  { label: "HTML/CSS", value: "html", icon: "HT" },
] as const;

const DEFAULT_CODE: Record<string, string> = {
  javascript: `// JavaScript Example\nfunction calculateTotal(items) {\n  let total = 0;\n  for (var i = 0; i < items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}\n\nconst items = [\n  { name: "Apple", price: 1.5 },\n  { name: "Banana", price: 0.75 },\n  { name: "Cherry", price: 2.0 },\n];\n\nconsole.log(calculateTotal(items));`,
  typescript: `// TypeScript Example\ninterface Item {\n  name: string;\n  price: number;\n}\n\nfunction calculateTotal(items: Item[]): number {\n  let total = 0;\n  for (var i = 0; i < items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}\n\nconst items: Item[] = [\n  { name: "Apple", price: 1.5 },\n  { name: "Banana", price: 0.75 },\n  { name: "Cherry", price: 2.0 },\n];\n\nconsole.log(calculateTotal(items));`,
  python: `# Python Example\ndef calculate_total(items):\n    total = 0\n    for i in range(len(items)):\n        total += items[i]["price"]\n    return total\n\nitems = [\n    {"name": "Apple", "price": 1.5},\n    {"name": "Banana", "price": 0.75},\n    {"name": "Cherry", "price": 2.0},\n]\n\nprint(calculate_total(items))`,
  cpp: `// C++ Example\n#include <iostream>\n#include <vector>\n#include <string>\n\nstruct Item {\n  std::string name;\n  double price;\n};\n\ndouble calculateTotal(const std::vector<Item>& items) {\n  double total = 0;\n  for (int i = 0; i < items.size(); i++) {\n    total += items[i].price;\n  }\n  return total;\n}\n\nint main() {\n  std::vector<Item> items = {\n    {"Apple", 1.5},\n    {"Banana", 0.75},\n    {"Cherry", 2.0}\n  };\n  std::cout << calculateTotal(items) << std::endl;\n  return 0;\n}`,
  html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body {\n      font-family: 'Segoe UI', system-ui, sans-serif;\n      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n      min-height: 100vh;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n    }\n    .card {\n      background: white;\n      border-radius: 16px;\n      padding: 2rem;\n      box-shadow: 0 20px 60px rgba(0,0,0,0.3);\n      max-width: 400px;\n      width: 90%;\n    }\n    .card h2 {\n      color: #1a1a2e;\n      margin-bottom: 0.5rem;\n      font-size: 1.5rem;\n    }\n    .card p { color: #666; margin-bottom: 1rem; }\n    .btn {\n      background: #667eea;\n      color: white;\n      border: none;\n      padding: 0.75rem 1.5rem;\n      border-radius: 8px;\n      font-size: 1rem;\n      cursor: pointer;\n      transition: transform 0.2s;\n    }\n    .btn:hover { transform: translateY(-2px); }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h2>Hello World</h2>\n    <p>This is a live preview of your HTML/CSS code.</p>\n    <button class="btn" onclick="alert('Clicked!')">Click Me</button>\n  </div>\n</body>\n</html>`,
};

const SEVERITY_CONFIG = {
  error: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500", badge: "bg-red-500/20 text-red-300", icon: "!" },
  warning: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500", badge: "bg-amber-500/20 text-amber-300", icon: "!" },
  info: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500", badge: "bg-blue-500/20 text-blue-300", icon: "i" },
};

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

  const previewContent = useMemo(() => {
    if (language === "html") return code;
    const langLabel = LANGUAGES.find((l) => l.value === language)?.label || language;
    return `<!DOCTYPE html>
<html><head><style>
  body { font-family: 'Geist Mono', monospace; background: #0f172a; color: #e2e8f0; padding: 2rem; margin: 0; }
  .header { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem; }
  .code { white-space: pre-wrap; line-height: 1.6; font-size: 0.875rem; }
  .keyword { color: #c084fc; } .string { color: #34d399; } .comment { color: #64748b; }
</style></head><body>
  <div class="header">${langLabel} Output Preview</div>
  <div class="code">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
</body></html>`;
  }, [code, language]);

  const issueCounts = useMemo(() => {
    const counts = { error: 0, warning: 0, info: 0 };
    issues.forEach((i) => { counts[i.severity]++; });
    return counts;
  }, [issues]);

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
          monacoRef.current.editor.setModelMarkers(model, "ai-reviewer", markers);
        }
      }
    } catch {
      // silently fail
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
    const newCode = DEFAULT_CODE[newLang] || "";
    setCode(newCode);
    if (editorRef.current) {
      editorRef.current.setValue(newCode);
    }
  };

  const handleCodeChange = (val: string | undefined) => {
    const newCode = val || "";
    setCode(newCode);
    getDebouncedReview()(newCode, language);
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
    editorRef.current.executeEdits("ai-apply-fix", [
      { range: selection, text: issue.suggestion, forceMoveMarkers: true },
    ]);
    editorRef.current.revealLineInCenter(lineNumber);
    setCode(editorRef.current.getValue());
  };

  const lineCount = code.split("\n").length;

  return (
    <div className="flex flex-col h-screen bg-[#0c0c14] text-white selection:bg-violet-500/30">
      {/* Header */}
      <header className="h-14 px-5 flex items-center justify-between border-b border-white/[0.06] bg-[#0c0c14]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">AI</div>
          <h1 className="text-sm font-semibold tracking-tight">AI Code Reviewer</h1>
          <div className="hidden sm:flex items-center gap-1 ml-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                onClick={() => handleLanguageChange(lang.value)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  language === lang.value
                    ? "bg-white/10 text-white"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
                }`}
              >
                {lang.icon}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="sm:hidden bg-white/[0.06] border border-white/[0.08] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                Reviewing...
              </div>
            )}
            {!loading && issues.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                {issueCounts.error > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">{issueCounts.error} err</span>}
                {issueCounts.warning > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">{issueCounts.warning} warn</span>}
                {issueCounts.info > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">{issueCounts.info} info</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-400">{LANGUAGES.find((l) => l.value === language)?.label}</span>
              <span className="text-slate-600">|</span>
              <span>{lineCount} lines</span>
            </div>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onMount={handleEditorMount}
              onChange={handleCodeChange}
              options={{
                fontSize: 13,
                fontFamily: "'Geist Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                renderLineHighlight: "gutter",
                cursorBlinking: "smooth",
                smoothScrolling: true,
                bracketPairColorization: { enabled: true },
              }}
            />
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-[420px] border-l border-white/[0.06] flex flex-col bg-[#0e0e18]">
          {/* Panel Tabs */}
          <div className="flex border-b border-white/[0.06]">
            <button
              onClick={() => setActiveTab("review")}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === "review"
                  ? "text-white border-b-2 border-violet-500 bg-white/[0.03]"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                AI Review
                {issues.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px]">{issues.length}</span>}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === "preview"
                  ? "text-white border-b-2 border-violet-500 bg-white/[0.03]"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Preview
              </span>
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "review" && (
              <div className="p-4 space-y-3">
                {issues.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-sm font-medium text-slate-300">No issues found</p>
                    <p className="text-xs text-slate-500 mt-1">Start typing to get AI feedback</p>
                  </div>
                )}
                {loading && issues.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-3" />
                    <p className="text-xs text-slate-500">Analyzing your code...</p>
                  </div>
                )}
                {issues.map((issue, idx) => {
                  const sev = SEVERITY_CONFIG[issue.severity];
                  return (
                    <div key={idx} className={`rounded-xl border ${sev.border}/20 ${sev.bg} p-3.5 group`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-md ${sev.badge} flex items-center justify-center text-[10px] font-bold shrink-0`}>
                            {sev.icon}
                          </span>
                          <span className={`text-sm font-semibold ${sev.color} truncate`}>{issue.title}</span>
                        </div>
                        <span className={`text-[10px] font-medium uppercase tracking-wider ${sev.color} opacity-70 shrink-0`}>
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{issue.message}</p>
                      <p className="text-[11px] text-slate-500 mb-2">Line {issue.lineNumber}</p>
                      {issue.suggestion && (
                        <>
                          <pre className="p-2.5 bg-black/30 rounded-lg text-[11px] text-emerald-400/90 overflow-x-auto font-mono leading-relaxed mb-2">
                            {issue.suggestion}
                          </pre>
                          <button
                            onClick={() => applyFix(issue)}
                            className="w-full py-2 text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            Apply Fix
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "preview" && (
              <div className="h-full">
                <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {language === "html" ? "Live Preview" : "Code View"}
                  </span>
                  {language === "html" && (
                    <button
                      onClick={() => previewRef.current?.contentWindow?.location.reload()}
                      className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      Refresh
                    </button>
                  )}
                </div>
                <iframe
                  ref={previewRef}
                  srcDoc={previewContent}
                  className="w-full bg-white"
                  style={{ height: "calc(100% - 33px)", border: "none" }}
                  title="Code Preview"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <footer className="h-6 px-4 flex items-center justify-between border-t border-white/[0.06] bg-[#0c0c14]/80 text-[10px] text-slate-500">
        <div className="flex items-center gap-3">
          <span>{LANGUAGES.find((l) => l.value === language)?.label}</span>
          <span className="text-slate-700">|</span>
          <span>{lineCount} lines</span>
          <span className="text-slate-700">|</span>
          <span>{code.length} chars</span>
        </div>
        <div className="flex items-center gap-3">
          {issues.length > 0 && <span className="text-violet-400">{issues.length} issues</span>}
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}
