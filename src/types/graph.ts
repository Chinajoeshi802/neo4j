// 知识图谱节点类型
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, string | number | boolean>;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

// 知识图谱边类型
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string | number | boolean>;
}

// 知识图谱数据
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// 实体定义
export interface EntityDefinition {
  label: string;
  description?: string;
  properties?: EntityProperty[];
}

// 实体属性
export interface EntityProperty {
  name: string;
  type: 'STRING' | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'DATE';
}

// 关系定义
export interface RelationDefinition {
  label: string;
  description?: string;
  properties?: EntityProperty[];
}

// 潜在模式
export interface PotentialSchema {
  source: string;
  relation: string;
  target: string;
}

// 配置类型
export interface KGBuilderConfig {
  entities: EntityDefinition[];
  relations: RelationDefinition[];
  potentialSchema: PotentialSchema[];
}

// 构建状态
export type BuildStatus = 'idle' | 'uploading' | 'parsing' | 'extracting' | 'building' | 'completed' | 'error' | 'preparing';

// 构建进度
export interface BuildProgress {
  status: BuildStatus;
  message: string;
  progress: number;
}

// 节点颜色映射
export const NODE_COLORS: Record<string, string> = {
  Person: '#3b82f6',
  Company: '#10b981',
  Location: '#f59e0b',
  Product: '#8b5cf6',
  Organization: '#06b6d4',
  Event: '#ef4444',
  default: '#6b7280',
};

// 获取节点颜色
export function getNodeColor(type: string): string {
  return NODE_COLORS[type] || NODE_COLORS.default;
}

// 默认配置
export const DEFAULT_CONFIG: KGBuilderConfig = {
  entities: [
    { label: 'Person', description: '人物，包括真实人物和虚拟角色' },
    { label: 'Company', description: '公司或组织机构' },
    { label: 'Location', description: '地理位置，如城市、国家、地址等' },
    { label: 'Product', description: '产品或服务' },
    { label: 'Organization', description: '组织机构' },
    { label: 'Event', description: '事件' },
  ],
  relations: [
    { label: 'WORKS_AT', description: '在某公司工作' },
    { label: 'LOCATED_AT', description: '位于某地' },
    { label: 'COMPETES_WITH', description: '与...竞争' },
    { label: 'PRODUCES', description: '生产/制造某产品' },
    { label: 'MANAGED_BY', description: '由...管理' },
    { label: 'PART_OF', description: '属于...的一部分' },
    { label: 'RELATED_TO', description: '与...相关' },
  ],
  potentialSchema: [
    { source: 'Person', relation: 'WORKS_AT', target: 'Company' },
    { source: 'Person', relation: 'MANAGED_BY', target: 'Person' },
    { source: 'Company', relation: 'LOCATED_AT', target: 'Location' },
    { source: 'Company', relation: 'COMPETES_WITH', target: 'Company' },
    { source: 'Company', relation: 'PRODUCES', target: 'Product' },
    { source: 'Person', relation: 'LOCATED_AT', target: 'Location' },
  ],
};
