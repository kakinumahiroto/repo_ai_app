import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './App.css';
import Tesseract from 'tesseract.js';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

const SUGGESTIONS = [
  'もう少しヒントが欲しい',
  '途中式を詳しく教えて',
  '別の考え方を教えて',
  'この問題の類題を出して',
  '答えの理由を説明して',
];

// Firestoreエミュレータ/本番のURLを環境変数から取得
const FIRESTORE_API_URL = process.env.REACT_APP_FIRESTORE_API_URL;

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [showPromptHelp, setShowPromptHelp] = useState(false); // 曖昧な質問時の誘導表示
  const [grade, setGrade] = useState("小学生"); // 学年選択用
  const [expandedId, setExpandedId] = useState(null); // 履歴の展開状態
  const [currentAnswerChunks, setCurrentAnswerChunks] = useState([]); // 分割表示用
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [user, setUser] = useState(null); // ログインユーザ情報
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" or "register"
  const [authError, setAuthError] = useState("");

  // Firebase初期化
  useEffect(() => {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
        authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        projectId: 'ai-app-96b95',
      });
    }
  }, []);

  // メールアドレスでログイン/新規登録
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (authMode === "login") {
        const res = await firebase.auth().signInWithEmailAndPassword(email, password);
        setUser(res.user);
      } else {
        const res = await firebase.auth().createUserWithEmailAndPassword(email, password);
        setUser(res.user);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  // Firestoreから履歴を取得
  const fetchHistory = async (uid) => {
    if (!uid) return;
    try {
      const res = await axios.get(
        `${FIRESTORE_API_URL}/questionThreads`);
      if (res.data.documents && Array.isArray(res.data.documents)) {
        setHistory(res.data.documents
          .map(doc => {
            const threadArr = doc.fields.thread?.arrayValue?.values || [];
            return {
              id: doc.name.split('/').pop(),
              question: doc.fields.question?.stringValue || '',
              answer: doc.fields.answer?.stringValue || '',
              createdAt: doc.fields.createdAt?.stringValue || doc.fields.createdAt?.timestampValue || '',
              grade: doc.fields.grade?.stringValue || '',
              uid: doc.fields.uid?.stringValue || '',
              thread: threadArr.map(t => ({
                question: t.mapValue.fields.q.stringValue,
                answer: t.mapValue.fields.a.stringValue,
                createdAt: t.mapValue.fields.createdAt.stringValue
              }))
            };
          })
          .filter(item => item.uid === uid)
          .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)));
      } else {
        setHistory([]);
      }
    } catch (e) { setHistory([]); }
  };

  useEffect(() => {
    if (!user) return;
    fetchHistory(user.uid);
  }, [user]);

  // 進行中チャット（1スレッド分）をローカルで管理
  const [currentThread, setCurrentThread] = useState({
    question: '',
    answer: '',
    thread: [],
    grade: '小学生',
    createdAt: '',
  });

  // 新しい質問をしたらcurrentThreadを初期化し、AI応答をセット
  // handleSubmit: 定型質問・通常質問
  const handleSubmit = async (e, suggestText) => {
    e && e.preventDefault();
    setLoading(true);
    setError("");
    setAnswer("");
    setCurrentAnswerChunks([]);
    setCurrentChunkIndex(0);
    setFollowupList([]);
    setThreadId(null);
    const q = suggestText || question;
    setCurrentThread(prev => {
      let newThread = [...prev.thread];
      let newCreatedAt = prev.createdAt || new Date().toISOString();
      if (prev.question && prev.answer) {
        const last = newThread[newThread.length - 1];
        if (!last || last.question !== prev.question || last.answer !== prev.answer) {
          newThread.push({
            question: prev.question,
            answer: prev.answer,
            createdAt: prev.createdAt || newCreatedAt
          });
        }
      }
      return {
        question: q,
        answer: '',
        thread: newThread,
        grade,
        createdAt: newCreatedAt,
      };
    });
    setQuestion("");
    try {
      // --- threadもAPIに送信（直近5件のみ） ---
      const threadForApi = currentThread.thread.concat(
        currentThread.question && currentThread.answer
          ? [{ question: currentThread.question, answer: currentThread.answer }]
          : []
      );
      const lastN = 5;
      const threadForApiLimited = threadForApi.slice(-lastN);
      const res = await axios.post(
        process.env.REACT_APP_API_URL,
        { question: q, grade, uid: user?.uid, thread: threadForApiLimited },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const chunks = res.data.answer.match(/([\s\S]{1,500})(?=\n|$)/g) || [res.data.answer];
      setCurrentAnswerChunks(chunks);
      setCurrentChunkIndex(1);
      setAnswer(res.data.answer);
      setCurrentThread(prev => ({ ...prev, answer: res.data.answer }));
    } catch (err) {
      setError("AI回答の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleImageInput = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'jpn+eng');
      setQuestion(prev => (prev ? prev + '\n' : '') + text.trim());
    } catch (err) {
      setError("画像からテキスト抽出に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSpeechInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setError('音声認識に未対応のブラウザです');
      return;
    }
    setError("");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion(prev => (prev ? prev + '\n' : '') + transcript);
    };
    recognition.onerror = (event) => {
      setError('音声認識エラー: ' + event.error);
    };
    recognition.start();
  };

  // --- 追加: AI返答への自由入力欄 ---
  const [followupList, setFollowupList] = useState([]); // 追加: 連続やり取りリスト
  const [followupText, setFollowupText] = useState("");
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState("");
  const [threadId, setThreadId] = useState(null); // スレッドID（親質問ID）

  // AI返答への自由入力送信
  const handleFollowup = async (e) => {
    e.preventDefault();
    if (!followupText.trim()) return;
    setFollowupLoading(true);
    setFollowupError("");
    const q = followupText;
    setCurrentThread(prev => {
      let newThread = [...prev.thread];
      if (prev.question && prev.answer) {
        const last = newThread[newThread.length - 1];
        if (!last || last.question !== prev.question || last.answer !== prev.answer) {
          newThread.push({
            question: prev.question,
            answer: prev.answer,
            createdAt: prev.createdAt || new Date().toISOString()
          });
        }
      }
      return {
        ...prev,
        question: q,
        answer: '',
        createdAt: new Date().toISOString(),
        thread: newThread
      };
    });
    setFollowupText("");
    try {
      // --- threadもAPIに送信（直近5件のみ） ---
      const threadForApi = currentThread.thread.concat(
        currentThread.question && currentThread.answer
          ? [{ question: currentThread.question, answer: currentThread.answer }]
          : []
      );
      const lastN = 5;
      const threadForApiLimited = threadForApi.slice(-lastN);
      const res = await axios.post(
        process.env.REACT_APP_API_URL,
        { question: q, grade, uid: user?.uid, thread: threadForApiLimited },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setAnswer(res.data.answer);
      setCurrentAnswerChunks([res.data.answer]);
      setCurrentChunkIndex(1);
      setCurrentThread(prev => ({ ...prev, answer: res.data.answer }));
    } catch (err) {
      setFollowupError("AIへの再質問に失敗しました");
    } finally {
      setFollowupLoading(false);
    }
  };

  // チャット終了時にFirestoreへ保存し、履歴を更新
  const handleEndChat = async () => {
    if (!currentThread.question || !currentThread.answer) {
      setCurrentThread({ question: '', answer: '', thread: [], grade: '小学生', createdAt: '' });
      setCurrentAnswerChunks([]); setFollowupList([]); setThreadId(null); setQuestion(""); setAnswer("");
      return;
    }
    setLoading(true);
    try {
      await axios.post(
        `${FIRESTORE_API_URL}/questionThreads`,
        {
          fields: {
            question: { stringValue: currentThread.question },
            answer: { stringValue: currentThread.answer },
            createdAt: { stringValue: currentThread.createdAt },
            grade: { stringValue: currentThread.grade },
            uid: { stringValue: user?.uid },
            thread: {
              arrayValue: {
                values: currentThread.thread.map(t => ({
                  mapValue: {
                    fields: {
                      q: { stringValue: t.question },
                      a: { stringValue: t.answer },
                      createdAt: { stringValue: t.createdAt }
                    }
                  }
                }))
              }
            },
          }
        }
      );
      setCurrentThread({ question: '', answer: '', thread: [], grade: '小学生', createdAt: '' });
      setCurrentAnswerChunks([]); setFollowupList([]); setThreadId(null); setQuestion(""); setAnswer("");
      fetchHistory(user.uid);
    } catch (err) {
      setError("履歴の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleImageInputFollowup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFollowupLoading(true);
    setFollowupError("");
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'jpn+eng');
      setFollowupText(prev => (prev ? prev + '\n' : '') + text.trim());
    } catch (err) {
      setFollowupError("画像からテキスト抽出に失敗しました");
    } finally {
      setFollowupLoading(false);
    }
  };

  const handleSpeechInputFollowup = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setFollowupError('音声認識に未対応のブラウザです');
      return;
    }
    setFollowupError("");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setFollowupText(prev => (prev ? prev + '\n' : '') + transcript);
    };
    recognition.onerror = (event) => {
      setFollowupError('音声認識エラー: ' + event.error);
    };
    recognition.start();
  };

  // 履歴の質問をクリックしたら、そのスレッド（親＋やり取り）を表示
  const handleHistoryClick = (item) => {
    setExpandedId(expandedId === item.id ? null : item.id);
  };

  // UI
  if (!user) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>AI家庭教師「まなび先生」</h1>
          <form onSubmit={handleAuth} style={{ maxWidth: 360, margin: '40px auto', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px #bfcfff' }}>
            <h2 style={{ marginBottom: 16 }}>{authMode === "login" ? "ログイン" : "新規登録"}</h2>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="メールアドレス" required style={{ width: '100%', marginBottom: 12, padding: 8, fontSize: 15 }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード" required style={{ width: '100%', marginBottom: 16, padding: 8, fontSize: 15 }} />
            <button type="submit" style={{ width: '100%', marginBottom: 8 }}>{authMode === "login" ? "ログイン" : "登録"}</button>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <span style={{ cursor: 'pointer', color: '#4f46e5' }} onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "新規登録はこちら" : "ログインはこちら"}</span>
            </div>
            {authError && <div style={{ color: 'red', marginTop: 10 }}>{authError}</div>}
          </form>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI家庭教師「まなび先生」</h1>
        <div className="form-center-wrap">
          <form onSubmit={handleSubmit} className="form-center" style={{ width: '100%' }}>
            <div style={{ marginBottom: 8, textAlign: 'left', color: '#888', fontSize: 14 }}>
              効果的な質問例:「この問題の考え方を教えて」「途中式を説明して」「どこが分からないか具体的に教えて」など。
            </div>
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
              <label style={{ fontWeight: 'bold', marginRight: 8 }}>学年:</label>
              <select value={grade} onChange={e => setGrade(e.target.value)} style={{ fontSize: 16, padding: 4 }}>
                <option value="小学生">小学生</option>
                <option value="中学生">中学生</option>
                <option value="高校生">高校生</option>
              </select>
            </div>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="質問を入力してください（例：この数学の問題の考え方を教えて）"
              rows={3}
              style={{ width: '100%' }}
              required
            />
            {showPromptHelp && (
              <div style={{ color: '#e67e22', margin: '8px 0', fontSize: 15, textAlign: 'left' }}>
                効果的な質問をするには「どの教科・単元か」「どこが分からないか」「どんな答えが欲しいか」を具体的に書くと良いです。
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
              <label htmlFor="imageInput" style={{ background: '#e0e7ff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }}>
                <span role="img" aria-label="カメラ" style={{ marginRight: 4 }}>📷</span>画像から質問
                <input id="imageInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageInput} />
              </label>
              <button type="button" onClick={handleSpeechInput} style={{ background: '#e0e7ff', color: '#222', fontSize: 14, padding: '4px 10px', fontWeight: 'bold' }}>
                <span role="img" aria-label="マイク" style={{ marginRight: 4 }}>🎤</span>音声で質問
              </button>
            </div>
            <button type="submit" disabled={loading || !question} style={{ marginTop: 8, width: 180, alignSelf: 'center' }}>
              {loading ? 'AIが考え中...' : '質問する'}
            </button>
          </form>
        </div>
        {/* AI回答分割表示 */}
        {currentThread.question && (
          <div className="answer-area">
            <div className="answer-box">
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* ここでcurrentThread.threadの履歴をすべて表示 */}
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
                {/* 最後に現在の質問/AI回答を表示 */}
                {currentThread.question && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <div className="followup-bubble-user">あなた: {currentThread.question}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div className="followup-bubble-ai">
                        <FormattedText text={currentThread.answer || answer || (loading ? 'AIが考え中...' : '')} />
                      </div>
                    </div>
                  </>
                )}
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
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 0 }}>
                  <label htmlFor="followupImageInput" className="icon-btn" style={{ minWidth: 160, justifyContent: 'center', fontWeight: 'bold' }}>
                    <span role="img" aria-label="カメラ" style={{ marginRight: 8 }}>📷</span>画像から質問
                    <input id="followupImageInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageInputFollowup(e)} />
                  </label>
                  <button type="button" className="icon-btn" onClick={handleSpeechInputFollowup} style={{ minWidth: 160, fontWeight: 'bold', justifyContent: 'center' }}>
                    <span role="img" aria-label="マイク" style={{ marginRight: 8 }}>🎤</span>音声で質問
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
        )}
        {/* 履歴（質問のみリスト、クリックでスレッド展開） */}
        <div className="center-history" style={{ marginTop: 32, maxWidth: 480, width: '100%' }}>
          <h2>質問履歴</h2>
          {history.length === 0 && <div style={{ color: '#888' }}>履歴はありません</div>}
          {history.map(item => (
            <div key={item.id} className="history-list">
              <div style={{ fontWeight: 'bold', color: '#333', cursor: 'pointer' }} onClick={() => handleHistoryClick(item)}>
                Q: {item.question}
                <button style={{ float: 'right', fontSize: 13, background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer' }}>{expandedId === item.id ? '▲ 閉じる' : '▼ 展開'}</button>
              </div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>日時: {item.createdAt && new Date(item.createdAt).toLocaleString()} / 学年: {item.grade || '未設定'}</div>
              {expandedId === item.id && (
                <div className="answer-detail" style={{ marginTop: 12 }}>
                  {/* チャット形式で履歴スレッドを表示 */}
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* まず最初の質問・AI回答 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <div className="followup-bubble-user">あなた: {item.question}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div className="followup-bubble-ai"><FormattedText text={item.answer} /></div>
                    </div>
                    {/* 以降のやり取りを順に表示 */}
                    {item.thread && item.thread.length > 0 && item.thread.map((f, idx) => (
                      <React.Fragment key={idx}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div className="followup-bubble-user">あなた: {f.question}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <div className="followup-bubble-ai"><FormattedText text={f.answer} /></div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </header>
    </div>
  );
}

// テキスト内の数式（$...$や$$...$$）、コードブロック、改行、画像URLを成形して表示するコンポーネント
function FormattedText({ text }) {
  // KaTeXで数式を美しく表示（ReactMathjaxは不要）
  return (
    <div>
      {typeof text === 'string' && text.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeKatex]}
        >
          {text}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}

export default App;
