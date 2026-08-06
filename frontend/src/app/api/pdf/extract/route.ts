import { NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const uploadTimeoutMs = Number(process.env.PDF_UPLOAD_TIMEOUT_MS ?? 300_000);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const response = await fetch(`${backendUrl}/api/pdf/extract`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(uploadTimeoutMs),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        detail: timedOut
          ? "PDF 处理超过 5 分钟，请稍后重试或减小文件。"
          : "PDF 上传失败，请确认后端服务正在运行。",
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}
