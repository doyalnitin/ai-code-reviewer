import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface ReviewIssue {
  lineNumber: number;
  severity: "error" | "warning" | "info";
  title: string;
  message: string;
  suggestion: string;
}

export async function analyzeCode(code: string, language: string): Promise<ReviewIssue[]> {
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

  try {
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
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return [];
  }
}