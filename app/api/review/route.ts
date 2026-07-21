import { NextResponse } from "next/server";
import { analyzeCode } from "@/lib/reviewer";

export async function POST(req: Request) {
  try {
    const { code, language } = await req.json();

    if (!code || !language) {
      return NextResponse.json({ error: "Code and language required" }, { status: 400 });
    }

    const issues = await analyzeCode(code, language);
    return NextResponse.json({ issues });
  } catch {
    return NextResponse.json({ error: "Failed to process review" }, { status: 500 });
  }
}