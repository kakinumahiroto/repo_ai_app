import React, { useRef, useEffect } from 'react';
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
  setImageData,
  scrollToFollowup,
  resetScrollToFollowup,
  imageLoading,
  imageLoadedMsg,
  followupImageData,
  setFollowupImageData,
}) {
  const followupFormRef = useRef(null);
  const followupInputRef = useRef(null);

  useEffect(() => {
    if (scrollToFollowup && followupFormRef.current) {
      followupFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // スクロール後にテキストエリアにフォーカス
      setTimeout(() => {
        if (followupInputRef.current) {
          followupInputRef.current.focus();
        }
      }, 500); // スクロールアニメーションの完了を待つ
      resetScrollToFollowup && resetScrollToFollowup();
    }
  }, [scrollToFollowup, resetScrollToFollowup]);

  return (
    <div className="answer-area">
      <div className="answer-box">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* まず最初の質問・AI回答を交互に表示 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div className="followup-bubble-user">あなた: <FormattedText text={currentThread.question} /></div>
            {/* 画像が選択されている場合はカメラアイコンを表示 */}
            {imageData && (
              <div style={{ fontSize: 28, marginTop: 4, color: '#4f46e5' }} title="画像が添付されています">📷</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className="followup-bubble-ai">{currentThread.answer !== '' ? <FormattedText text={currentThread.answer} /> : <span style={{ color: '#888' }}>考え中...</span>}</div>
          </div>
          {/* 以降のやり取りを交互に表示（ユーザー→AI→ユーザー→AI...） */}
          {currentThread.thread.length > 0 && currentThread.thread.map((item, idx) => (
            <React.Fragment key={idx}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div className="followup-bubble-user">あなた: <FormattedText text={item.question} /></div>
                {/* 画像が添付されている場合はカメラアイコンを表示（将来拡張用） */}
                {item.imageData && (
                  <div style={{ fontSize: 28, marginTop: 4, color: '#4f46e5' }} title="画像が添付されています">📷</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div className="followup-bubble-ai">{item.answer !== '' ? <FormattedText text={item.answer} /> : <span style={{ color: '#888' }}>考え中...</span>}</div>
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
            <button
              key={s}
              type="button"
              onClick={() => {
                if (currentThread.question) {
                  setFollowupText(s);
                  setTimeout(() => {
                    document.getElementById('followup-form-submit-btn')?.click();
                  }, 0);
                } else {
                  handleSubmit(null, s);
                }
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {/* --- 追加: AI返答への自由入力欄＋音声・画像 --- */}
        <form
          ref={followupFormRef}
          onSubmit={handleFollowup}
          className="followup-form"
          style={{ position: 'relative', marginTop: 18, display: 'flex', gap: 8, width: '100%', justifyContent: 'center' }}
        >          <div className="followup-input-wrapper" style={{ position: 'relative', flex: 1 }}>
            <input
              ref={followupInputRef}
              type="text"
              value={followupText}
              onChange={e => {
                if (e.target.value.length <= 1000) {
                  setFollowupText(e.target.value);
                }
              }}
              maxLength={1000}
              placeholder="AIへの追加質問や返答を入力..."
              disabled={followupLoading}
              style={{ paddingRight: followupImageData && !imageLoading ? 36 : undefined }}
              required
            />
            {/* 追加質問で画像が読み込み済みなら右下にカメラアイコン */}
            {followupImageData && !imageLoading && (
              <span className="camera-icon-attached" title="画像が添付されています">📷</span>
            )}
          </div>
          <label htmlFor="followupImageInput" style={{ background: '#e0e7ff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', minWidth: 120, fontWeight: 'bold', justifyContent: 'center' }}>
            <span role="img" aria-label="カメラ" style={{ marginRight: 4 }}>📷</span>画像から質問
            <input id="followupImageInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageInputFollowup(e)} />
          </label>
          <button type="button" onClick={handleSpeechInputFollowup} style={{ background: '#e0e7ff', color: '#222', fontSize: 14, padding: '4px 10px', fontWeight: 'bold', minWidth: 120, justifyContent: 'center' }}>
            <span role="img" aria-label="マイク" style={{ marginRight: 4 }}>🎤</span>音声で質問
          </button>
          <button id="followup-form-submit-btn" type="submit" disabled={followupLoading || (!followupText.trim() && !followupImageData)} style={{ minWidth: 80 }}>
            送信
          </button>
        </form>
        {imageLoading && (
          <div className="image-loading-msg">画像を読み込んでいます...</div>
        )}
        {imageLoadedMsg && !imageLoading && (
          <div className="image-loaded-msg">{imageLoadedMsg}</div>
        )}
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
