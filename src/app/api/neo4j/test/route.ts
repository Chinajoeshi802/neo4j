import { NextRequest, NextResponse } from 'next/server';
import { testConnection, getGraphData } from '@/lib/neo4j';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/neo4j/test
 * 测试 Neo4j 连接
 */
export async function GET() {
  try {
    const result = await testConnection();
    
    if (result.success) {
      // 获取当前图数据统计
      const graphData = await getGraphData();
      
      return NextResponse.json({
        success: true,
        message: result.message,
        stats: {
          nodes: graphData.nodes.length,
          edges: graphData.edges.length,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.message,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('测试连接失败:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : '连接测试失败',
    }, { status: 500 });
  }
}
