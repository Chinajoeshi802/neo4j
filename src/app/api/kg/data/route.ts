import { NextResponse } from 'next/server';
import { getGraphData, getNodeCount, getEdgeCount } from '@/lib/neo4j';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/kg/data
 * 获取知识图谱数据
 */
export async function GET() {
  try {
    const graphData = await getGraphData();
    
    return NextResponse.json({
      success: true,
      data: graphData,
      stats: {
        nodes: graphData.nodes.length,
        edges: graphData.edges.length,
      },
    });
  } catch (error) {
    console.error('获取图谱数据失败:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : '获取数据失败',
    }, { status: 500 });
  }
}
