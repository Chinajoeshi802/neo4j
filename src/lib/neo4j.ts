import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'neo4j+s://bc8f4144.databases.neo4j.io';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'DAwNrh5JOdfL_Tlb6H_B4ixJVX_ytJZoiVEtOGwvmJ8';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  const session: Session = getNeo4jDriver().session();
  try {
    await session.run('RETURN 1');
    return { success: true, message: '连接成功' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return { success: false, message: `连接失败: ${errorMessage}` };
  } finally {
    await session.close();
  }
}

export async function clearGraph(): Promise<void> {
  const session = getNeo4jDriver().session();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
  } finally {
    await session.close();
  }
}

export async function createNode(
  label: string,
  id: string,
  name: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const session = getNeo4jDriver().session();
  try {
    const props = { id, name, ...properties };
    const propsString = Object.entries(props)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: "${v.replace(/"/g, '\\"')}"`;
        return `${k}: ${JSON.stringify(v)}`;
      })
      .join(', ');
    
    await session.run(
      `CREATE (n:${label} {${propsString}})`
    );
  } finally {
    await session.close();
  }
}

export async function createRelation(
  fromId: string,
  toId: string,
  relationType: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const session = getNeo4jDriver().session();
  try {
    const propsString = Object.entries(properties)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: "${v.replace(/"/g, '\\"')}"`;
        return `${k}: ${JSON.stringify(v)}`;
      })
      .join(', ');
    
    const propsClause = propsString ? `{${propsString}}` : '';
    
    await session.run(
      `MATCH (a {id: $fromId}), (b {id: $toId}) 
       CREATE (a)-[r:${relationType} ${propsClause}]->(b)`,
      { fromId, toId }
    );
  } finally {
    await session.close();
  }
}

export async function getGraphData(): Promise<{
  nodes: Array<{ id: string; label: string; type: string; properties: Record<string, any> }>;
  edges: Array<{ id: string; source: string; target: string; type: string; properties: Record<string, any> }>;
}> {
  const session = getNeo4jDriver().session();
  try {
    // 获取所有节点
    const nodesResult = await session.run(`
      MATCH (n)
      RETURN n.id as id, n.name as label, labels(n)[0] as type, properties(n) as properties
    `);
    
    const nodes = nodesResult.records.map(record => ({
      id: record.get('id') || '',
      label: record.get('label') || record.get('id') || '',
      type: record.get('type') || 'Unknown',
      properties: record.get('properties') || {},
    }));

    // 获取所有关系
    const edgesResult = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN a.id as source, b.id as target, type(r) as type, properties(r) as properties
    `);
    
    const edges = edgesResult.records.map((record, index) => ({
      id: `edge_${index}`,
      source: record.get('source') || '',
      target: record.get('target') || '',
      type: record.get('type') || 'RELATES_TO',
      properties: record.get('properties') || {},
    }));

    return { nodes, edges };
  } finally {
    await session.close();
  }
}

export async function getNodeCount(): Promise<number> {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.run('MATCH (n) RETURN count(n) as count');
    return result.records[0].get('count').toNumber();
  } finally {
    await session.close();
  }
}

export async function getEdgeCount(): Promise<number> {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
    return result.records[0].get('count').toNumber();
  } finally {
    await session.close();
  }
}
