import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import 'katex/dist/katex.min.css';
import './App.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import AuthForm from './components/AuthForm';
import ChatBox from './components/ChatBox';
import HistoryList from './components/HistoryList';
import ContactForm from './components/ContactForm';
import ProfileView from './components/ProfileView';
import { sortHistory, saveUserProfile as saveUserProfileApi, fetchHistory as fetchHistoryApi, fetchUserProfile as fetchUserProfileApi } from './utils/api';
import { formatMathInput, getTimeBasedGreeting } from './utils/format';
import { handleImageInput, handleSpeechInput } from './utils/input';

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

// Cloud Functionsエミュレータ or 本番のURLを自動切り替え
export const CONTACT_API_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:5001/ai-app-96b95/us-central1/contact'
    : 'https://us-central1-ai-app-96b95.cloudfunctions.net/contact';

if (!FIRESTORE_API_URL) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_FIRESTORE_API_URL_LOCAL/PRODが未設定です。Firestore REST API呼び出しは失敗します。');
}
if (!API_URL) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_API_URL_LOCAL/PRODが未設定です。AI API呼び出しは失敗します。');
}

// パスワードバリデーション関数
const validatePassword = (pw) => {
  if (!pw || pw.length < 8) return "パスワードは8文字以上必要です。";
  if (!/[A-Z]/.test(pw)) return "大文字を1文字以上含めてください。";
  if (!/[a-z]/.test(pw)) return "小文字を1文字以上含めてください。";
  if (!/[0-9]/.test(pw)) return "数字を1文字以上含めてください。";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return "記号を1文字以上含めてください。";
  return null;
};

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(""); // 未使用
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [grade, setGrade] = useState("小学生"); // 学年選択用
  const [subject, setSubject] = useState("数学"); // 科目選択用
  const [expandedId, setExpandedId] = useState(null);
  const [currentAnswerChunks, setCurrentAnswerChunks] = useState([]); // 分割表示用
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);  const [user, setUser] = useState(null); // ログインユーザ情報
  const [email, setEmail] = useState("");  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState(""); // ニックネーム
  const [authMode, setAuthMode] = useState("login"); // "login" or "register"
  const [authError, setAuthError] = useState("");
  const [registerGrade, setRegisterGrade] = useState("小学生"); // 新規登録用学年const [rag_summary, setRag_summary] = useState(""); // RAG要約
  const [imageData, setImageData] = useState(null); // 画像データ保持
  const [scrollToFollowup, setScrollToFollowup] = useState(false);
  
  // 新しい状態管理
  const [currentView, setCurrentView] = useState("question"); // "question", "history", "contact", "profile"
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sortBy] = useState("subject"); // setSortBy未使用なので削除
  const [subjectFilter, setSubjectFilter] = useState("all"); // 科目フィルター
  const [userProfile, setUserProfile] = useState({ // ユーザープロファイル
    name: "",
    nickname: "", // ニックネーム追加
    weakSubjects: [],
    preferredGrade: "小学生"
  });
  const [imageLoading, setImageLoading] = useState(false);
  const [imageLoadedMsg, setImageLoadedMsg] = useState("");
  const [registerMsg, setRegisterMsg] = useState(""); // 新規登録メッセージ用ステート
  // reCAPTCHA認証用状態
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaError, setCaptchaError] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  // 新規追加: 曖昧な質問時の誘導表示
  const [showPromptHelp] = useState(false); // setShowPromptHelp未使用なので削除
  const [followupList, setFollowupList] = useState([]);
  
  // スレッド管理
  const [threadId, setThreadId] = useState(null); // スレッドID（親質問ID）
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState("");
  const [followupImageData, setFollowupImageData] = useState(null);
  const [followupImageLoading, setFollowupImageLoading] = useState(false);
  const [followupImageLoadedMsg, setFollowupImageLoadedMsg] = useState("");

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
  const handleAuth = async (e) => {    e.preventDefault();
    setAuthError("");
    setRegisterMsg("");
    setCaptchaError("");
    // パスワードバリデーション
    if (authMode === "register" || authMode === "login") {
      const pwErr = validatePassword(password);
      if (pwErr) {
        setAuthError(pwErr);
        return;
      }
    }
    try {
      if (authMode === "login") {
        const res = await firebase.auth().signInWithEmailAndPassword(email, password);
        // reCAPTCHA認証が必要かチェック
        if (res.user && !res.user.emailVerified) {
          setCaptchaRequired(true);
          setUser(res.user); // 一時的にセット
          return;
        }
        setUser(res.user);
      } else {
        const res = await firebase.auth().createUserWithEmailAndPassword(email, password);
          // 新規登録時にプロファイルを保存（デフォルト学年設定）
        const profileData = {
          name: "",
          nickname: nickname.trim(),
          weakSubjects: [],
          preferredGrade: registerGrade // 選択した学年を使用
        };
        // Firestoreにプロファイルを保存
        try {
          await saveUserProfile(profileData, res.user.uid);
          setGrade(registerGrade); // 現在の学年設定も更新
        } catch (profileError) {
          console.error('プロファイル保存エラー:', profileError);
        }
        
        setRegisterMsg("新規登録しました！ログインしてね！"); // 新規登録時にメッセージ表示
        setNickname(""); // ニックネームをクリア
        setRegisterGrade("小学生"); // 学年もリセット
        // 新規登録後は自動ログインしないのでsetUserは呼ばない
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  // MFA: 電話番号認証開始  const recaptchaVerifierRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);
    // reCAPTCHA認証処理（タイムアウト対策強化）
  const startCaptchaVerification = async () => {
    setCaptchaError("");
    setCaptchaLoading(true);
    
    // DOM要素の存在確認（少し待ってから再確認）
    const checkContainer = () => {
      return new Promise((resolve) => {
        const container = document.getElementById('recaptcha-container');
        if (container) {
          resolve(true);
        } else {
          setTimeout(() => {
            resolve(!!document.getElementById('recaptcha-container'));
          }, 100);
        }
      });
    };
    
    const containerExists = await checkContainer();
    if (!containerExists) {
      setCaptchaError('reCAPTCHAの初期化に失敗しました。ページを再読み込みしてください。');
      setCaptchaLoading(false);
      return;
    }
    
    try {
      // 既存インスタンスがあればクリア
      if (recaptchaVerifierRef.current) {
        try { 
          recaptchaVerifierRef.current.clear(); 
        } catch (e) {
          console.warn('reCAPTCHA clear error:', e);
        }
        recaptchaVerifierRef.current = null;
      }
      
      // タイムアウト設定付きでreCAPTCHA初期化
      const initRecaptcha = () => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('reCAPTCHA初期化がタイムアウトしました'));
          }, 10000); // 10秒でタイムアウト
          
          try {            recaptchaVerifierRef.current = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
              size: 'normal',
              callback: (response) => {
                clearTimeout(timeout);
                // 認証成功時の処理を安全に実行
                setTimeout(() => {
                  try {
                    setCaptchaRequired(false);
                    setCaptchaLoading(false);
                    // 認証後にreCAPTCHAをクリア
                    if (recaptchaVerifierRef.current) {
                      try { recaptchaVerifierRef.current.clear(); } catch (e) {}
                      recaptchaVerifierRef.current = null;
                    }
                    resolve(response);
                  } catch (e) {
                    console.error('reCAPTCHA callback error:', e);
                    resolve(response); // エラーでも成功として扱う
                  }
                }, 100); // 少し遅延して実行
              },
              'error-callback': (error) => {
                clearTimeout(timeout);
                reject(error);
              }
            });
            
            recaptchaVerifierRef.current.render().then(() => {
              clearTimeout(timeout);
              resolve('rendered');
            }).catch((error) => {
              clearTimeout(timeout);
              reject(error);
            });
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
      };
      
      await initRecaptcha();
      
    } catch (err) {
      setCaptchaError('reCAPTCHA認証エラー: ' + (err.message || ''));
      setCaptchaLoading(false);
      // エラー時もクリーンアップ
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch (e) {}
        recaptchaVerifierRef.current = null;
      }
    }
  };

  // Firebase認証の永続化設定（3日間）
  useEffect(() => {
    if (firebase.auth().currentUser) return;
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    // セッションの有効期限を3日間に設定
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        user.getIdTokenResult().then(idTokenResult => {
          const expiresIn = 3 * 24 * 60 * 60 * 1000; // 3日
          window.localStorage.setItem('firebaseSessionExpires', Date.now() + expiresIn);
        });
      }
    });
  }, []);  // ログアウト処理
  const handleLogout = async () => {
    await firebase.auth().signOut();
    setUser(null);
    setEmail("");    setPassword("");
    setNickname(""); // ニックネームもクリア
    setRegisterGrade("小学生"); // 新規登録用学年もリセット
    setCurrentThread({ question: '', answer: '', thread: [], grade: '小学生', subject: '数学', createdAt: '' });
    setCurrentAnswerChunks([]);
    setFollowupList([]);
    setThreadId(null);
    setQuestion("");
    setAnswer("");
    setImageData(null);
    setImageLoadedMsg("");    setFollowupImageData && setFollowupImageData(null);
    // 履歴をクリア（ユーザー切り替え時の履歴混在を防止）
    setHistory([]);
    setUserProfile({ name: "", nickname: "", weakSubjects: [], preferredGrade: "小学生" });
  };

  // sortHistoryをuseCallbackで先に定義
  // const sortHistory = useCallback((historyArray) => {
  //   return historyArray.sort((a, b) => {
  //     const subjectComparison = a.subject.localeCompare(b.subject);
  //     if (subjectComparison !== 0) {
  //       return subjectComparison;
  //     }
  //     return b.createdAt > a.createdAt ? 1 : -1;
  //   });
  // }, []);

  // --- ユーザープロファイルを保存 ---
  // const saveUserProfile = useCallback(async (profile, uid = null) => {
  //   const targetUid = uid || user?.uid;
  //   if (!targetUid) return;
  //   try {
  //     const data = {
  //       fields: {
  //         name: { stringValue: profile.name || "" },
  //         nickname: { stringValue: profile.nickname || "" },
  //         weakSubjects: {
  //           arrayValue: {
  //             values: (profile.weakSubjects || []).map(s => ({ stringValue: s }))
  //           }
  //         },
  //         preferredGrade: { stringValue: profile.preferredGrade || "小学生" },
  //         updatedAt: { timestampValue: new Date().toISOString() }
  //       }
  //     };
  //     await axios.patch(`${FIRESTORE_API_URL}/userProfiles/${targetUid}`, data);
  //     setUserProfile(profile);
  //   } catch (e) {
  //     console.error('プロファイル保存エラー:', e);
  //   }
  // }, [user]);
  // --- Firestoreから履歴を取得（ユーザIDでフィルタリング） ---
  const fetchHistory = useCallback(async (uid) => {
    if (!uid) return;
    try {
      // Firestore REST APIでユーザIDでクエリフィルタリング
      const queryUrl = `${FIRESTORE_API_URL}/questionThreads:runQuery`;
      const query = {
        structuredQuery: {
          from: [{ collectionId: 'questionThreads' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'uid' },
              op: 'EQUAL',
              value: { stringValue: uid }
            }
          },
          orderBy: [
            {
              field: { fieldPath: 'subject' },
              direction: 'ASCENDING'
            },
            {
              field: { fieldPath: 'createdAt' },
              direction: 'DESCENDING'
            }
          ]
        }
      };
      
      const res = await axios.post(queryUrl, query, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (res.data && Array.isArray(res.data)) {
        const historyArr = res.data
          .filter(item => item.document) // documentが存在するもののみ
          .map(item => {
            const doc = item.document;
            const threadArr = doc.fields.thread?.arrayValue?.values || [];
            return {
              id: doc.name.split('/').pop(),
              question: doc.fields.question?.stringValue || '',
              answer: doc.fields.answer?.stringValue || '',
              createdAt: doc.fields.createdAt?.stringValue || doc.fields.createdAt?.timestampValue || '',
              grade: doc.fields.grade?.stringValue || '',
              subject: doc.fields.subject?.stringValue || '数学',
              uid: doc.fields.uid?.stringValue || '',
              thread: threadArr.map(t => ({
                question: t.mapValue.fields.q.stringValue,
                answer: t.mapValue.fields.a.stringValue,
                createdAt: t.mapValue.fields.createdAt.stringValue
              }))
            };
          })
          .filter(item => item.question && item.answer); // 有効なデータのみ
        
        setHistory(historyArr);
      } else {
        setHistory([]);
      }
    } catch (e) { 
      console.error('履歴取得エラー:', e);
      // フォールバック: 従来の方法でも試行
      try {
        const res = await axios.get(`${FIRESTORE_API_URL}/questionThreads`);
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
                subject: doc.fields.subject?.stringValue || '数学',
                uid: doc.fields.uid?.stringValue || '',
                thread: threadArr.map(t => ({
                  question: t.mapValue.fields.q.stringValue,
                  answer: t.mapValue.fields.a.stringValue,
                  createdAt: t.mapValue.fields.createdAt.stringValue
                }))
              };
            })
            .filter(item => item.uid === uid && item.question && item.answer);
          const sortedHistory = sortHistory(historyArr);
          setHistory(sortedHistory);
        } else {
          setHistory([]);
        }
      } catch (fallbackError) {
        setHistory([]); 
      }
    }
  }, [setHistory]);

  // --- ユーザープロファイルを取得 ---
  // const fetchUserProfile = useCallback(async (uid) => {
  //   if (!uid) return;
  //   try {
  //     const res = await axios.get(`${FIRESTORE_API_URL}/userProfiles/${uid}`);
  //     if (res.data.fields) {
  //       const profile = {
  //         name: res.data.fields.name?.stringValue || "",
  //         nickname: res.data.fields.nickname?.stringValue || "",
  //         weakSubjects: res.data.fields.weakSubjects?.arrayValue?.values?.map(v => v.stringValue) || [],
  //         preferredGrade: res.data.fields.preferredGrade?.stringValue || "小学生"
  //       };
  //       setUserProfile(profile);
  //       setGrade(profile.preferredGrade); // 学年を設定
  //     }
  //   } catch (e) {
  //     // プロファイルが存在しない場合は初期値で作成
  //     console.log('ユーザープロファイルが見つかりません。初期値で作成します。');
  //     const defaultProfile = {
  //       name: "",
  //       nickname: "",
  //       weakSubjects: [],
  //       preferredGrade: "小学生"
  //     };
  //     try {
  //       await saveUserProfile(defaultProfile, uid);
  //       setGrade(defaultProfile.preferredGrade);
  //     } catch (createError) {
  //       console.error('初期プロファイル作成エラー:', createError);
  //     }
  //   }  }, [saveUserProfile]);
  // ソート条件が変わった時に履歴を再ソート
  useEffect(() => {
    if (history.length > 0) {
      const sortedHistory = sortHistory([...history]);
      setHistory(sortedHistory);
    }
  }, [sortBy, history]);

  useEffect(() => {
    if (!user) return;
    fetchHistory(user.uid);
    fetchUserProfileApi(user.uid, FIRESTORE_API_URL, setUserProfile, setGrade, saveUserProfileApi);
  }, [user, fetchHistory, fetchUserProfileApi, setUserProfile, setGrade, saveUserProfileApi]);

  // 進行中チャット（1スレッド分）をローカルで管理
  const [currentThread, setCurrentThread] = useState({
    question: '',
    answer: '',
    thread: [],
    grade: '小学生',
    createdAt: '',
  });

  // 数式を自動で$...$や$$...$$で囲む（[ ... ]→$$...$$変換も対応）
  // function formatMathInput(input) {
  //   if (!input) return input;
  //   // すでに$...$や$$...$$で囲まれている場合はそのまま
  //   // → 1行全体が$...$または$$...$$で囲まれている場合のみスキップ
  //   if (/^\s*\${1,2}[\s\S]*\${1,2}\s*$/.test(input.trim())) return input;
  //   // [ ... ] で囲まれた行を $$...$$ に変換（複数行対応）
  //   let replaced = input.replace(/\n?\[([\s\S]*?)\]\n?/g, (match, p1) => `\n$$\n${p1.trim()}\n$$\n`);
  //   // 数式らしいパターン（英数字・記号のみ、=や^や√や分数など）を$...$で囲む
  //   const mathLike = /^[\s\d\w^+\-*/=\\()[\],.√π]+$/;
  //   replaced = replaced.split('\n').map(line => {
  //     // 1行全体が$...$や$$...$$で囲まれている場合はそのまま
  //     if (/^\s*\${1,2}[\s\S]*\${1,2}\s*$/.test(line.trim())) return line;
  //     // 行中に$が2つ以上含まれる場合（既に数式が混在している場合）はそのまま
  //     if ((line.match(/\$/g) || []).length >= 2) return line;
  //     return mathLike.test(line.trim()) ? `$${line.trim()}$` : line;
  //   }).join('\n');
  //   return replaced;
  // }

  // handleSubmit: 最初の質問時のみ新規履歴を作成し、以降はpatchで更新
  const handleSubmit = async (e, suggestText) => {
    e && e.preventDefault();
    setImageLoadedMsg("");
    if (!question.trim() && !imageData) return;
    setLoading(true);
    setError("");
    setAnswer("");
    setCurrentAnswerChunks([]);
    setCurrentChunkIndex(0);
    setFollowupList([]);
    // --- ここで数式整形 ---
    const q = formatMathInput(suggestText || question);    // --- 科目ごと・学年ごとにプロンプト最適化（段階的回答・粒度調整・口調変化） ---
    const getPersonalizedPrompt = () => {
      // 学年に応じた基本的な口調と粒度設定
      let gradeStyle = "";
      let stepDetail = "";
      
      switch(grade) {
        case "小学生":
          gradeStyle = "とても優しく、分かりやすい言葉で説明してね。難しい言葉は使わないでください。";
          stepDetail = "一つ一つの手順をゆっくり、詳しく説明してください。";
          break;
        case "中学生":
          gradeStyle = "丁寧で親しみやすい口調で説明してください。時々励ましの言葉も入れてくださいね。";
          stepDetail = "重要なポイントを段階的に、理由も含めて説明してください。";
          break;
        case "高校生":
          gradeStyle = "しっかりとした説明をしつつ、親近感のある口調で話してください。";
          stepDetail = "論理的な流れを重視して、各段階の根拠を明確に示してください。";
          break;
        default:
          gradeStyle = "適切なレベルで丁寧に説明してください。";
          stepDetail = "段階的に分かりやすく説明してください。";
      }      // ユーザー名があれば個人的な挨拶を追加
      const personalGreeting = userProfile.nickname ? 
        `こんにちは、${userProfile.nickname}さん！` : 
        userProfile.name ?
          `こんにちは、${userProfile.name}さん！` : "こんにちは！";

      // 苦手分野への配慮
      const weakSubjectCare = userProfile.weakSubjects.includes(subject) ?
        `${subject}は苦手分野のようですね。特に丁寧に説明しますので、分からないことがあったら遠慮なく聞いてくださいね。` : "";

      // 科目別の専門的なガイダンス
      let subjectGuidance = "";
      switch(subject) {
        case "数学":
          subjectGuidance = `数式や計算は必ずLaTeX形式で記述し、$$で囲んでください。途中式も段階的に示し、なぜその計算をするのかも説明してください。`;
          break;
        case "英語":
          subjectGuidance = "英文法のルールを説明する時は、例文を多用し、なぜそのルールになるのかも教えてください。";
          break;
        case "理科":
          subjectGuidance = "現象や概念を説明する時は、身近な例を挙げて、原理から応用まで段階的に教えてください。";
          break;
        case "社会":
          subjectGuidance = "歴史や地理の内容は、背景→出来事→影響の流れで段階的に説明し、覚えやすい関連付けも教えてください。";
          break;
        case "国語":
          subjectGuidance = "文章読解のコツや文法は、具体例を示しながら、段階的に理解を深められるよう説明してください。";
          break;
        default:
          subjectGuidance = "";
      }

      return `${personalGreeting}あなたは親切で経験豊富な${subject}の家庭教師です。

【指導方針】
1. 段階的な説明：答えを最初から全て示さず、まず概要やヒントから始めて、学習者のペースに合わせて徐々に詳しく説明する
2. 理解度確認：各段階で「ここまで理解できましたか？」などの確認を入れる
3. 個別対応：${gradeStyle}
4. 詳細度調整：${stepDetail}

${weakSubjectCare}

【具体的な指導内容】
${subjectGuidance}

【回答の構成例】
1. まず問題の概要と解き方の方針を簡潔に説明
2. 必要な基礎知識があるか確認
3. 段階的に解法を説明（一度に全て説明せず、重要なポイントごとに区切る）
4. 各段階で理解を確認する質問を投げかける
5. 最後に全体のまとめと類似問題への応用方法を示す

学習者が「続きを教えて」「もっと詳しく」などと言った時に、次の段階に進んでください。`;
    };

    let subjectPrompt = getPersonalizedPrompt();
    // --- 他科目履歴が存在する場合は科目切り替えを促す ---
    const prevSubjects = (currentThread.thread || []).map(t => t.subject).filter(s => s && s !== subject);
    if (prevSubjects.length > 0) {
      setError(`このスレッドには他の科目（${[...new Set(prevSubjects)].join(', ')}）の質問が含まれています。科目を「${subject}」に切り替えて新しいスレッドで質問してください。`);
      setLoading(false);
      return;
    }
    // 新規スレッド開始
    if (!currentThread.question) {
      // --- ここで全てのスレッド状態をリセット ---
      setCurrentThread({ question: '', answer: '', thread: [], grade: '小学生', subject: '数学', createdAt: '' });
      setCurrentAnswerChunks([]);
      setCurrentChunkIndex(0);
      setFollowupList([]);
      setThreadId(null);
      setAnswer("");
      setImageData(null);
      setImageLoadedMsg("");
      setFollowupImageData && setFollowupImageData(null);
      // --- 新しいスレッドを開始 ---
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
          // FirestoreのドキュメントIDをthreadIdに保存（新規スレッド用に必ず新しいIDをセット）
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
    }));    try {
      if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
      // const prevThread = (currentThread.thread || []).filter(t => t.subject === subject); // 未使用
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
      setImageData(null); // 送信後のみクリア
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

  const handleImageInputWrapper = (e) => {
    handleImageInput(e, setImageData, setLoading, setImageLoading, setImageLoadedMsg, setError);
  };

  const handleSpeechInputWrapper = () => {
    handleSpeechInput(setQuestion, setError);
  };

  const handleImageInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setImageLoading(true); // 画像読み込み中
    setImageLoadedMsg("");
    setError("");
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setImageData(reader.result);
        setImageLoading(false);
        setImageLoadedMsg("画像を読み込みました");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("画像の読み込みに失敗しました");
      setImageLoading(false);
      setImageLoadedMsg("");
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
  const [followupText, setFollowupText] = useState("");

  // AI返答への自由入力送信
  const handleFollowup = async (e) => {
    e.preventDefault();
    setImageLoadedMsg(""); // 追加: 追加質問時に画像読み込みメッセージをクリア
    if (!followupText.trim() && !followupImageData) return;
    setFollowupLoading(true);
    setFollowupError("");
    // --- ここで数式整形 ---
    const q = formatMathInput(followupText);
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
    }));    try {
      if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
      // const prevThread = currentThread.thread || []; // 未使用
      const res = await axios.post(
        API_URL,
        { question: q, grade, uid: user?.uid, currentThread, imageData: followupImageData },
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
      setFollowupImageData(null); // 送信後のみクリア
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

  const handleImageInputFollowup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFollowupLoading(true);
    setImageLoading(true);
    setImageLoadedMsg("");
    setFollowupError("");
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setFollowupImageData(reader.result);
        setImageLoading(false);
        setImageLoadedMsg("画像を読み込みました");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setFollowupError("画像の読み込みに失敗しました");
      setImageLoading(false);
      setImageLoadedMsg("");
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

  // チャット終了時にFirestoreへ保存し、履歴を更新
  const handleEndChat = async () => {
    setCurrentThread({ question: '', answer: '', thread: [], grade: '小学生', subject: '数学', createdAt: '' });
    setCurrentAnswerChunks([]);
    setFollowupList([]);
    setThreadId(null);
    setQuestion("");
    setAnswer("");
    setImageData(null); // 画像データもクリア
    setImageLoadedMsg(""); // 画像読み込みメッセージもクリア
    setFollowupImageData && setFollowupImageData(null); // 追加質問用画像もクリア
    if (user?.uid) fetchHistory(user.uid);
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
      // 質問メニューに切り替えてスクロール要求
    setCurrentView('question');
    setScrollToFollowup(true); // 追加: followupフォームへスクロール要求
  };

  // fetchHistory, saveUserProfileのラッパーを定義
  // const fetchHistory = (uid) => fetchHistoryApi(uid, FIRESTORE_API_URL, setHistory, sortHistory);
  const saveUserProfile = (profile, uid) => saveUserProfileApi(profile, uid, FIRESTORE_API_URL, setUserProfile, setGrade);
  // UI
  if (captchaRequired) {
    return (
      <div className="App">
        <header className="App-header">
          <h2>reCAPTCHA認証</h2>
          <div style={{ maxWidth: 360, margin: '0 auto', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px #bfcfff' }}>
            <p style={{ color: '#333', marginBottom: 20 }}>ロボットでないことを確認してください</p>
            <div id="recaptcha-container"></div>
            <button 
              onClick={startCaptchaVerification} 
              disabled={captchaLoading} 
              style={{ width: '100%', marginTop: 12, padding: 12, fontSize: 16 }}
            >
              {captchaLoading ? '認証中...' : 'reCAPTCHA認証を開始'}
            </button>
            {captchaError && <div style={{ color: 'red', marginTop: 10 }}>{captchaError}</div>}
          </div>
        </header>
      </div>
    );
  }

  // UI
  if (!user) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>AI家庭教師「まなび先生」</h1>
          {/* 新規登録メッセージ表示 */}
          {registerMsg && (
            <div className="register-message">{registerMsg}</div>
          )}
          <AuthForm
            authMode={authMode}
            setAuthMode={setAuthMode}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            nickname={nickname}
            setNickname={setNickname}
            grade={registerGrade}
            setGrade={setRegisterGrade}
            handleAuth={handleAuth}
            authError={authError}
          />
        </header>
      </div>
    );
  }  return (
    <div className="App">
      <header className="App-header">
        {/* 上部のメニューバー */}
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 16 }}>
          {/* 左側のプルダウンメニュー */}
          <div style={{ position: 'relative' }}>            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="main-menu-button"
            >
              ☰ メニュー
            </button>
            {dropdownOpen && (              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
                zIndex: 1000,
                minWidth: 180,
                marginTop: 4
              }}><button 
                  onClick={() => { setCurrentView('question'); setDropdownOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: currentView === 'question' ? '#e0e7ff' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    color: currentView === 'question' ? '#4f46e5' : '#374151'
                  }}
                >
                  📝 質問メニュー
                </button>
                <button 
                  onClick={() => { setCurrentView('history'); setDropdownOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: currentView === 'history' ? '#e0e7ff' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    color: currentView === 'history' ? '#4f46e5' : '#374151'
                  }}
                >
                  📚 履歴
                </button>                <button 
                  onClick={() => { setCurrentView('contact'); setDropdownOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: currentView === 'contact' ? '#e0e7ff' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    color: currentView === 'contact' ? '#4f46e5' : '#374151'
                  }}
                >
                  📧 お問い合わせ
                </button>
                <button 
                  onClick={() => { setCurrentView('profile'); setDropdownOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: currentView === 'profile' ? '#e0e7ff' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    color: currentView === 'profile' ? '#4f46e5' : '#374151'
                  }}
                >
                  👤 プロフィール
                </button>
              </div>
            )}
          </div>

          {/* ログアウトボタン（メニューボタンの右側） */}
          <button 
            onClick={handleLogout} 
            style={{ 
              background: '#e0e7ff', 
              color: '#222', 
              fontWeight: 'bold', 
              borderRadius: 6, 
              border: 'none', 
              padding: '8px 18px', 
              fontSize: 15, 
              cursor: 'pointer',
              marginLeft: 12
            }}
          >
            ログアウト
          </button>
        </div>        {/* タイトル（メニューバーの下） */}
        <div style={{ width: '100%', textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>
            AI家庭教師「まなび先生」            <div style={{ fontSize: '0.6em', fontWeight: 'normal', color: '#666', marginTop: 4 }}>
              {userProfile.nickname ? 
                `${getTimeBasedGreeting()}、${userProfile.nickname}さん！` : 
                userProfile.name ?
                  `${getTimeBasedGreeting()}、${userProfile.name}さん！` :
                  `${getTimeBasedGreeting()}！`
              }
            </div>
          </h1>
        </div>

        {/* 現在のビューに応じた内容を表示 */}
        {currentView === 'question' && (
          <div className="form-center-wrap">
            {/* 質問フォーム */}            <form onSubmit={handleSubmit} className="form-center" style={{ width: '100%' }}>
              <div style={{ marginBottom: 8, textAlign: 'left', color: '#888', fontSize: 14 }}>
                効果的な質問例:「この問題の考え方を教えて」「途中式を説明して」「どこが分からないか具体的に教えて」など。
              </div>
              {/* --- 科目選択欄 --- */}
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
              {/* 質問フォーム */}
              <div className="question-textarea-wrapper" style={{ position: 'relative' }}>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="質問を入力してください（例：この数学の問題の考え方を教えて）"
                  rows={3}
                  style={{ width: '100%', paddingRight: imageData ? 36 : undefined }}
                  required
                />
                {/* 画像が読み込み済みなら右下にカメラアイコン */}
                {imageData && !imageLoading && (
                  <span className="camera-icon-attached" title="画像が添付されています">📷</span>
                )}
              </div>
              {imageLoading && (
                <div className="image-loading-msg">画像を読み込んでいます...</div>
              )}
              {imageLoadedMsg && !imageLoading && (
                <div className="image-loaded-msg">{imageLoadedMsg}</div>
              )}
              {showPromptHelp && (
                <div style={{ color: '#e67e22', margin: '8px 0', fontSize: 15, textAlign: 'left' }}>
                  効果的な質問をするには「どの教科・単元か」「どこが分からないか」「どんな答えが欲しいか」を具体的に書くと良いです。
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
                <label htmlFor="imageInput" style={{ background: '#e0e7ff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  <span role="img" aria-label="カメラ" style={{ marginRight: 4 }}>📷</span><span style={{ fontWeight: 'bold' }}>画像から質問</span>
                  <input id="imageInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageInputWrapper} />
                </label>
                <button type="button" onClick={handleSpeechInputWrapper} style={{ background: '#e0e7ff', color: '#222', fontSize: 14, padding: '4px 10px', fontWeight: 'bold' }}>
                  <span role="img" aria-label="マイク" style={{ marginRight: 4 }}>🎤</span>音声で質問
                </button>
              </div>
              <button type="submit" disabled={loading || !question} style={{ marginTop: 8, width: 180, alignSelf: 'center' }}>
                {loading ? 'AIが考え中...' : '質問する'}
              </button>            </form>
            
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
                scrollToFollowup={scrollToFollowup}
                resetScrollToFollowup={() => setScrollToFollowup(false)}
                imageLoading={imageLoading}
                imageLoadedMsg={imageLoadedMsg}
                followupImageData={followupImageData}
                setFollowupImageData={setFollowupImageData}
              />
            )}
          </div>
        )}        {/* 履歴ビュー */}
        {currentView === 'history' && (
          <div>
            {/* 科目フィルター */}
            <div style={{ marginBottom: 20, display: 'flex', gap: 15, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontWeight: 'bold', color: '#374151' }}>科目で絞り込み:</label>
                <select 
                  value={subjectFilter} 
                  onChange={e => setSubjectFilter(e.target.value)}
                  style={{ 
                    fontSize: 14, 
                    padding: '6px 12px', 
                    borderRadius: 6, 
                    border: '1px solid #d1d5db',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">すべての科目</option>
                  <option value="数学">数学</option>
                  <option value="英語">英語</option>
                  <option value="理科">理科</option>
                  <option value="社会">社会</option>
                  <option value="国語">国語</option>
                </select>
              </div>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {subjectFilter === 'all' ? '全科目を表示中' : `${subjectFilter}の履歴のみ表示中`}
              </span>            </div>
            
            {(() => {
              const filteredHistory = subjectFilter === 'all' ? history : history.filter(item => item.subject === subjectFilter);
              return filteredHistory.length > 0 ? (
                <HistoryList
                  history={filteredHistory}
                  expandedId={expandedId}
                  handleHistoryClick={handleHistoryClick}
                  handleContinueThread={handleContinueThread}
                />
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px 20px', 
                  color: '#6b7280',
                  fontSize: 16
                }}>
                  {subjectFilter === 'all' ? 
                    '履歴がありません。質問をして履歴を作成しましょう！' : 
                    `${subjectFilter}の履歴がありません。`
                  }
                </div>
              );
            })()}
          </div>
        )}        {/* お問い合わせビュー */}
        {currentView === 'contact' && (
          <ContactForm onClose={() => setCurrentView('question')} user={user} />
        )}        {/* プロフィールビュー */}
        {currentView === 'profile' && (
          <ProfileView
            user={user}
            userProfile={userProfile}
            setCurrentView={setCurrentView}
            saveUserProfile={saveUserProfile}
            setGrade={setGrade}
          />
        )}
      </header>
    </div>
  );
}

export default App;
