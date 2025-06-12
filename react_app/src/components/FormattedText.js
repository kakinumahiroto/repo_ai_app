import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MathJax, MathJaxContext } from 'better-react-mathjax';

// SVGや画像を判定するユーティリティ
function isSvgDataUrl(src) {
  return src.startsWith('data:image/svg+xml');
}
function isBase64Image(src) {
  return src.startsWith('data:image/');
}
function isSvgXml(src) {
  return src.trim().startsWith('<svg');
}

// 画像・SVG表示カスタムレンダラー
const components = {
  img: ({ src = '', alt = '' }) => {
    if (isSvgDataUrl(src) || isBase64Image(src)) {
      return <img src={src} alt={alt} style={{ maxWidth: '100%', margin: '8px 0' }} />;
    }
    if (isSvgXml(src)) {
      return <span dangerouslySetInnerHTML={{ __html: src }} style={{ display: 'block', maxWidth: '100%', margin: '8px 0' }} />;
    }
    return <img src={src} alt={alt} style={{ maxWidth: '100%', margin: '8px 0' }} />;
  },
};

// --- 数式抽出＆プレースホルダー化 ---
function extractMathPlaceholders(text) {
  // コードブロック・インラインコードを一時退避
  const codeBlocks = [];
  let replaced = text.replace(/```[\s\S]*?```/g, match => {
    codeBlocks.push(match);
    return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
  });
  replaced = replaced.replace(/`[^`]+`/g, match => {
    codeBlocks.push(match);
    return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
  });

  // $$...$$（display math）
  const mathBlocks = [];
  replaced = replaced.replace(/\$\$([\s\S]+?)\$\$/g, (match, p1) => {
    mathBlocks.push({ type: 'block', content: p1 });
    return `@@MATHBLOCK${mathBlocks.length - 1}@@`;
  });
  // $...$（inline math）
  replaced = replaced.replace(/\$([^$\n]+?)\$/g, (match, p1) => {
    mathBlocks.push({ type: 'inline', content: p1 });
    return `@@MATHBLOCK${mathBlocks.length - 1}@@`;
  });

  return { replaced, codeBlocks, mathBlocks };
}

// --- プレースホルダーをMathJaxに戻す（ノード再帰処理） ---
function restoreMathInNode(node, mathBlocks) {
  if (typeof node === 'string') {
    // 文字列内の@@MATHBLOCKn@@をMathJaxに置換
    const parts = [];
    let lastIndex = 0;
    const regex = /@@MATHBLOCK(\d+)@@/g;
    let match;
    let key = 0;
    while ((match = regex.exec(node)) !== null) {
      if (match.index > lastIndex) {
        parts.push(node.slice(lastIndex, match.index));
      }
      const idx = parseInt(match[1], 10);
      const math = mathBlocks[idx];
      if (math) {
        parts.push(
          <MathJax key={key++} dynamic inline={math.type !== 'block'}>{math.content}</MathJax>
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < node.length) {
      parts.push(node.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : parts;
  }
  if (Array.isArray(node)) {
    return node.map(child => restoreMathInNode(child, mathBlocks));
  }
  if (React.isValidElement(node)) {
    // コードブロック・インラインコードはそのまま
    if (node.type === 'code' || node.type === 'pre' || node.type === 'inlineCode') {
      return node;
    }
    // 再帰的にchildrenを処理
    return React.cloneElement(
      node,
      node.props,
      restoreMathInNode(node.props.children, mathBlocks)
    );
  }
  return node;
}

// --- コードブロック・インラインコードを復元 ---
function restoreCodeBlocks(text, codeBlocks) {
  return text.replace(/@@CODEBLOCK(\d+)@@/g, (_, n) => codeBlocks[n]);
}

// --- メイン表示コンポーネント ---
function FormattedText({ text }) {
  // 数式を一時プレースホルダー化
  const { replaced, codeBlocks, mathBlocks } = extractMathPlaceholders(text);
  // コードブロック・インラインコードを復元
  const restored = restoreCodeBlocks(replaced, codeBlocks);
  // Markdownパース
  const markdown = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        ...components,
        p: ({ children }) => <p>{children}</p>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong>{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        // textノードはそのまま
      }}
    >
      {restored}
    </ReactMarkdown>
  );
  // MathJaxプレースホルダーを再帰的にMathJaxに置換
  const withMath = restoreMathInNode(markdown, mathBlocks);
  return <MathJaxContext>{withMath}</MathJaxContext>;
}

export default FormattedText;
