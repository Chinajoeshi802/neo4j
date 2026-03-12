const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-92e1098214e44130b5a360585e43bc0e';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

interface Entity {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, any>;
}

interface Relation {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}

interface ExtractionResult {
  entities: Entity[];
  relations: Relation[];
}

interface EntityDefinition {
  label: string;
  description?: string;
  properties?: Array<{ name: string; type: string }>;
}

interface RelationDefinition {
  label: string;
  description?: string;
  properties?: Array<{ name: string; type: string }>;
}

export async function extractEntitiesAndRelations(
  text: string,
  entities: EntityDefinition[],
  relations: RelationDefinition[],
  onProgress?: (message: string) => void
): Promise<ExtractionResult> {
  onProgress?.('正在分析文本...');

  // 构建 prompt
  const entityTypes = entities.map(e => {
    let desc = e.label;
    if (e.description) desc += ` (${e.description})`;
    return desc;
  }).join(', ');

  const relationTypes = relations.map(r => {
    let desc = r.label;
    if (r.description) desc += ` (${r.description})`;
    return desc;
  }).join(', ');

  const prompt = `你是一个知识图谱构建专家。请从以下文本中提取实体和关系。

实体类型: ${entityTypes}
关系类型: ${relationTypes}

文本内容:
"""
${text}
"""

请以 JSON 格式返回提取结果，格式如下:
{
  "entities": [
    {
      "id": "唯一标识(使用英文，如person_1, company_1)",
      "label": "实体名称(原文中的名称)",
      "type": "实体类型(必须是上述实体类型之一)",
      "properties": {
        "属性名": "属性值"
      }
    }
  ],
  "relations": [
    {
      "source": "源实体id",
      "target": "目标实体id",
      "type": "关系类型(必须是上述关系类型之一)",
      "properties": {
        "属性名": "属性值"
      }
    }
  ]
}

注意:
1. 只返回 JSON，不要有其他文字
2. 实体类型和关系类型必须是上述预定义的类型
3. id 必须是唯一的英文标识
4. 如果文本中没有相关实体或关系，返回空数组
`;

  onProgress?.('正在调用 LLM 提取...');

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    onProgress?.('正在解析结果...');

    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 未返回有效的 JSON 格式');
    }

    const result = JSON.parse(jsonMatch[0]) as ExtractionResult;

    // 验证和清理数据
    const validEntities = (result.entities || []).filter(e => e.id && e.label && e.type);
    const validRelations = (result.relations || []).filter(r => r.source && r.target && r.type);

    onProgress?.(`提取完成: ${validEntities.length} 个实体, ${validRelations.length} 个关系`);

    return {
      entities: validEntities,
      relations: validRelations,
    };
  } catch (error) {
    console.error('提取实体和关系失败:', error);
    throw error;
  }
}

export async function extractFromChunks(
  chunks: string[],
  entities: EntityDefinition[],
  relations: RelationDefinition[],
  onProgress?: (message: string) => void
): Promise<ExtractionResult> {
  const allEntities: Entity[] = [];
  const allRelations: Relation[] = [];
  const entityIdSet = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`正在处理第 ${i + 1}/${chunks.length} 段文本...`);
    
    const result = await extractEntitiesAndRelations(
      chunks[i],
      entities,
      relations,
      onProgress
    );

    // 合并实体，去重
    for (const entity of result.entities) {
      const key = `${entity.type}_${entity.label}`;
      if (!entityIdSet.has(key)) {
        entityIdSet.add(key);
        allEntities.push(entity);
      }
    }

    // 合并关系
    allRelations.push(...result.relations);
  }

  // 修复关系中的引用
  const entityMap = new Map<string, string>();
  allEntities.forEach(e => {
    entityMap.set(e.label, e.id);
  });

  const fixedRelations = allRelations.map(r => ({
    ...r,
    source: entityMap.get(r.source) || r.source,
    target: entityMap.get(r.target) || r.target,
  })).filter(r => 
    allEntities.some(e => e.id === r.source) && 
    allEntities.some(e => e.id === r.target)
  );

  return {
    entities: allEntities,
    relations: fixedRelations,
  };
}
