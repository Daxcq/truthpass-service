// L2 知识供给层（wiki 模式）：知识库量级小且稳定，直接整库拉取注入 LLM 上下文；
// 证据流水（持续增长）未来才走 pgvector 检索，分界线是数据增长率。
// 红线：本层只供给"依据"，验收判定永远由 src/verifier.ts 的确定性代码执行。
// SQL 不出现在本文件——读取一律走 persistence.selectKnowledgeChunks（参数绑定收口）。
import { persistenceEnabled, selectKnowledgeChunks } from "../data/persistence.js";

export type KnowledgeChunk = Awaited<ReturnType<typeof selectKnowledgeChunks>>[number];

/** 拉取知识块；concepts 给定时按概念标签预过滤。未启用持久化时返回空数组。 */
export async function loadKnowledgeChunks(concepts?: string[]): Promise<KnowledgeChunk[]> {
  if (!persistenceEnabled()) return [];
  return selectKnowledgeChunks(concepts);
}

/** 组装 LLM 上下文的"知识附录"，每块带 K 编号与回链引用。 */
export function buildWikiAppendix(chunks: KnowledgeChunk[]): string {
  return chunks
    .map((chunk, index) => "【K" + (index + 1) + "】" + chunk.title + "（来源: " + chunk.sourceTable + "#" + chunk.sourceId + "）\n" + chunk.chunkText)
    .join("\n\n");
}
