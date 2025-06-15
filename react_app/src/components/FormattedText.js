import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

// --- AI出力プレ処理（シンプル版） ---
function preprocessAIOutput(text) {
  if (!text) return text;

  // 処理済みフラグをチェック（重複処理を防ぐ）
  if (text.includes('@@PROCESSED@@')) {
    return text.replace('@@PROCESSED@@', '');
  }

  // === LaTeX数式の統一的な変換 ===
  
  // 1. \(...\) → $...$（インライン数式）
  text = text.replace(/\\\(([^()]*(?:\([^()]*\)[^()]*)*)\\\)/g, '$$$1$');

  // 2. \[...\] → $$...$$（ディスプレイ数式）  
  text = text.replace(/\\\[([^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*)\\\]/g, '$$$$$$1$$$$');

  // 3. 不完全な \ パターンを削除
  text = text.replace(/\\\s*$/gm, '');
  text = text.replace(/\s+\\\s+/g, ' ');
  text = text.replace(/\\\s*\n/g, '\n');

  // 4. 空の数式ブロックを削除
  text = text.replace(/\$\$\s*\$\$/g, '');
  text = text.replace(/\$\s*\$/g, '');

  // 処理済みフラグを追加
  text = text + '@@PROCESSED@@';

  return text;
}

// --- メイン描画（シンプル版） ---
function SafeMarkdownRenderer({ text }) {
  const cleanedText = preprocessAIOutput(text);
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
    >
      {cleanedText}
    </ReactMarkdown>
  );
}

export default SafeMarkdownRenderer;
