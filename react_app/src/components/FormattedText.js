import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

// --- AI出力プレ処理（シンプル版） ---
function preprocessAIOutput(text) {
  if (!text) return text;

  // デバッグ用：処理前のテキストをログ出力
  console.log('処理前:', text);
  
  // === LaTeX数式の統一的な変換 ===
  // 1. \(...\) → $...$（インライン数式）
  text = text.replace(/\\\(([^()]*(?:\([^()]*\)[^()]*)*)\\\)/g, '$$$1$');
  console.log('インライン数式変換後:', text);
  
  // 2. \[...\] → $$...$$（ディスプレイ数式）- 改行を含む場合に対応 
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    try {
      const result = '$$' + formula + '$$';
      console.log('ディスプレイ数式変換:', match, '→', formula);
      console.log('変換結果:', result);
      console.log('結果の長さ:', result.length);
      return result;
    } catch (error) {
      console.error('コールバック関数でエラー:', error);
      return match; // エラー時は元の文字列を返す
    }
  });
  console.log('ディスプレイ数式変換後:', text);

  // 3. 不完全な \ パターンを削除
  text = text.replace(/\\\s*$/gm, '');
  text = text.replace(/\s+\\\s+/g, ' ');
  text = text.replace(/\\\s*\n/g, '\n');
  console.log('不完全パターン削除後:', text);  // 4. 空の数式ブロックを削除（改行のみの場合は削除しない）
  console.log('空ブロック削除前:', text);
  // 一時的に無効化
  // text = text.replace(/\$\$[ \t]*\$\$/g, ''); // 空白・タブのみ
  console.log('$$空ブロック削除後:', text);
  // text = text.replace(/\$[ \t]*\$/g, ''); // 空白・タブのみ
  console.log('$空ブロック削除後:', text);

  // デバッグ用：処理後のテキストをログ出力
  console.log('処理後:', text);

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
