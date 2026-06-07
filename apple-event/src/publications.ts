export type PublicationType = "service" | "newspaper" | "magazine";
export type Handler = "pressreader" | "newspaper" | "oreilly";

export interface Publication {
  id: string;
  title: string;
  subtitle: string;
  type: PublicationType;
  handler: Handler;
  urlPath?: string;
}

export const publications: Publication[] = [
  { id: "pressreader",     title: "PressReader",         subtitle: "전세계 신문/잡지 메인",          type: "service",   handler: "pressreader" },
  { id: "oreilly",         title: "O'Reilly",            subtitle: "O'Reilly for Public Libraries",  type: "service",   handler: "oreilly" },
  { id: "wsj",             title: "월스트리트저널",       subtitle: "The Wall Street Journal",        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/the-wall-street-journal" },
  { id: "economist",       title: "The Economist",       subtitle: "The Economist (Asia Pacific)",   type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/the-economist-asia-pacific" },
  { id: "hankyoreh",       title: "한겨레 신문",          subtitle: "한겨레",                          type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/hankyoreh" },
  { id: "kyunghyang",      title: "경향신문",             subtitle: "경향신문",                        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/kyunghyang" },
  { id: "maeil",           title: "매일경제",             subtitle: "Maeil Business Newspaper",       type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/maeil-business-newspaper" },
  { id: "donga",           title: "동아일보",             subtitle: "동아일보",                        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/dong-a-ilbo" },
  { id: "joongang",        title: "중앙일보",             subtitle: "중앙일보",                        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/joongang-ilbo" },
  { id: "cine21",          title: "씨네21",               subtitle: "씨네21",                          type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/cine21" },
  { id: "washington-post", title: "Washington Post",     subtitle: "The Washington Post",            type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/the-washington-post" },
  { id: "level",           title: "Level",               subtitle: "Level (Game Magazine)",          type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/level" },
  { id: "wired",           title: "Wired",               subtitle: "Wired Magazine",                 type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/wired" },
  { id: "opensource",      title: "Open Source For You", subtitle: "Open Source Magazine",           type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/open-source-for-you" },
];

export type FindResult =
  | { kind: "found"; publication: Publication }
  | { kind: "ambiguous"; matches: Publication[] }
  | { kind: "not-found" };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_'\-]/g, "");
}

export function findPublication(name: string): FindResult {
  const needle = normalize(name);
  if (needle === "") return { kind: "not-found" };

  const haystacks = publications.map(p => ({
    publication: p,
    keys: [normalize(p.id), normalize(p.title), normalize(p.subtitle)],
  }));

  const exact = haystacks.filter(h => h.keys.includes(needle));
  if (exact.length === 1) return { kind: "found", publication: exact[0].publication };
  if (exact.length > 1) {
    return { kind: "ambiguous", matches: exact.map(h => h.publication) };
  }

  const substr = haystacks.filter(h => h.keys.some(k => k.includes(needle)));
  if (substr.length === 1) return { kind: "found", publication: substr[0].publication };
  if (substr.length > 1) {
    return { kind: "ambiguous", matches: substr.map(h => h.publication) };
  }

  return { kind: "not-found" };
}
