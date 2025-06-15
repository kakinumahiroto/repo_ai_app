import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

// --- AI出力プレ処理（シンプル版） ---
function preprocessAIOutput(text) {
  if (!text) return text;
  
  // === LaTeX数式の統一的な変換 ===
  // 1. \(...\) → $...$（インライン数式）
  text = text.replace(/\\\(([^()]*(?:\([^()]*\)[^()]*)*)\\\)/g, '$$$1$');
  
  // 2. \[...\] → $$...$$（ディスプレイ数式）- 改行を含む場合に対応 
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    try {
      const result = '$$' + formula + '$$';
      return result;
    } catch (error) {
      console.error('数式変換エラー:', error);
      return match; // エラー時は元の文字列を返す
    }
  });

  // 3. 不完全な \ パターンを削除
  text = text.replace(/\\\s*$/gm, '');
  text = text.replace(/\s+\\\s+/g, ' ');
  text = text.replace(/\\\s*\n/g, '\n');

  return text;
}

// --- メイン描画（シンプル版） ---
function SafeMarkdownRenderer({ text }) {
  const cleanedText = preprocessAIOutput(text);
  
  return (
    <div style={{
      maxWidth: '100%',
      overflowX: 'auto', // 横スクロールを有効にする
      overflowY: 'hidden'
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}        components={{
          // ディスプレイ数式(div)のスタイルをカスタマイズ - ディスプレイ数式のみ対象
          div: ({ node, className, children, ...props }) => {
            if (className && className.includes('katex-display')) {
              return (
                <div 
                  className={className} 
                  {...props}
                  style={{
                    fontSize: '0.85em', // ディスプレイ数式のみ小さくする
                    maxWidth: '100%',
                    overflowX: 'auto',
                    textAlign: 'center',
                    margin: '10px 0'
                  }}
                >
                  {children}
                </div>
              );
            }
            return <div className={className} {...props}>{children}</div>;
          }
        }}
      >
        {cleanedText}
      </ReactMarkdown>
    </div>
  );
}

export default SafeMarkdownRenderer;
