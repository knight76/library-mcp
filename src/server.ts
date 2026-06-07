#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { publications, findPublication } from "./publications.js";
import {
  openPublication,
  CredentialsError,
  LoginFailedError,
  ScriptExecutionError,
} from "./actions.js";

const PUBLICATION_LIST_FOR_DESCRIPTION = publications
  .map(p => `    ${p.id.padEnd(15)} | ${p.title}`)
  .join("\n");

export const TOOLS: Tool[] = [
  {
    name: "open_publication",
    description:
      `국립중앙도서관 자동 로그인 후 지정한 매체를 Chrome에서 엽니다.\n` +
      `사용 가능한 매체 (id | 한글명):\n` +
      PUBLICATION_LIST_FOR_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: '매체 id 또는 한글명 (예: "hankyoreh", "한겨레 신문")',
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_publications",
    description: "사용 가능한 매체 목록을 반환합니다.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

let lock: Promise<unknown> = Promise.resolve();
export async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  const next = new Promise<void>(r => { release = r; });
  lock = next;
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
  }
}

const ALL_IDS = publications.map(p => p.id).join(", ");

export async function handleCallTool(req: CallToolRequest): Promise<CallToolResult> {
  const toolName = req.params.name;

  if (toolName === "list_publications") {
    const summary = publications.map(({ id, title, subtitle, type }) => ({ id, title, subtitle, type }));
    return textResult(JSON.stringify(summary, null, 2));
  }

  if (toolName === "open_publication") {
    const args = req.params.arguments as { name?: unknown } | undefined;
    const name = typeof args?.name === "string" ? args.name : "";

    if (name === "") {
      return errorResult(`'name' 인자가 필요합니다. 사용 가능한 id: ${ALL_IDS}`);
    }

    const result = findPublication(name);
    if (result.kind === "not-found") {
      return errorResult(`매체를 찾을 수 없습니다: "${name}". 사용 가능한 id: ${ALL_IDS}`);
    }
    if (result.kind === "ambiguous") {
      const matchIds = result.matches.map(p => p.id).join(", ");
      return errorResult(
        `매체 이름이 모호합니다: "${name}"이 여러 매체와 일치 (${matchIds}). 정확한 id 또는 한글명을 사용해 주세요.`,
      );
    }

    try {
      const msg = await serialized(() => openPublication(result.publication));
      return textResult(msg);
    } catch (e) {
      if (e instanceof CredentialsError) return errorResult(e.message);
      if (e instanceof LoginFailedError) return errorResult(e.message);
      if (e instanceof ScriptExecutionError) return errorResult(e.message);
      const msg = e instanceof Error ? e.message : String(e);
      return errorResult(`예상치 못한 오류: ${msg}`);
    }
  }

  return errorResult(`알 수 없는 tool: ${toolName}`);
}

async function main(): Promise<void> {
  const server = new Server(
    { name: "library", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, handleCallTool);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/server.js") ||
  process.argv[1]?.endsWith("/server.ts");

if (isDirectRun) {
  main().catch(err => {
    console.error("library MCP server failed:", err);
    process.exit(1);
  });
}
