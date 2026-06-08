import { execSync, execFileSync } from "node:child_process";
import {
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Publication } from "./publications.js";

const FETCH_INTERVAL_MS = 500;
const SAMU_BROWSER_MCP_URL = "http://127.0.0.1:8417/sse";

// 동아일보 PDF 인덱스 페이지에서 vcid를 수집하고, samu-browser MCP의
// browser_fetch_url(CDP Network.getResponseBody 백엔드)로 한 장씩
// 500ms 간격으로 받아 pdfunite로 단일 PDF로 묶는다.
//
// 전제: 직전에 openPublication('donga')으로 활성 탭이
// .../news/Pdf[?ymd=YYYYMMDD] 에 있어야 한다.
export async function downloadDongaPdf(pub: Publication): Promise<string> {
  if (pub.id !== "donga") {
    throw new Error(`현재 PDF 다운로드는 'donga'만 지원합니다 (요청: ${pub.id})`);
  }

  // 1) 활성 탭 URL에서 ymd 추출 (없으면 KST 기준 오늘)
  const tabUrl = osascriptOutput(
    `tell application "samu-webbrowser" to return URL of active tab of front window`,
  );
  if (!tabUrl.includes("/news/Pdf")) {
    throw new Error(
      `동아일보 PDF 인덱스 페이지가 아닙니다 (url: ${tabUrl}). 먼저 open_publication('donga')을 호출해 주세요.`,
    );
  }
  const ymdMatch = tabUrl.match(/[?&]ymd=(\d{8})/);
  const ymd = ymdMatch ? ymdMatch[1] : todayKstYmd();

  // 2) 페이지에서 vcid 수집 (same-origin이라 JS만으로 가능)
  const vcidsJson = osascriptOutput(`
tell application "samu-webbrowser"
  set activeTab to active tab of front window
  return (execute activeTab javascript "
    (function(){
      const seen = new Set();
      const out = [];
      for (const a of document.querySelectorAll('a[onclick*=PDFView]')) {
        const oc = a.getAttribute('onclick') || '';
        const start = oc.indexOf(\\\"PDFView('\\\");
        if (start === -1) continue;
        const end = oc.indexOf(\\\"'\\\", start + 9);
        if (end === -1) continue;
        const vcid = oc.slice(start + 9, end);
        if (!seen.has(vcid)) { seen.add(vcid); out.push(vcid); }
      }
      return JSON.stringify(out);
    })();
  ")
end tell
`.trim());
  const vcids: string[] = JSON.parse(vcidsJson);
  if (vcids.length === 0) {
    throw new Error("vcid를 찾지 못했습니다. 페이지 구조가 바뀌었거나 PDF가 없는 상태일 수 있습니다.");
  }

  // 3) 작업 디렉토리 준비
  const tmpDir = join(tmpdir(), `donga-${ymd}`);
  if (existsSync(tmpDir)) {
    for (const f of readdirSync(tmpDir)) {
      try { unlinkSync(join(tmpDir, f)); } catch { /* ignore */ }
    }
  } else {
    mkdirSync(tmpDir, { recursive: true });
  }
  const outDir = join(homedir(), "Documents", "dongailbo");
  mkdirSync(outDir, { recursive: true });

  // 4) samu-browser MCP 연결 → browser_fetch_url로 28번 다운로드 (500ms 간격)
  const client = new Client({ name: "library-mcp-donga-dl", version: "0.1.0" });
  const transport = new SSEClientTransport(new URL(SAMU_BROWSER_MCP_URL));
  await client.connect(transport);
  try {
    for (let i = 0; i < vcids.length; i++) {
      const vcid = vcids[i];
      const pdfUrl = `https://web-donga-com-ssl.sj-libpro.nl.go.kr/pdf/pdf_viewer.php?vcid=${vcid}`;
      const filename = String(i + 1).padStart(3, "0") + "_" + vcid + ".pdf";
      const savePath = join(tmpDir, filename);
      const res = await client.callTool({
        name: "browser_fetch_url",
        arguments: { url: pdfUrl, save_to: savePath },
      });
      if (res.isError) {
        const text = Array.isArray(res.content) && res.content[0] && "text" in res.content[0]
          ? (res.content[0] as { text: string }).text
          : JSON.stringify(res.content);
        throw new Error(`browser_fetch_url 실패 (${vcid}): ${text}`);
      }
      if (i < vcids.length - 1) {
        await new Promise<void>(r => setTimeout(r, FETCH_INTERVAL_MS));
      }
    }
  } finally {
    await client.close();
  }

  // 5) pdfunite로 단일 PDF로 병합
  const outFile = join(outDir, `${ymd}.pdf`);
  const files = readdirSync(tmpDir)
    .filter(f => f.endsWith(".pdf"))
    .sort()
    .map(f => join(tmpDir, f));
  if (files.length === 0) {
    throw new Error("병합할 PDF가 없습니다.");
  }
  execFileSync("pdfunite", [...files, outFile], { encoding: "utf-8" });

  return `${vcids.length}페이지 다운로드 → ${outFile}`;
}

function osascriptOutput(script: string): string {
  const scriptPath = join(tmpdir(), `donga-dl-${process.pid}-${Date.now()}.scpt`);
  writeFileSync(scriptPath, script);
  try {
    return execSync(`osascript "${scriptPath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }).trim();
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

function todayKstYmd(): string {
  const now = new Date();
  const kstMs = now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
