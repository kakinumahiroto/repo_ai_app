import React from 'react';
import FormattedText from './FormattedText';

const SUGGESTIONS = [
  'もう少しヒントが欲しい',
  '途中式を詳しく教えて',
  '別の考え方を教えて',
  'この問題の類題を出して',
  '答えの理由を説明して',
];

function ChatBox({
  currentThread,
  currentAnswerChunks,
  currentChunkIndex,
  setCurrentChunkIndex,
  followupText,
  setFollowupText,
  followupLoading,
  handleFollowup,
  handleImageInputFollowup,
  handleSpeechInputFollowup,
  handleEndChat,
  error,
  loading,
  question,
  setQuestion,
  grade,
  setGrade,
  handleSubmit,
  handleImageInput,
  handleSpeechInput,
  showPromptHelp,
  followupError,
  imageData,
  setImageData
}) {
  return (
    <div className="answer-area">
      <div className="answer-box">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* まず最初の質問・AI回答を交互に表示 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div className="followup-bubble-user">あなた: {currentThread.question}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className="followup-bubble-ai">{currentThread.answer !== '' ? <FormattedText text={currentThread.answer} /> : <span style={{ color: '#888' }}>AIが考え中...</span>}</div>
          </div>
          {/* 以降のやり取りを交互に表示（ユーザー→AI→ユーザー→AI...） */}
          {currentThread.thread.length > 0 && currentThread.thread.map((item, idx) => (
            <React.Fragment key={idx}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div className="followup-bubble-user">あなた: {item.question}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div className="followup-bubble-ai">{item.answer !== '' ? <FormattedText text={item.answer} /> : <span style={{ color: '#888' }}>AIが考え中...</span>}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
        {/* 続きを表示ボタン */}
        {currentChunkIndex < currentAnswerChunks.length && (
          <button onClick={() => setCurrentChunkIndex(i => i + 1)} style={{ marginTop: 12 }}>続きを表示</button>
        )}
        {/* 選択式の追加質問誘導 */}
        <div className="suggest-btns">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => handleSubmit(null, s)}>{s}</button>
          ))}
        </div>
        {/* --- 追加: AI返答への自由入力欄＋音声・画像 --- */}
        <form onSubmit={handleFollowup} className="followup-form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <input
            type="text"
            value={followupText}
            onChange={e => setFollowupText(e.target.value)}
            placeholder="AIへの追加質問や返答を入力..."
            disabled={followupLoading}
            style={{ marginBottom: 0 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
            <label htmlFor="followupImageInput" style={{ background: '#e0e7ff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', minWidth: 160, fontWeight: 'bold', justifyContent: 'center' }}>
              <span role="img" aria-label="カメラ" style={{ marginRight: 4 }}>📷</span>画像から質問
              <input id="followupImageInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageInputFollowup(e)} />
            </label>
            {/* 画像プレビュー（アップロード時のみ） */}
            {imageData && (
              <img src={imageData} alt="アップロード画像" style={{ maxWidth: '100%', margin: '8px 0', border: '1px solid #ccc', borderRadius: 6 }} />
            )}
            <button type="button" onClick={handleSpeechInputFollowup} style={{ background: '#e0e7ff', color: '#222', fontSize: 14, padding: '4px 10px', fontWeight: 'bold', minWidth: 160, justifyContent: 'center' }}>
              <span role="img" aria-label="マイク" style={{ marginRight: 4 }}>🎤</span>音声で質問
            </button>
          </div>
          <button type="submit" disabled={followupLoading || !followupText.trim()} style={{ width: '100%', marginTop: 0 }}>
            送信
          </button>
        </form>
        {followupError && <div style={{ color: 'red', marginTop: 6 }}>{followupError}</div>}
        {/* チャット終了ボタン */}
        <button onClick={handleEndChat} style={{ marginTop: 18, width: '100%', background: '#e0e7ff', color: '#222', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 16, cursor: 'pointer' }}>
          チャットを終了する
        </button>
      </div>
    </div>
  );
}

export default ChatBox;
