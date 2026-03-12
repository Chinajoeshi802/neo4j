'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Network,
  Database,
  Play,
  RefreshCw,
  Loader2,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react';
import type { GraphData, GraphNode, KGBuilderConfig, BuildProgress, EntityDefinition, RelationDefinition } from '@/types/graph';
import { getNodeColor, DEFAULT_CONFIG } from '@/types/graph';

export default function Home() {
  // 状态
  const [text, setText] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [config, setConfig] = useState<KGBuilderConfig>(DEFAULT_CONFIG);
  const [progress, setProgress] = useState<BuildProgress>({
    status: 'idle',
    message: '',
    progress: 0,
  });
  const [activeTab, setActiveTab] = useState<'input' | 'config' | 'result'>('input');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showNodeDetail, setShowNodeDetail] = useState(false);
  const [showExportDrawer, setShowExportDrawer] = useState(false);
  const [showLegendDrawer, setShowLegendDrawer] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 300 });
  const [zoom, setZoom] = useState(1);

  // 检查数据库连接
  useEffect(() => {
    fetch('/api/neo4j/test')
      .then(res => res.json())
      .then(data => {
        setConnectionStatus(data.success ? 'connected' : 'error');
        if (data.success && data.stats) {
          console.log(`数据库已连接: ${data.stats.nodes} 节点, ${data.stats.edges} 关系`);
        }
      })
      .catch(() => setConnectionStatus('error'));
  }, []);

  // 更新容器尺寸
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height: height - 10 });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [activeTab]);

  // 构建知识图谱
  const handleBuild = useCallback(async () => {
    if (!text.trim()) return;

    setIsBuilding(true);
    setActiveTab('result');
    setProgress({ status: 'preparing', message: '准备构建...', progress: 5 });
    
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/kg/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          config,
          clearExisting: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('构建请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgress({
                status: data.status as any,
                message: data.message,
                progress: data.progress,
              });
              
              if (data.data) {
                setGraphData(data.data);
              }
            } catch (e) {
              console.error('解析进度数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setProgress({ status: 'error', message: '构建已取消', progress: 0 });
      } else {
        setProgress({
          status: 'error',
          message: error instanceof Error ? error.message : '构建失败',
          progress: 0,
        });
      }
    } finally {
      setIsBuilding(false);
      abortControllerRef.current = null;
    }
  }, [text, config]);

  // 加载已有图谱数据
  const handleLoadData = useCallback(async () => {
    try {
      const response = await fetch('/api/kg/data');
      const result = await response.json();
      if (result.success && result.data) {
        setGraphData(result.data);
        setActiveTab('result');
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }, []);

  // 清除图谱
  const handleClear = useCallback(async () => {
    try {
      await fetch('/api/kg/clear', { method: 'DELETE' });
      setGraphData(null);
      setProgress({ status: 'idle', message: '', progress: 0 });
      setActiveTab('input');
    } catch (error) {
      console.error('清除数据失败:', error);
    }
  }, []);

  // 重置
  const handleReset = useCallback(() => {
    setText('');
    setGraphData(null);
    setProgress({ status: 'idle', message: '', progress: 0 });
    setActiveTab('input');
    setSelectedNode(null);
  }, []);

  // 绘制图谱
  useEffect(() => {
    if (activeTab === 'result' && graphData && graphData.nodes.length > 0) {
      drawGraph();
    }
  }, [activeTab, graphData]);

  const drawGraph = useCallback(() => {
    if (!svgRef.current || !graphData || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;
    const g = svg.append('g').attr('class', 'graph-container');

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    // 箭头
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead-mobile')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#94a3b8');

    interface D3Node extends GraphNode {
      index?: number;
      vx?: number;
      vy?: number;
    }
    interface D3Edge {
      id: string;
      type: string;
      properties?: Record<string, string | number | boolean>;
      source: D3Node;
      target: D3Node;
    }

    const nodes: D3Node[] = graphData.nodes.map((n, i) => ({ ...n, index: i }));
    const nodeMap = new Map<string, D3Node>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const edges: D3Edge[] = graphData.edges.map((e) => {
      const sourceNode = nodeMap.get(e.source);
      const targetNode = nodeMap.get(e.target);
      const source: D3Node = sourceNode || { id: e.source, label: e.source, type: 'Unknown' };
      const target: D3Node = targetNode || { id: e.target, label: e.target, type: 'Unknown' };
      if (!sourceNode) nodes.push(source);
      if (!targetNode) nodes.push(target);
      return { id: e.id, type: e.type, properties: e.properties, source, target };
    });

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<D3Node, D3Edge>(edges).id((d) => d.id).distance(100).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // 边
    const linkGroup = g.append('g').attr('class', 'links');
    const links = linkGroup.selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead-mobile)');

    // 节点
    const nodeGroup = g.append('g').attr('class', 'nodes');
    nodeGroup.selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }))
      .on('click', (event, d) => {
        event.stopPropagation();
        const node = graphData.nodes.find((n) => n.id === d.id);
        if (node) {
          setSelectedNode(node);
          setShowNodeDetail(true);
        }
      })
      .each(function(d) {
        const group = d3.select(this);
        group.append('circle')
          .attr('r', 20)
          .attr('fill', getNodeColor(d.type))
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
        group.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#fff')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .text(d.label.charAt(0).toUpperCase());
      });

    simulation.on('tick', () => {
      links
        .attr('x1', (d) => d.source.x || 0)
        .attr('y1', (d) => d.source.y || 0)
        .attr('x2', (d) => d.target.x || 0)
        .attr('y2', (d) => d.target.y || 0);
      nodeGroup.selectAll<SVGGElement, D3Node>('g.node-group')
        .attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`);
    });

    // 保存 zoom 行为供按钮使用
    const svgNode = svg.node();
    if (svgNode) {
      (svgNode as any)._zoom = zoomBehavior;
    }
  }, [graphData, dimensions]);

  // 缩放控制
  const handleZoomIn = () => {
    const svg = d3.select(svgRef.current);
    const svgNode = svg.node();
    const zoomBehavior = svgNode ? (svgNode as any)._zoom : null;
    if (zoomBehavior) {
      svg.transition().call(zoomBehavior.scaleBy, 1.5);
    }
  };

  const handleZoomOut = () => {
    const svg = d3.select(svgRef.current);
    const svgNode = svg.node();
    const zoomBehavior = svgNode ? (svgNode as any)._zoom : null;
    if (zoomBehavior) {
      svg.transition().call(zoomBehavior.scaleBy, 0.67);
    }
  };

  const handleFitToScreen = () => {
    const svg = d3.select(svgRef.current);
    const svgNode = svg.node();
    const zoomBehavior = svgNode ? (svgNode as any)._zoom : null;
    if (zoomBehavior) {
      const { width, height } = dimensions;
      svg.transition().call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
      );
    }
  };

  // 导出功能
  const handleExport = useCallback((format: string) => {
    if (!graphData) return;

    let content = '';
    let filename = '';
    let mimeType = '';

    switch (format) {
      case 'json':
        content = JSON.stringify(graphData, null, 2);
        filename = 'knowledge-graph.json';
        mimeType = 'application/json';
        break;
      case 'csv-nodes':
        content = 'id,label,type,properties\n' + graphData.nodes.map((n) => 
          `${n.id},"${n.label}","${n.type}","${JSON.stringify(n.properties || {}).replace(/"/g, '""')}"`
        ).join('\n');
        filename = 'nodes.csv';
        mimeType = 'text/csv';
        break;
      case 'csv-edges':
        content = 'id,source,target,type,properties\n' + graphData.edges.map((e) => 
          `${e.id},"${e.source}","${e.target}","${e.type}","${JSON.stringify(e.properties || {}).replace(/"/g, '""')}"`
        ).join('\n');
        filename = 'edges.csv';
        mimeType = 'text/csv';
        break;
      case 'cypher':
        const nodeStatements = graphData.nodes.map((n) => {
          const props = n.properties ? Object.entries(n.properties).map(([k, v]) => `${k}: "${v}"`).join(', ') : '';
          return `CREATE (:${n.type} {id: "${n.id}", label: "${n.label}"${props ? ', ' + props : ''}})`;
        }).join(';\n');
        const edgeStatements = graphData.edges.map((e) => 
          `MATCH (a {id: "${e.source}"}), (b {id: "${e.target}"}) CREATE (a)-[:${e.type}]->(b)`
        ).join(';\n');
        content = `// 节点\n${nodeStatements};\n\n// 关系\n${edgeStatements};`;
        filename = 'knowledge-graph.cypher';
        mimeType = 'text/plain';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportDrawer(false);
  }, [graphData]);

  // 添加实体
  const addEntity = () => {
    const newEntity: EntityDefinition = { label: `Entity_${config.entities.length + 1}`, description: '' };
    setConfig({ ...config, entities: [...config.entities, newEntity] });
  };

  // 添加关系
  const addRelation = () => {
    const newRelation: RelationDefinition = { label: `RELATION_${config.relations.length + 1}`, description: '' };
    setConfig({ ...config, relations: [...config.relations, newRelation] });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Network className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-semibold text-slate-800">知识图谱构建器</h1>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs">
              {connectionStatus === 'checking' && (
                <span className="text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 连接中
                </span>
              )}
              {connectionStatus === 'connected' && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Neo4j 已连接
                </span>
              )}
              {connectionStatus === 'error' && (
                <span className="text-red-500 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> 连接失败
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeTab === 'result' && (
              <>
                <Button variant="ghost" size="icon" onClick={() => setShowLegendDrawer(true)}>
                  <Database className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowExportDrawer(true)}>
                  <Download className="w-5 h-5" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={handleReset}>
              <RefreshCw className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="flex-1 flex flex-col">
        {/* 标签页 */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
          <div className="px-4 pt-2 bg-white border-b">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="input">输入文本</TabsTrigger>
              <TabsTrigger value="config">配置</TabsTrigger>
              <TabsTrigger value="result">图谱</TabsTrigger>
            </TabsList>
          </div>

          {/* 输入文本 */}
          <TabsContent value="input" className="flex-1 p-4 space-y-4 mt-0">
            <Card className="flex-1">
              <CardContent className="p-4 h-full flex flex-col">
                <Label className="text-sm font-medium mb-2">输入要分析的文本内容</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="粘贴或输入文本内容，系统将自动提取实体和关系构建知识图谱..."
                  className="flex-1 min-h-[200px] resize-none"
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleLoadData} className="h-12">
                <Database className="w-4 h-4 mr-2" />
                加载已有图谱
              </Button>
              <Button
                onClick={handleBuild}
                disabled={!text.trim() || isBuilding || connectionStatus !== 'connected'}
                className="h-12"
              >
                {isBuilding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    构建中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    开始构建
                  </>
                )}
              </Button>
            </div>

            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-700 mb-2">使用说明</p>
                <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                  <li>在"配置"标签页自定义实体和关系类型</li>
                  <li>输入或粘贴要分析的文本内容</li>
                  <li>点击"开始构建"提取知识图谱</li>
                  <li>查看可视化图谱并下载结果</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 配置 */}
          <TabsContent value="config" className="flex-1 p-4 space-y-4 mt-0 overflow-auto">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-medium">实体类型</Label>
                  <Button variant="outline" size="sm" onClick={addEntity}>
                    <Plus className="w-3 h-3 mr-1" /> 添加
                  </Button>
                </div>
                <div className="space-y-2">
                  {config.entities.map((entity, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Input
                        value={entity.label}
                        onChange={(e) => {
                          const newEntities = [...config.entities];
                          newEntities[index] = { ...entity, label: e.target.value };
                          setConfig({ ...config, entities: newEntities });
                        }}
                        className="flex-1 h-8"
                        placeholder="实体标签"
                      />
                      <Input
                        value={entity.description || ''}
                        onChange={(e) => {
                          const newEntities = [...config.entities];
                          newEntities[index] = { ...entity, description: e.target.value };
                          setConfig({ ...config, entities: newEntities });
                        }}
                        className="flex-1 h-8"
                        placeholder="描述（可选）"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          const newEntities = config.entities.filter((_, i) => i !== index);
                          setConfig({ ...config, entities: newEntities });
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-medium">关系类型</Label>
                  <Button variant="outline" size="sm" onClick={addRelation}>
                    <Plus className="w-3 h-3 mr-1" /> 添加
                  </Button>
                </div>
                <div className="space-y-2">
                  {config.relations.map((relation, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Input
                        value={relation.label}
                        onChange={(e) => {
                          const newRelations = [...config.relations];
                          newRelations[index] = { ...relation, label: e.target.value };
                          setConfig({ ...config, relations: newRelations });
                        }}
                        className="w-32 h-8"
                        placeholder="关系标签"
                      />
                      <Input
                        value={relation.description || ''}
                        onChange={(e) => {
                          const newRelations = [...config.relations];
                          newRelations[index] = { ...relation, description: e.target.value };
                          setConfig({ ...config, relations: newRelations });
                        }}
                        className="flex-1 h-8"
                        placeholder="描述（可选）"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          const newRelations = config.relations.filter((_, i) => i !== index);
                          setConfig({ ...config, relations: newRelations });
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button variant="outline" onClick={handleClear} className="w-full">
              <Trash2 className="w-4 h-4 mr-2" /> 清除数据库中的图谱
            </Button>
          </TabsContent>

          {/* 结果 */}
          <TabsContent value="result" className="flex-1 flex flex-col mt-0">
            {/* 构建进度 */}
            {isBuilding && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm font-medium text-blue-700">{progress.message}</span>
                </div>
                <Progress value={progress.progress} className="h-1" />
              </div>
            )}

            {/* 构建完成/错误 */}
            {progress.status === 'completed' && !isBuilding && (
              <div className="px-4 py-2 bg-green-50 border-b border-green-100">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">{progress.message}</span>
                </div>
              </div>
            )}

            {progress.status === 'error' && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">{progress.message}</span>
                </div>
              </div>
            )}

            {/* 统计信息 */}
            {graphData && graphData.nodes.length > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-xl font-bold text-primary">{graphData.nodes.length}</p>
                      <p className="text-xs text-slate-500">节点</p>
                    </div>
                    <div className="w-px h-8 bg-slate-200" />
                    <div className="text-center">
                      <p className="text-xl font-bold text-primary">{graphData.edges.length}</p>
                      <p className="text-xs text-slate-500">关系</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handleZoomOut}>
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-slate-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
                    <Button variant="ghost" size="icon" onClick={handleZoomIn}>
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleFitToScreen}>
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 图谱可视化 */}
            <div ref={containerRef} className="flex-1 relative bg-white">
              {graphData && graphData.nodes.length > 0 ? (
                <svg
                  ref={svgRef}
                  width={dimensions.width}
                  height={dimensions.height}
                  className="w-full h-full touch-none"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <Network className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">暂无图谱数据</p>
                    <p className="text-sm mt-2">输入文本并点击"开始构建"</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* 节点详情抽屉 */}
      <Drawer open={showNodeDetail} onOpenChange={setShowNodeDetail}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>节点详情</DrawerTitle>
          </DrawerHeader>
          {selectedNode && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: getNodeColor(selectedNode.type) }}
                >
                  {selectedNode.label.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-lg font-semibold">{selectedNode.label}</p>
                  <Badge style={{ backgroundColor: getNodeColor(selectedNode.type), color: '#fff' }}>
                    {selectedNode.type}
                  </Badge>
                </div>
              </div>

              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2">属性</p>
                  <div className="space-y-2">
                    {Object.entries(selectedNode.properties).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                        <span className="text-slate-500">{key}</span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {graphData && (
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2">相关关系</p>
                  <div className="space-y-2">
                    {graphData.edges
                      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                      .slice(0, 5)
                      .map((edge) => {
                        const isSource = edge.source === selectedNode.id;
                        const otherNodeId = isSource ? edge.target : edge.source;
                        const otherNode = graphData.nodes.find((n) => n.id === otherNodeId);
                        return (
                          <div key={edge.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                            <span className="text-slate-500 text-sm">
                              {isSource ? '→' : '←'} {edge.type}
                            </span>
                            <span className="text-sm font-medium">{otherNode?.label || otherNodeId}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* 导出抽屉 */}
      <Drawer open={showExportDrawer} onOpenChange={setShowExportDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>导出图谱数据</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-3">
            <Button variant="outline" className="w-full justify-start h-14" onClick={() => handleExport('json')}>
              <FileJson className="h-5 w-5 mr-3 text-blue-500" />
              <div className="text-left">
                <p className="font-medium">JSON 格式</p>
                <p className="text-xs text-slate-500">完整图谱数据，适合程序处理</p>
              </div>
            </Button>

            <Button variant="outline" className="w-full justify-start h-14" onClick={() => handleExport('csv-nodes')}>
              <FileSpreadsheet className="h-5 w-5 mr-3 text-green-500" />
              <div className="text-left">
                <p className="font-medium">节点 CSV</p>
                <p className="text-xs text-slate-500">节点列表，可用 Excel 打开</p>
              </div>
            </Button>

            <Button variant="outline" className="w-full justify-start h-14" onClick={() => handleExport('csv-edges')}>
              <FileSpreadsheet className="h-5 w-5 mr-3 text-green-500" />
              <div className="text-left">
                <p className="font-medium">关系 CSV</p>
                <p className="text-xs text-slate-500">关系列表，可用 Excel 打开</p>
              </div>
            </Button>

            <Button variant="outline" className="w-full justify-start h-14" onClick={() => handleExport('cypher')}>
              <Database className="h-5 w-5 mr-3 text-purple-500" />
              <div className="text-left">
                <p className="font-medium">Cypher 脚本</p>
                <p className="text-xs text-slate-500">Neo4j 导入脚本，可直接执行</p>
              </div>
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* 图例抽屉 */}
      <Drawer open={showLegendDrawer} onOpenChange={setShowLegendDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>图例说明</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-3">实体类型</p>
              <div className="grid grid-cols-2 gap-3">
                {graphData && Array.from(new Set(graphData.nodes.map((n) => n.type))).map((type) => (
                  <div key={type} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getNodeColor(type) }} />
                    <span className="text-sm">{type}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {graphData.nodes.filter((n) => n.type === type).length}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-500 mb-3">关系类型</p>
              <div className="flex flex-wrap gap-2">
                {graphData && Array.from(new Set(graphData.edges.map((e) => e.type))).map((type) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type} ({graphData.edges.filter((e) => e.type === type).length})
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
