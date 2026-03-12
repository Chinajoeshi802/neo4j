// PDF 文本提取（使用简单的文本解析，实际项目中可以使用 pdf-parse 或 pdfjs-dist）
// 由于 Next.js 环境限制，这里提供两种方案：

/**
 * 方案1: 客户端解析 PDF
 * 前端使用 pdf.js 解析 PDF，提取文本后发送给后端
 */

/**
 * 方案2: 后端解析 PDF  
 * 使用 Node.js 库解析（需要安装 pdf-parse）
 */

export function splitTextIntoChunks(
  text: string,
  maxChunkSize: number = 2000,
  overlap: number = 200
): string[] {
  if (!text || text.length === 0) return [];
  
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // 尝试在句子边界处分割
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('。', end);
      const lastQuestion = text.lastIndexOf('？', end);
      const lastExclaim = text.lastIndexOf('！', end);
      const lastNewline = text.lastIndexOf('\n', end);
      
      const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim, lastNewline);
      
      if (breakPoint > start + maxChunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    
    if (start < 0) start = 0;
  }

  return chunks.filter(chunk => chunk.length > 0);
}

export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}
