import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const SAMU_SSE_URL = "http://127.0.0.1:8417/sse";

export class SamuBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SamuBrowserError";
  }
}

export class SamuBrowser {
  private client: Client;
  private connected = false;

  constructor() {
    this.client = new Client(
      { name: "library-via-mcp", version: "0.1.0" },
      { capabilities: {} },
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    try {
      const transport = new SSEClientTransport(new URL(SAMU_SSE_URL));
      await this.client.connect(transport);
      this.connected = true;
    } catch (e) {
      throw new SamuBrowserError(
        `samu-browser MCP 연결 실패 (${SAMU_SSE_URL}): ${(e as Error).message}. samu-webbrowser-v2가 실행 중인지 확인.`,
      );
    }
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.close();
    } catch {
      /* ignore */
    }
    this.connected = false;
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) throw new SamuBrowserError("not connected");
    let result: { content?: Array<{ type: string; text: string }>; isError?: boolean };
    try {
      result = (await this.client.callTool({ name, arguments: args })) as typeof result;
    } catch (e) {
      throw new SamuBrowserError(`tool ${name} 호출 실패: ${(e as Error).message}`);
    }
    if (result.isError) {
      const txt = result.content?.[0]?.text ?? JSON.stringify(result);
      throw new SamuBrowserError(`tool ${name} 에러 응답: ${txt}`);
    }
    const content = result.content?.[0];
    if (!content || content.type !== "text") {
      throw new SamuBrowserError(`tool ${name} 예상치 못한 응답 형태: ${JSON.stringify(result)}`);
    }
    try {
      return JSON.parse(content.text);
    } catch {
      return content.text;
    }
  }
}
