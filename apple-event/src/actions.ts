import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CREDENTIALS_PATH, DELAY } from "./config.js";
import { escapeForJS, getLoginScript, getNavigateToPressReaderScript, type Credentials } from "./applescript.js";
import type { Publication } from "./publications.js";

interface StoredCredentials {
  username: string;
  password: string;
}

export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsError";
  }
}

export class LoginFailedError extends Error {
  constructor() {
    super("로그인 실패: credentials.json의 username/password 확인 필요");
    this.name = "LoginFailedError";
  }
}

export class ScriptExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptExecutionError";
  }
}

export function loadCredentials(): Credentials {
  let raw: string;
  try {
    raw = readFileSync(CREDENTIALS_PATH, "utf-8");
  } catch (e) {
    throw new CredentialsError(
      `자격증명을 읽을 수 없습니다: ${(e as Error).message}. ${CREDENTIALS_PATH} 확인 필요`,
    );
  }

  let stored: StoredCredentials;
  try {
    stored = JSON.parse(raw) as StoredCredentials;
  } catch (e) {
    throw new CredentialsError(
      `자격증명 JSON 파싱 실패: ${(e as Error).message}. ${CREDENTIALS_PATH} 확인 필요`,
    );
  }

  if (typeof stored.username !== "string" || typeof stored.password !== "string") {
    throw new CredentialsError(
      `자격증명 형식 오류: username/password 필드 필요. ${CREDENTIALS_PATH} 확인 필요`,
    );
  }

  return {
    username: Buffer.from(stored.username, "base64").toString("utf-8"),
    password: Buffer.from(stored.password, "base64").toString("utf-8"),
  };
}

function runOsascript(script: string): string {
  const scriptPath = join(tmpdir(), `nl-library-${process.pid}-${Date.now()}.scpt`);
  let written = false;
  try {
    writeFileSync(scriptPath, script);
    written = true;
    const output = execSync(`osascript "${scriptPath}"`, { encoding: "utf-8" }).trim();
    if (output === "LOGIN_FAILED") throw new LoginFailedError();
    return output;
  } catch (e) {
    if (e instanceof LoginFailedError) throw e;
    const err = e as Error & { stderr?: Buffer };
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new ScriptExecutionError(`스크립트 실행 실패: ${stderr}`);
  } finally {
    if (written && existsSync(scriptPath)) {
      try { unlinkSync(scriptPath); } catch { /* ignore cleanup failures */ }
    }
  }
}

async function runPressReaderAction(additionalScript: string, successMessage: string): Promise<string> {
  const creds = loadCredentials();
  const baseScript = getNavigateToPressReaderScript(creds);
  const fullScript = baseScript + "\n" + additionalScript;
  runOsascript(fullScript);
  return successMessage;
}

async function openNewspaper(urlPath: string, successMessage: string): Promise<string> {
  const fullUrl = `https://pressreader.nl.go.kr${urlPath}`;
  const additionalScript = `
delay ${DELAY.MEDIUM}

tell application "samu-webbrowser"
  set activeTab to active tab of front window

  execute activeTab javascript "window.location.href = '${fullUrl}';"
end tell

delay ${DELAY.LONG}

-- PressReader HotSpot welcome 모달이 간헐적으로 뜸. 떴을 때만 모달 안의
-- 'Start reading now' 버튼을 클릭한다. (X로 닫지 않음 — Start reading
-- now가 진행 경로이고, X는 단순 dismiss라 다음 단계가 없음.)
-- 모달이 안 떴으면 아무것도 안 하고 publication 페이지 그대로 둔다.
-- 추천 간행물 thumbnail에 잡히지 않도록 modal 컨테이너 안에서만 찾음.
tell application "samu-webbrowser"
  set activeTab to active tab of front window

  execute activeTab javascript "
    (function(){
      // Find the HotSpot/welcome modal container. PressReader uses a
      // visible overlay with one of: .modal, [role=dialog], or a class
      // containing 'hotspot'/'modal'. We require the element to be
      // currently visible (non-zero size) to skip detached/hidden ones.
      const candidates = document.querySelectorAll('.modal, [role=\\"dialog\\"], [class*=\\"hotspot\\" i], [class*=\\"modal\\"]');
      let modal = null;
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 200) { modal = el; break; }
      }
      if (!modal) return { action: 'no-modal' };
      // CTA must be EXACT text match and contain NO image (image-bearing
      // anchors are recommended-publication thumbnails which redirect to
      // a different magazine/newspaper).
      const cta = Array.from(modal.querySelectorAll('button, a')).find(el => {
        if (el.querySelector('img')) return false;
        const t = (el.textContent || '').trim();
        return t === 'Start reading now' || t === '지금 읽기';
      });
      if (cta) { cta.click(); return { action: 'clicked', tag: cta.tagName, cls: cta.className }; }
      return { action: 'modal-but-no-cta', modalClass: modal.className };
    })();
  "
end tell

`;
  return runPressReaderAction(additionalScript, successMessage);
}

async function openOreillyEbook(): Promise<string> {
  const creds = loadCredentials();
  const oreillyPageUrl = "https://www.nl.go.kr/NL/contents/N10401000000.do?page=3&schOpt3=it";

  const script = getLoginScript(creds) + `

tell application "samu-webbrowser"
  set activeTab to active tab of front window
  execute activeTab javascript "window.location.href = '${oreillyPageUrl}';"
end tell

delay ${DELAY.LONG}

tell application "samu-webbrowser"
  set activeTab to active tab of front window

  execute activeTab javascript "
    var links = document.querySelectorAll('a.external_use_btn');
    for (var i = 0; i < links.length; i++) {
      var row = links[i].closest('tr');
      if (row && row.textContent.indexOf('Reilly') !== -1) {
        links[i].click();
        break;
      }
    }
  "
end tell

delay ${DELAY.SHORT}

tell application "System Events"
  delay ${DELAY.SHORT}
  keystroke return
end tell

delay ${DELAY.LONG}
delay ${DELAY.LONG}

`;

  runOsascript(script);
  return "O'Reilly 접속 완료";
}

async function openChosunArchive(): Promise<string> {
  const creds = loadCredentials();
  // 조선일보 아카이브: 보스 안내대로 세종도서관 자체 로그인 경로로 진입한다.
  //   1. sejong.nl.go.kr 메인 진입
  //   2. 상단 '로그인' 링크 클릭
  //   3. 세종 로그인 폼(#u_id/#pword)에 NL 계정 동일 자격증명 채움
  //   4. OS Enter로 form submit
  //   5. 게시판 URL navigate
  //   6. '[전자신문]조선일보 아카이브' 게시글 클릭
  // NL(www.nl.go.kr) 로그인 단계는 건너뛴다 (subdomain 쿠키 공유 안 됨).
  const sejongHome = "https://sejong.nl.go.kr/";
  const sejongBoardUrl =
    "https://sejong.nl.go.kr/brd/NttList.do?bbsSe=BBST030&menuId=O216&upperMenuId=O200&proxyYn=Y";
  const safeUser = escapeForJS(creds.username);
  const safePass = escapeForJS(creds.password);

  const script = `
tell application "samu-webbrowser"
  activate
  open location "${sejongHome}"
  delay ${DELAY.LONG}
  set activeTab to active tab of front window
  delay ${DELAY.SHORT}
end tell

-- Dismiss any popup/banner on first visit
tell application "System Events"
  repeat 2 times
    delay ${DELAY.SHORT}
    keystroke return
  end repeat
end tell

delay ${DELAY.SHORT}

-- Click the top-nav '로그인' link
tell application "samu-webbrowser"
  set activeTab to active tab of front window
  execute activeTab javascript "
    const links = Array.from(document.querySelectorAll('a'));
    const login = links.find(a => (a.textContent || '').trim() === '로그인');
    if (login) login.click();
  "
end tell

delay ${DELAY.LONG}

-- Override window.alert/confirm BEFORE clicking #toSumbit so the native
-- "로그인 되었습니다." dialog never blocks subsequent JS evaluation.
-- (System Events keystroke can't dismiss it without Accessibility
-- permissions on the spawning process.)
tell application "samu-webbrowser"
  set activeTab to active tab of front window
  execute activeTab javascript "
    window.__seen_alerts = [];
    window.alert = function(m){ window.__seen_alerts.push(m); };
    window.confirm = function(){ return true; };

    const u = document.getElementById('u_id');
    const p = document.getElementById('pword');
    if (u && p) {
      u.value = '${safeUser}';
      p.value = '${safePass}';
      u.dispatchEvent(new Event('input', {bubbles:true}));
      u.dispatchEvent(new Event('change', {bubbles:true}));
      p.dispatchEvent(new Event('input', {bubbles:true}));
      p.dispatchEvent(new Event('change', {bubbles:true}));
    }
    const btn = document.getElementById('toSumbit');
    if (btn) btn.click();
  "
end tell

delay ${DELAY.LONG}
delay ${DELAY.LONG}

-- Navigate to the board page
tell application "samu-webbrowser"
  set activeTab to active tab of front window
  execute activeTab javascript "window.location.href = '${sejongBoardUrl}';"
end tell

delay ${DELAY.LONG}

-- Click the chosun archive post
tell application "samu-webbrowser"
  set activeTab to active tab of front window
  execute activeTab javascript "
    (function(){
      const all = Array.from(document.querySelectorAll('a, td, tr'));
      const target = all.find(el => (el.textContent || '').trim().includes('조선일보 아카이브'));
      if (!target) return { clicked: false, reason: 'not-found' };
      const link = target.tagName === 'A' ? target
                 : target.querySelector('a')
                 || target.closest('a');
      if (link) { link.click(); return { clicked: true, href: link.href }; }
      target.click();
      return { clicked: true, tag: target.tagName };
    })();
  "
end tell

delay ${DELAY.LONG}
`;

  runOsascript(script);
  return "조선일보 아카이브 (세종도서관) 접속 완료";
}

export async function openPublication(pub: Publication): Promise<string> {
  switch (pub.handler) {
    case "pressreader":
      return runPressReaderAction("", "PressReader 접속 완료");
    case "newspaper":
      if (!pub.urlPath) throw new Error(`Publication ${pub.id} has handler=newspaper but no urlPath`);
      return openNewspaper(pub.urlPath, `${pub.title} 열기 완료`);
    case "oreilly":
      return openOreillyEbook();
    case "chosun-archive":
      return openChosunArchive();
  }
}
