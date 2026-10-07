export type TypesafeQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; choices: Record<string, string> }
  | { type: "score"; instructions: string; min: number; max: number; criteria: Record<string, string> };

export interface TypesafeRunRequest {
  state?: unknown;
  model?: string;
  questions: Record<string, TypesafeQuestion>;
}

export interface TypesafeRunResponse {
  answers: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TypesafeClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class TypesafeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TypesafeClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY ?? "";
    this.baseUrl = (options.baseUrl ?? "https://api.typesafe.ai").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async run(request: TypesafeRunRequest): Promise<TypesafeRunResponse> {
    if (!this.apiKey) throw new Error("TYPESAFE_API_KEY 未配置");
    if (!request.questions || Object.keys(request.questions).length === 0) {
      throw new Error("至少需要一个 TypeSafe question");
    }

    const response = await this.fetchImpl(`${this.baseUrl}/v1/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) throw new Error(`TypeSafe API 请求失败: HTTP ${response.status}`);
    const body = (await response.json()) as TypesafeRunResponse;
    if (!body || typeof body !== "object" || !body.answers || typeof body.answers !== "object") {
      throw new Error("TypeSafe API 响应缺少 answers");
    }
    return body;
  }
}
