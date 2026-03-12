import { NextResponse } from 'next/server';
import { clearGraph } from '@/lib/neo4j';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/kg/clear
 * 清除知识图谱数据
 */
export async function DELETE() {
  try {
    await clearGraph();
    
    return NextResponse.json({
      success: true,
      message: '图谱数据已清除',
    });
  } catch (error) {
    console.error('清除图谱数据失败:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : '清除数据失败',
    }, { status: 500 });
  }
}
