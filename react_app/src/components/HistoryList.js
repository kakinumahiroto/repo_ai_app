import React from 'react';
import FormattedText from './FormattedText';

function HistoryList({ history, expandedId, handleHistoryClick, handleContinueThread }) {
  return (
    <div className="center-history" style={{ marginTop: 32, maxWidth: 480, width: '100%' }}>
      <h2>質問履歴</h2>
      {history.length === 0 && <div style={{ color: '#888' }}>履歴はありません</div>}
      {history.map(item => (
        <div key={item.id} className="history-list">
          <div style={{ fontWeight: 'bold', color: '#333', cursor: 'pointer' }} onClick={() => handleHistoryClick(item)}>
            Q: {item.question}
            <button style={{ float: 'right', fontSize: 13, background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer' }}>
              {expandedId === item.id ? '▲ 閉じる' : '▼ 展開'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            日時: {item.createdAt && new Date(item.createdAt).toLocaleString()} / 学年: {item.grade || '未設定'}
          </div>
          {expandedId === item.id && (
            <div className="answer-detail" style={{ marginTop: 20, marginBottom: 20 }}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 一連の会話を一つの履歴としてまとめて表示 */}
                {(() => {
                  let chatLog = [
                    { type: 'user', text: item.question },
                    { type: 'ai', text: item.answer }
                  ];
                  if (item.thread && item.thread.length > 0) {
                    item.thread.forEach(f => {
                      chatLog.push({ type: 'user', text: f.question });
                      chatLog.push({ type: 'ai', text: f.answer });
                    });
                  }
                  return chatLog.map((turn, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: turn.type === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div className={turn.type === 'user' ? 'followup-bubble-user' : 'followup-bubble-ai'}>
                        {turn.type === 'user' ? 'あなた: ' : ''}
                        {turn.type === 'ai' ? <FormattedText text={turn.text} /> : turn.text}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              <button onClick={() => handleContinueThread(item)} style={{ marginTop: 16, width: '100%', background: '#e0e7ff', color: '#222', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 16, cursor: 'pointer' }}>
                このスレッドで続ける
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default HistoryList;
