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
import AuthForm from './components/AuthForm';
import ChatBox from './components/ChatBox';
import HistoryList from './components/HistoryList';

const SUGGESTIONS = [
  'もう少しヒントが欲しい',
  '途中式を詳しく教えて',
  '別の考え方を教えて',
  'この問題の類題を出して',
  '答えの理由を説明して',
];

// Firestoreエミュレータ/本番のURLを環境変数から取得
const FIRESTORE_API_URL = (() => {
  const localUrl = process.env.REACT_APP_FIRESTORE_API_URL_LOCAL;
  const prodUrl = process.env.REACT_APP_FIRESTORE_API_URL_PROD;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return localUrl || prodUrl;
  }
  return prodUrl || localUrl;
})();

// AI APIエンドポイントも同様に自動切り替え
const API_URL = (() => {
  const localUrl = process.env.REACT_APP_API_URL_LOCAL;
  const prodUrl = process.env.REACT_APP_API_URL_PROD;
  // ragChatエンドポイントを優先して明示的に利用
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return (localUrl && localUrl.includes('ragChat')) ? localUrl : localUrl?.replace('aiAnswer', 'ragChat') || prodUrl?.replace('aiAnswer', 'ragChat');
  }
  return (prodUrl && prodUrl.includes('ragChat')) ? prodUrl : prodUrl?.replace('aiAnswer', 'ragChat') || localUrl?.replace('aiAnswer', 'ragChat');
})();

if (!FIRESTORE_API_URL) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_FIRESTORE_API_URL_LOCAL/PRODが未設定です。Firestore REST API呼び出しは失敗します。');
}
if (!API_URL) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_API_URL_LOCAL/PRODが未設定です。AI API呼び出しは失敗します。');
}

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [showPromptHelp, setShowPromptHelp] = useState(false); // 曖昧な質問時の誘導表示
  const [grade, setGrade] = useState("小学生"); // 学年選択用
  const [subject, setSubject] = useState("数学"); // 科目選択用
  const [expandedId, setExpandedId] = useState(null);
  const [currentAnswerChunks, setCurrentAnswerChunks] = useState([]); // 分割表示用
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [user, setUser] = useState(null); // ログインユーザ情報
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" or "register"
  const [authError, setAuthError] = useState("");
  const [rag_summary, setRag_summary] = useState(""); // RAG要約
  const [imageData, setImageData] = useState(null); // 画像データ保持

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

  // --- Firestoreから履歴を取得 ---
  const fetchHistory = async (uid) => {
    if (!uid) return;
    try {
      const res = await axios.get(
        `${FIRESTORE_API_URL}/questionThreads`);
      if (res.data.documents && Array.isArray(res.data.documents)) {
        const historyArr = res.data.documents
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
          // 修正: threadが空でもquestion/answerがあれば履歴に含める
          .filter(item => item.uid === uid && item.question && item.answer)
          .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        setHistory(historyArr);
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

  // handleSubmit: 最初の質問時のみ新規履歴を作成し、以降はpatchで更新
  const handleSubmit = async (e, suggestText) => {
    e && e.preventDefault();
    setLoading(true);
    setError("");
    setAnswer("");
    setCurrentAnswerChunks([]);
    setCurrentChunkIndex(0);
    setFollowupList([]);
    const q = suggestText || question;
    // --- 科目ごとにプロンプト最適化 ---
    let subjectPrompt = "";
    if (subject === "数学") {
      subjectPrompt = "あなたは親切な数学の家庭教師です。数式や途中式を分かりやすく説明し、図やグラフも活用して指導してください。";
    } else if (subject === "英語") {
      subjectPrompt = "あなたは親切な英語の家庭教師です。英文法や単語の意味、例文を分かりやすく説明してください。";
    } else if (subject === "理科") {
      subjectPrompt = "あなたは親切な理科の家庭教師です。現象や用語を分かりやすく説明してください。";
    } else if (subject === "社会") {
      subjectPrompt = "あなたは親切な社会の家庭教師です。歴史や地理、公民の内容を分かりやすく説明してください。";
    } else if (subject === "国語") {
      subjectPrompt = "あなたは親切な国語の家庭教師です。文章の意味や読解のコツを分かりやすく説明してください。";
    }
    // --- 他科目履歴が存在する場合は科目切り替えを促す ---
    const prevSubjects = (currentThread.thread || []).map(t => t.subject).filter(s => s && s !== subject);
    if (prevSubjects.length > 0) {
      setError(`このスレッドには他の科目（${[...new Set(prevSubjects)].join(', ')}）の質問が含まれています。科目を「${subject}」に切り替えて新しいスレッドで質問してください。`);
      setLoading(false);
      return;
    }
    // 新規スレッド開始
    if (!currentThread.question) {
      const createdAt = new Date().toISOString();
      const newThread = {
        question: q,
        answer: '',
        thread: [],
        grade,
        subject,
        createdAt,
      };
      setCurrentThread(newThread);
      setQuestion("");
      try {
        if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
        const res = await axios.post(
          API_URL,
          { question: q, grade, subject, uid: user?.uid, currentThread: newThread, subjectPrompt, imageData },
          { headers: { 'Content-Type': 'application/json' } }
        );
        const chunks = res.data.answer.match(/([\s\S]{1,500})(?=\n|$)/g) || [res.data.answer];
        setCurrentAnswerChunks(chunks);
        setCurrentChunkIndex(1);
        setAnswer(res.data.answer);
        // Firestoreに新規作成
        if (FIRESTORE_API_URL && user?.uid) {
          const resp = await axios.post(
            `${FIRESTORE_API_URL}/questionThreads`,
            {
              fields: {
                question: { stringValue: q },
                answer: { stringValue: res.data.answer },
                createdAt: { stringValue: createdAt },
                grade: { stringValue: grade },
                subject: { stringValue: subject },
                uid: { stringValue: user.uid },
                thread: { arrayValue: { values: [] } },
              }
            },
            { headers: { 'Content-Type': 'application/json' } }
          );
          // FirestoreのドキュメントIDをthreadIdに保存
          const id = resp.data.name?.split('/').pop();
          setThreadId(id);
          // 画面上のcurrentThreadにもanswerを反映
          setCurrentThread(prev => ({ ...prev, answer: res.data.answer }));
          fetchHistory(user.uid);
        }
      } catch (err) {
        setError("AI回答の取得に失敗しました: " + (err?.message || ''));
        console.error('handleSubmit error', err);
      } finally {
        setLoading(false);
      }
      return;
    }
    // 既存スレッドの場合はthreadに追加し、Firestoreをpatchで更新
    setQuestion("");
    const newFollow = {
      question: q,
      answer: '',
      createdAt: new Date().toISOString(),
      subject,
    };
    setCurrentThread(prev => ({
      ...prev,
      thread: [...prev.thread, newFollow],
    }));
    try {
      if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
      const prevThread = (currentThread.thread || []).filter(t => t.subject === subject);
      const lastN = 5;
      const threadForApiLimited = prevThread.slice(-lastN);
      const res = await axios.post(
        API_URL,
        { question: q, grade, subject, uid: user?.uid, currentThread, subjectPrompt, imageData },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setAnswer(res.data.answer);
      setCurrentAnswerChunks([res.data.answer]);
      setCurrentChunkIndex(1);
      setCurrentThread(prev => {
        const updatedThread = [...prev.thread];
        if (updatedThread.length > 0 && updatedThread[updatedThread.length - 1].question === q) {
          updatedThread[updatedThread.length - 1].answer = res.data.answer;
        }
        return {
          ...prev,
          thread: updatedThread,
        };
      });
      setImageData(null);
      // Firestoreの既存ドキュメントをpatchで更新
      if (FIRESTORE_API_URL && user?.uid && threadId) {
        await axios.patch(
          `${FIRESTORE_API_URL}/questionThreads/${threadId}`,
          {
            fields: {
              question: { stringValue: currentThread.question },
              answer: { stringValue: res.data.answer },
              createdAt: { stringValue: currentThread.createdAt },
              grade: { stringValue: currentThread.grade },
              subject: { stringValue: currentThread.subject || subject },
              uid: { stringValue: user.uid },
              thread: {
                arrayValue: {
                  values: ([...currentThread.thread, {
                    question: q,
                    answer: res.data.answer,
                    createdAt: new Date().toISOString(),
                    subject,
                  }]).map(t => ({
                    mapValue: {
                      fields: {
                        q: { stringValue: t.question },
                        a: { stringValue: t.answer },
                        createdAt: { stringValue: t.createdAt },
                        subject: { stringValue: t.subject || subject },
                      }
                    }
                  }))
                }
              },
            }
          },
          { headers: { 'Content-Type': 'application/json' } }
        );
        fetchHistory(user.uid);
      }
    } catch (err) {
      setError("AI回答の取得に失敗しました: " + (err?.message || ''));
      console.error('handleSubmit error', err);
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
      // OCRテキスト化
      const { data: { text } } = await Tesseract.recognize(file, 'jpn+eng');
      setQuestion(prev => (prev ? prev + '\n' : '') + text.trim());
      // base64化
      const reader = new FileReader();
      reader.onload = () => {
        setImageData(reader.result);
      };
      reader.readAsDataURL(file);
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
    setFollowupText("");
    const newFollow = {
      question: q,
      answer: '',
      createdAt: new Date().toISOString(),
      subject,
    };
    setCurrentThread(prev => ({
      ...prev,
      thread: [...prev.thread, newFollow],
    }));
    try {
      if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
      const prevThread = currentThread.thread || [];
      const lastN = 5;
      const threadForApiLimited = prevThread.slice(-lastN);
      const res = await axios.post(
        API_URL,
        { question: q, grade, uid: user?.uid, currentThread, imageData },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setAnswer(res.data.answer);
      setCurrentAnswerChunks([res.data.answer]);
      setCurrentChunkIndex(1);
      setCurrentThread(prev => {
        const updatedThread = [...prev.thread];
        if (updatedThread.length > 0 && updatedThread[updatedThread.length - 1].question === q) {
          updatedThread[updatedThread.length - 1].answer = res.data.answer;
        }
        return {
          ...prev,
          thread: updatedThread,
        };
      });
      setImageData(null);
      // Firestoreの既存ドキュメントをpatchで更新
      if (FIRESTORE_API_URL && user?.uid && threadId) {
        await axios.patch(
          `${FIRESTORE_API_URL}/questionThreads/${threadId}`,
          {
            fields: {
              question: { stringValue: currentThread.question },
              answer: { stringValue: res.data.answer },
              createdAt: { stringValue: currentThread.createdAt },
              grade: { stringValue: currentThread.grade },
              subject: { stringValue: currentThread.subject || subject },
              uid: { stringValue: user.uid },
              thread: {
                arrayValue: {
                  values: ([...currentThread.thread, {
                    question: q,
                    answer: res.data.answer,
                    createdAt: new Date().toISOString(),
                    subject,
                  }]).map(t => ({
                    mapValue: {
                      fields: {
                        q: { stringValue: t.question },
                        a: { stringValue: t.answer },
                        createdAt: { stringValue: t.createdAt },
                        subject: { stringValue: t.subject || subject },
                      }
                    }
                  }))
                }
              },
            }
          },
          { headers: { 'Content-Type': 'application/json' } }
        );
        fetchHistory(user.uid);
      }
    } catch (err) {
      setFollowupError("AIへの再質問に失敗しました: " + (err?.message || ''));
      console.error('handleFollowup error', err);
    } finally {
      setFollowupLoading(false);
    }
  };

  // チャット終了時にFirestoreへ保存し、履歴を更新
  const handleEndChat = async () => {
    setCurrentThread({ question: '', answer: '', thread: [], grade: '小学生', subject: '数学', createdAt: '' });
    setCurrentAnswerChunks([]); setFollowupList([]); setThreadId(null); setQuestion(""); setAnswer("");
    if (user?.uid) fetchHistory(user.uid);
  };

  const handleImageInputFollowup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFollowupLoading(true);
    setFollowupError("");
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'jpn+eng');
      setFollowupText(prev => (prev ? prev + '\n' : '') + text.trim());
      // base64化
      const reader = new FileReader();
      reader.onload = () => {
        setImageData(reader.result);
      };
      reader.readAsDataURL(file);
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

  // 履歴からチャットを継続する
  const handleContinueThread = (item) => {
    setCurrentThread({
      question: item.question,
      answer: item.answer,
      thread: item.thread || [],
      grade: item.grade || '小学生',
      createdAt: item.createdAt || new Date().toISOString(),
      subject: item.subject || '数学',
    });
    setCurrentAnswerChunks([]);
    setCurrentChunkIndex(0);
    setFollowupList([]);
    setThreadId(item.id); // ここでthreadIdをセット
    setQuestion("");
    setAnswer("");
    setError("");
  };

  // UI
  if (!user) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>AI家庭教師「まなび先生」</h1>
          <AuthForm
            authMode={authMode}
            setAuthMode={setAuthMode}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            handleAuth={handleAuth}
            authError={authError}
          />
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
            {/* --- 科目選択欄追加 --- */}
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
              <label style={{ fontWeight: 'bold', marginRight: 8 }}>科目:</label>
              <select value={subject} onChange={e => setSubject(e.target.value)} style={{ fontSize: 16, padding: 4 }}>
                <option value="数学">数学</option>
                <option value="英語">英語</option>
                <option value="理科">理科</option>
                <option value="社会">社会</option>
                <option value="国語">国語</option>
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
              <label htmlFor="imageInput" style={{ background: '#e0e7ff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                <span role="img" aria-label="カメラ" style={{ marginRight: 4 }}>📷</span><span style={{ fontWeight: 'bold' }}>画像から質問</span>
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
        {/* --- AI回答・追加質問UI --- */}
        {currentThread.question && (
          <ChatBox
            currentThread={currentThread}
            currentAnswerChunks={currentAnswerChunks}
            currentChunkIndex={currentChunkIndex}
            setCurrentChunkIndex={setCurrentChunkIndex}
            followupText={followupText}
            setFollowupText={setFollowupText}
            followupLoading={followupLoading}
            handleFollowup={handleFollowup}
            handleImageInputFollowup={handleImageInputFollowup}
            handleSpeechInputFollowup={handleSpeechInputFollowup}
            handleEndChat={handleEndChat}
            error={error}
            loading={loading}
            question={question}
            setQuestion={setQuestion}
            grade={grade}
            setGrade={setGrade}
            handleSubmit={handleSubmit}
            handleImageInput={handleImageInput}
            handleSpeechInput={handleSpeechInput}
            showPromptHelp={showPromptHelp}
            followupError={followupError}
            imageData={imageData}
            setImageData={setImageData}
          />
        )}
        {/* 履歴リスト */}
        <HistoryList
          history={history}
          expandedId={expandedId}
          handleHistoryClick={handleHistoryClick}
          handleContinueThread={handleContinueThread}
        />
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
