import { join } from "node:path";
import { homedir } from "node:os";

// 기존 Raycast 확장과 credentials.json을 공유한다 — 경로는 ~/dev/my/library/credentials.json
export const CREDENTIALS_PATH = join(homedir(), "dev/my/library/credentials.json");

// Delay 설정 (초 단위)
export const DELAY = {
  SHORT: 0.5,
  MEDIUM: 1,
  LONG: 2,
};

// 국립중앙도서관 URL
export const NL_LOGIN_URL = "https://www.nl.go.kr/NL/contents/N60100000000.do";
export const NL_NEWS_URL = "https://www.nl.go.kr/NL/contents/N10401000000.do?schOpt1=nwsmgz";
