import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// 画像・SVG・base64画像も正しく表示するカスタムimgレンダラー
function isSvgDataUrl(src) {
  return src.startsWith('data:image/svg+xml');
}
function isBase64Image(src) {
  return src.startsWith('data:image/');
}
function isSvgXml(src) {
  return src.trim().startsWith('<svg');
}

const components = {
  img: ({ src = '', alt = '' }) => {
    if (isSvgDataUrl(src) || isBase64Image(src)) {
      return <img src={src} alt={alt} style={{ maxWidth: '100%', margin: '8px 0' }} />;
    }
    if (isSvgXml(src)) {
      // SVG XML文字列を直接埋め込む
      return <span dangerouslySetInnerHTML={{ __html: src }} style={{ display: 'block', maxWidth: '100%', margin: '8px 0' }} />;
    }
    // 通常の画像URL
    return <img src={src} alt={alt} style={{ maxWidth: '100%', margin: '8px 0' }} />;
  },
};

// テキスト内の数式・コード・画像・SVGを成形して表示
function FormattedText({ text }) {
  return (
    <div>
      {typeof text === 'string' && text.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={components}
        >
          {text}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}

export default FormattedText;
