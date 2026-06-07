import { SamuBrowser } from "./samu-client.js";
import { loadCredentials } from "./credentials.js";
import { NL_LOGIN_URL, NL_NEWS_URL } from "./config.js";
import type { Publication } from "./publications.js";

function fillLoginScript(username: string, password: string): string {
  const u = JSON.stringify(username);
  const p = JSON.stringify(password);
  return `
    (function(){
      const u = document.getElementById('id');
      const p = document.getElementById('pass');
      if (!u || !p) return { ok: false, reason: 'no_form', url: location.href };
      u.value = ${u};
      p.value = ${p};
      u.dispatchEvent(new Event('input', {bubbles:true}));
      u.dispatchEvent(new Event('change', {bubbles:true}));
      p.dispatchEvent(new Event('input', {bubbles:true}));
      p.dispatchEvent(new Event('change', {bubbles:true}));
      const btn = document.querySelector('a.btn_login');
      if (!btn) return { ok: false, reason: 'no_button', url: location.href };
      btn.click();
      return { ok: true, url: location.href };
    })();
  `;
}

const PRESSREADER_CLICK_SCRIPT = `
  (function(){
    window.confirm = function(){ return true; };
    const rows = document.querySelectorAll('table tbody tr');
    for (const row of rows) {
      if ((row.textContent || '').includes('PressReader')) {
        const link = row.querySelector('a[onclick*="db_login"]')
          || row.querySelector('a[href="#dummy"]')
          || Array.from(row.querySelectorAll('a')).find(a => (a.textContent || '').trim() === '가능');
        if (link) { link.click(); return { clicked: true }; }
      }
    }
    return { clicked: false };
  })();
`;

const READ_NOW_SCRIPT = `
  (function(){
    const alertClose = document.querySelector('a.alert-close');
    if (alertClose) alertClose.click();
    const noBtn = Array.from(document.querySelectorAll('button, a')).find(el => {
      const t = el.textContent || '';
      return t.includes('아니요') || t.includes('아니오') || t.toLowerCase() === 'no';
    });
    if (noBtn) noBtn.click();
    const readBtn = document.querySelector('a[href*="read"]')
      || Array.from(document.querySelectorAll('button, a')).find(el =>
        (el.textContent || '').includes('지금 읽기'));
    if (readBtn) { readBtn.click(); return { clicked: true }; }
    return { clicked: false };
  })();
`;

const OREILLY_CLICK_SCRIPT = `
  (function(){
    const links = document.querySelectorAll('a.external_use_btn');
    for (const link of links) {
      const row = link.closest('tr');
      if (row && (row.textContent || '').indexOf('Reilly') !== -1) {
        link.click();
        return { clicked: true };
      }
    }
    return { clicked: false };
  })();
`;

async function loginToNL(b: SamuBrowser): Promise<void> {
  const { username, password } = loadCredentials();
  // WORKAROUND: shell_open_tab가 만든 tab을 chromium adapter가 못 찾는 이슈
  // (refcount만 생기고 actual tab attach 실패). 활성 탭에 직접 navigate로 우회.
  // TODO: samu-browser-v2 측에서 shell_open_tab 정상화 후 별도 탭으로 복원.
  await b.call("browser_navigate", { url: NL_LOGIN_URL });
  await b.call("browser_wait_for", { text: "비밀번호", ms: 15000 });
  await b.call("browser_evaluate", {
    script: fillLoginScript(username, password),
    timeoutMS: 5000,
  });
  // wait for navigation away from login page
  await new Promise((r) => setTimeout(r, 2000));
}

async function navigateToPressReader(b: SamuBrowser): Promise<void> {
  await b.call("browser_navigate", { url: NL_NEWS_URL });
  await b.call("browser_wait_for", { text: "PressReader", ms: 15000 });
  await b.call("browser_evaluate", {
    script: PRESSREADER_CLICK_SCRIPT,
    timeoutMS: 5000,
  });
  // PressReader page loading typically 5-10s
  await new Promise((r) => setTimeout(r, 5000));
}

export async function openPublication(pub: Publication): Promise<string> {
  const b = new SamuBrowser();
  await b.connect();
  try {
    if (pub.handler === "pressreader") {
      await loginToNL(b);
      await navigateToPressReader(b);
      return "PressReader 접속 완료";
    }
    if (pub.handler === "newspaper") {
      if (!pub.urlPath) {
        throw new Error(`Publication ${pub.id} has handler=newspaper but no urlPath`);
      }
      await loginToNL(b);
      await navigateToPressReader(b);
      const fullUrl = `https://pressreader.nl.go.kr${pub.urlPath}`;
      await b.call("browser_navigate", { url: fullUrl });
      await new Promise((r) => setTimeout(r, 3000));
      await b.call("browser_evaluate", { script: READ_NOW_SCRIPT, timeoutMS: 5000 });
      return `${pub.title} 열기 완료`;
    }
    if (pub.handler === "oreilly") {
      await loginToNL(b);
      const oreillyUrl = "https://www.nl.go.kr/NL/contents/N10401000000.do?page=3&schOpt3=it";
      await b.call("browser_navigate", { url: oreillyUrl });
      await b.call("browser_wait_for", { text: "Reilly", ms: 15000 });
      await b.call("browser_evaluate", {
        script: OREILLY_CLICK_SCRIPT,
        timeoutMS: 5000,
      });
      await new Promise((r) => setTimeout(r, 5000));
      return "O'Reilly 접속 완료";
    }
  } finally {
    await b.close();
  }
  throw new Error(`unreachable: unknown handler ${(pub as Publication).handler}`);
}
