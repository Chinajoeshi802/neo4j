import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '知识图谱构建器 | Neo4j GraphRAG',
    template: '%s | 知识图谱构建器',
  },
  description:
    '基于 Neo4j GraphRAG 的知识图谱构建工具，支持从文本中提取实体和关系，可视化展示知识图谱。',
  keywords: [
    '知识图谱',
    'Neo4j',
    'GraphRAG',
    'DeepSeek',
    '实体提取',
    '关系提取',
    '图谱可视化',
  ],
  authors: [{ name: 'Knowledge Graph Builder' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#3b82f6" />
      </head>
      <body className="antialiased">
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
