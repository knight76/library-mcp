import { DELAY, NL_LOGIN_URL, NL_NEWS_URL } from "./config.js";

export interface Credentials {
  username: string;
  password: string;
}

export function escapeForJS(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

export function getLoginScript(creds: Credentials): string {
  const safeUsername = escapeForJS(creds.username);
  const safePassword = escapeForJS(creds.password);

  return `
tell application "Google Chrome"
  activate
  open location "${NL_LOGIN_URL}"
  delay ${DELAY.MEDIUM}

  set activeTab to active tab of front window

  delay ${DELAY.MEDIUM}
end tell

tell application "System Events"
  delay ${DELAY.SHORT}
  keystroke return
end tell

delay ${DELAY.SHORT}

tell application "Google Chrome"
  set activeTab to active tab of front window

  set hasLoginForm to execute activeTab javascript "
    const passwordInput = document.querySelector('input[type=\\"password\\"]');
    passwordInput ? 'true' : 'false';
  "

  if hasLoginForm is "true" then
    execute activeTab javascript "
      const userInput = document.getElementById('id');
      if (userInput) {
        userInput.value = '${safeUsername}';
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
        userInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    "

    delay ${DELAY.SHORT}

    execute activeTab javascript "
      const passInput = document.getElementById('pass');
      if (passInput) {
        passInput.value = '${safePassword}';
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    "

    delay ${DELAY.MEDIUM}

    execute activeTab javascript "
      const loginBtn = document.querySelector('a.btn_login');
      if (loginBtn) {
        loginBtn.click();
      }
    "

    delay ${DELAY.MEDIUM}

    tell application "System Events"
      delay ${DELAY.SHORT}
      keystroke return
    end tell

    delay ${DELAY.MEDIUM}

    set currentUrl to execute activeTab javascript "window.location.href"

    if currentUrl contains "N60100000000" then
      return "LOGIN_FAILED"
    end if
  end if
end tell
`;
}

export function getNavigateToPressReaderScript(creds: Credentials): string {
  return getLoginScript(creds) + `

tell application "Google Chrome"
  set activeTab to active tab of front window
  execute activeTab javascript "window.location.href = '${NL_NEWS_URL}';"

  delay ${DELAY.MEDIUM}
  delay ${DELAY.MEDIUM}

  execute activeTab javascript "
    window.confirm = function() { return true; };

    const rows = document.querySelectorAll('table tbody tr');
    for (const row of rows) {
      const text = row.textContent || '';
      if (text.includes('PressReader')) {
        const link = row.querySelector('a[onclick*=\\"db_login\\"]') ||
                     row.querySelector('a[href=\\"#dummy\\"]') ||
                     Array.from(row.querySelectorAll('a')).find(a => a.textContent?.trim() === '가능');
        if (link) {
          link.click();
        }
        break;
      }
    }
  "

  delay ${DELAY.SHORT}

end tell

tell application "System Events"
  delay ${DELAY.SHORT}
  keystroke return
end tell

delay ${DELAY.LONG}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "
    const closeBtn = document.querySelector('.modal-close') ||
                     document.querySelector('.popup-close') ||
                     document.querySelector('[class*=\\"close\\"]') ||
                     document.querySelector('button[aria-label*=\\"close\\"]') ||
                     document.querySelector('button[aria-label*=\\"Close\\"]') ||
                     document.querySelector('.modal button') ||
                     document.querySelector('[class*=\\"modal\\"] button');
    if (closeBtn) closeBtn.click();

    const overlay = document.querySelector('.modal-overlay') ||
                    document.querySelector('.popup-overlay') ||
                    document.querySelector('[class*=\\"overlay\\"]');
    if (overlay) overlay.remove();

    const modal = document.querySelector('.modal') ||
                  document.querySelector('[class*=\\"modal\\"]') ||
                  document.querySelector('[role=\\"dialog\\"]');
    if (modal) modal.remove();
  "
end tell

delay ${DELAY.MEDIUM}
`;
}
