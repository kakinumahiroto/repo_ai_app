
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import 'katex/dist/katex.min.css';
import './App.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/functions';
import AuthForm from './components/AuthForm';
import ChatBox from './components/ChatBox';
import HistoryList from './components/HistoryList';
import ContactForm from './components/ContactForm';
import ProfileView from './components/ProfileView';
import AdminUsageManager from './components/AdminUsageManager';
import { sortHistory, saveUserProfile as saveUserProfileApi, fetchHistory as fetchHistoryApi, fetchUserProfile as fetchUserProfileApi, CONTACT_API_URL } from './utils/api';
import { formatMathInput, getTimeBasedGreeting } from './utils/format';
import { fetchUserUsage, incrementUserUsage, checkUsageLimit, createUserUsage } from './utils/usage';
import { sendMfaCode, verifyMfaCode } from './utils/mfa';
import MfaVerification from './components/MfaVerification';

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

// reCAPTCHAサイトキーの自動切り替え
const RECAPTCHA_SITE_KEY = (() => {
  const localKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY_LOCAL;
  const prodKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY_PROD;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return localKey || prodKey;
  }
  return prodKey || localKey;
})();

// Cloud Functionsエミュレータ or 本番のURLを自動切り替え

if (!FIRESTORE_API_URL) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_FIRESTORE_API_URL_LOCAL/PRODが未設定です。Firestore REST API呼び出しは失敗します。');
}
if (!API_URL) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_API_URL_LOCAL/PRODが未設定です。AI API呼び出しは失敗します。');
}
if (!RECAPTCHA_SITE_KEY) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_RECAPTCHA_SITE_KEY_LOCAL/PRODが未設定です。reCAPTCHA機能は無効になります。');
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

// 管理者ユーザーのメールアドレス
const ADMIN_EMAIL = 'aiappself@gmail.com';

// セッションタイムアウトの設定（ミリ秒）- 1時間
const SESSION_TIMEOUT = 60 * 60 * 1000;

// セッション最大有効期限（24時間）- 共有デバイス対策
const MAX_SESSION_LIFETIME = 24 * 60 * 60 * 1000;

// 共有デバイス検出のしきい値（30分以内のセッションは警告表示）
const SHARED_DEVICE_WARNING_THRESHOLD = 30 * 60 * 1000;

function App() {
  // セッション復元・認証チェック用
  const [isAuthChecking, setIsAuthChecking] = useState(false);
  const [sessionUser, setSessionUser] = useState(null); // 復元されたユーザー
  const [lastActivityTime, setLastActivityTime] = useState(Date.now()); // 最後のアクティビティ時刻
  const [sessionCreatedTime, setSessionCreatedTime] = useState(null); // セッション作成時刻
  const [showSessionWarning, setShowSessionWarning] = useState(false); // セッション警告表示フラグ
  
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
  const [currentView, setCurrentView] = useState("question"); // "question", "history", "contact", "profile", "admin"
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
  const [registerMsg, setRegisterMsg] = useState(""); // 新規登録メッセージ用ステート  // reCAPTCHA認証用状態（v3用に簡素化）
  const [captchaError, setCaptchaError] = useState("");
  // 新規追加: 曖昧な質問時の誘導表示
  const [showPromptHelp] = useState(false); // setShowPromptHelp未使用なので削除
  const [followupList, setFollowupList] = useState([]);
  
  // スレッド管理
  const [threadId, setThreadId] = useState(null); // スレッドID（親質問ID）
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState("");
  const [followupImageData, setFollowupImageData] = useState(null);
  const [userUsage, setUserUsage] = useState({ currentUsage: 0, monthlyLimit: 0 }); // 残り質問回数

  // MFA状態管理
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [mfaCodeSent, setMfaCodeSent] = useState(false);

  // 機密操作用の追加認証状態
  const [sensitiveOperationPending, setSensitiveOperationPending] = useState(null);
  const [lastSensitiveAuthTime, setLastSensitiveAuthTime] = useState(0);
  
  // 機密操作の再認証間隔（5分）
  const SENSITIVE_OPERATION_TIMEOUT = 5 * 60 * 1000;

  // ファイル入力用のref
  const fileInputRef = useRef(null);

  // Firebase初期化とreCAPTCHA v3設定
  useEffect(() => {
    console.log('=== Firebase初期化開始 ===');
    console.log('既存のFirebaseアプリ数:', firebase.apps.length);
    
    if (!firebase.apps.length) {
      console.log('Firebase初期化実行中...');
      const config = {
        apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
        authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        projectId: 'ai-app-96b95',
      };
      console.log('Firebase config:', {
        ...config,
        apiKey: config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'undefined'
      });
      
      try {
        firebase.initializeApp(config);
        console.log('Firebase初期化成功');
        console.log('利用可能なFirebaseサービス:', Object.keys(firebase));
        console.log('firebase.functions:', firebase.functions);
        
        // Functions の初期化を確認
        if (firebase.functions) {
          console.log('Firebase Functions初期化成功');
          // エミュレータ設定の確認
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('ローカル環境検出 - Functionsエミュレータ設定確認');
            try {
              firebase.functions().useEmulator('localhost', 5001);
              console.log('Functionsエミュレータ設定完了');
            } catch (emulatorError) {
              console.warn('Functionsエミュレータ設定エラー:', emulatorError);
            }
          }
        } else {
          console.error('Firebase Functions が利用できません');
        }
      } catch (error) {
        console.error('Firebase初期化エラー:', error);
      }
    } else {
      console.log('Firebase既に初期化済み');
      console.log('現在のFirebaseアプリ:', firebase.apps[0].name);
      console.log('利用可能なFirebaseサービス:', Object.keys(firebase));
      console.log('firebase.functions:', firebase.functions);
    }
    
    // reCAPTCHA v3の動的読み込みと初期化
    const loadRecaptcha = async () => {
      if (!RECAPTCHA_SITE_KEY) {
        console.warn('reCAPTCHA site key is not configured. reCAPTCHA functionality will be disabled.');
        return;
      }

      // 既にreCAPTCHAスクリプトが読み込まれている場合はスキップ
      if (window.grecaptcha) {
        console.log('reCAPTCHA already loaded');
        return;
      }

      try {
        // reCAPTCHAスクリプトを動的に読み込み
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        script.async = true;
        script.defer = true;
        
        script.onload = () => {
          if (window.grecaptcha) {
            window.grecaptcha.ready(() => {
              console.log('reCAPTCHA v3 is ready with key:', RECAPTCHA_SITE_KEY.substring(0, 20) + '...');
            });
          }
        };
        
        script.onerror = () => {
          console.error('Failed to load reCAPTCHA script');
        };
        
        document.head.appendChild(script);
      } catch (error) {
        console.error('Error loading reCAPTCHA:', error);
      }
    };

    loadRecaptcha();
  }, []);  // メールアドレスでログイン/新規登録（v3対応）
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    setRegisterMsg("");
    setCaptchaError("");
    setMfaError("");
    setMfaRequired(false);
    setPendingUser(null);
    setMfaCodeSent(false);
    // パスワードバリデーション
    if (authMode === "register" || authMode === "login") {
      const pwErr = validatePassword(password);
      if (pwErr) {
        setAuthError(pwErr);
        return;
      }
    }
    // reCAPTCHA v3トークンの取得
    let recaptchaToken = null;
    if (RECAPTCHA_SITE_KEY) {
      try {
        if (window.grecaptcha) {
          recaptchaToken = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, {action: 'login'});
          console.log('reCAPTCHA token generated successfully');
        }
      } catch (recaptchaErr) {
        console.warn('reCAPTCHA v3 token generation failed:', recaptchaErr);
        setCaptchaError('認証処理でエラーが発生しました。再試行してください。');
      }
    } else {
      console.warn('reCAPTCHA site key is not configured. Skipping reCAPTCHA verification.');
    }
    try {
      if (authMode === "login") {
        console.log('=== ログイン処理開始 ===');
        console.log('Email:', email);
        console.log('Firebase auth object:', firebase.auth());
        
        const res = await firebase.auth().signInWithEmailAndPassword(email, password);
        console.log('ログイン成功:', res.user.email);
        
        // ログイン時は必ず認証メール送信＆MFA画面へ遷移
        setPendingUser(res.user);
        setMfaRequired(true);
        
        console.log('=== MFA認証コード送信開始 ===');
        console.log('ログイン後のユーザー状態:', {
          uid: res.user.uid,
          email: res.user.email,
          emailVerified: res.user.emailVerified
        });
        
        // Firebase Authの現在のユーザー状態を確認
        const currentUser = firebase.auth().currentUser;
        console.log('現在のFirebase Authユーザー:', currentUser ? currentUser.email : 'なし');
        
        // ユーザー状態が更新されるまで少し待機
        if (!currentUser || currentUser.uid !== res.user.uid) {
          console.log('ユーザー状態の更新を待機中...');
          await new Promise(resolve => setTimeout(resolve, 1500)); // 1秒から1.5秒に延長
          console.log('待機後の現在のユーザー:', firebase.auth().currentUser?.email);
        }
        
        // 追加：認証状態の確認を再実行
        const finalUser = firebase.auth().currentUser;
        if (!finalUser || finalUser.uid !== res.user.uid) {
          console.warn('認証状態が不安定です。MFA送信をスキップします。');
          setMfaError('認証状態が不安定です。再ログインしてください。');
          return;
        }
        
        try {
          // Firebase functions の初期化確認
          if (!firebase.functions) {
            throw new Error('firebase.functions が利用できません。Firebase SDK の初期化を確認してください。');
          }
          
          console.log('MFA認証コード送信実行中...', {
            userEmail: finalUser.email,
            userUid: finalUser.uid
          });
          
          // 修正: mfa.js の sendMfaCode 関数を直接呼び出し
          const result = await sendMfaCode(res.user.email);
          console.log('MFA認証コード送信成功 - 結果:', result);
          
          setMfaCodeSent(true);
        } catch (err) {
          console.error('=== MFA認証コード送信エラー詳細 ===');
          console.error('Error type:', err.constructor.name);
          console.error('Error message:', err.message);
          console.error('Error stack:', err.stack);
          console.error('Full error object:', err);
          setMfaError('認証コード送信に失敗しました: ' + (err.message || ''));
        }
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
          await saveUserProfileApi(profileData, res.user.uid, FIRESTORE_API_URL, setUserProfile, setGrade);
          setGrade(registerGrade); // 現在の学年設定も更新
        } catch (profileError) {
          console.error('プロファイル保存エラー:', profileError);
        }
        // 新規ユーザーのuserUsage初期化
        try {
          await createUserUsage(res.user.email, FIRESTORE_API_URL);
          console.log(`新規ユーザー ${res.user.email} のuserUsageを初期化しました`);
        } catch (usageError) {
          console.error('userUsage初期化エラー:', usageError);
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

  // MFA認証成功時の処理
  const handleMfaSuccess = async (rememberSession = false) => {
    if (sensitiveOperationPending) {
      // 機密操作のための再認証の場合
      setLastSensitiveAuthTime(Date.now());
      const operation = sensitiveOperationPending;
      setSensitiveOperationPending(null);
      setMfaRequired(false);
      setPendingUser(null);
      setMfaCode("");
      setMfaError("");
      setMfaCodeSent(false);
      
      // 保留中の機密操作を実行
      if (operation === 'admin') {
        setCurrentView('admin');
      } else if (operation === 'profile_save') {
        // プロファイル保存処理をここで実行
        // 必要に応じて実装
      }
    } else {
      // 通常のログイン/セッション復元の場合
      setUser(pendingUser);
      await loadUserUsage(pendingUser.email);
      
      // セッション持続期間の設定
      if (!rememberSession) {
        // 短期セッション（1時間で自動ログアウト）
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
      } else {
        // 長期セッション（ブラウザ閉じるまで持続）
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      }
      
      setMfaRequired(false);
      setPendingUser(null);
      setMfaCode("");
      setMfaError("");
      setMfaCodeSent(false);
      setShowSessionWarning(false);
    }
  };

  // 機密操作の実行前チェック
  const requireSensitiveAuth = async (operation) => {
    if (!user) return false;
    
    const timeSinceLastAuth = Date.now() - lastSensitiveAuthTime;
    if (timeSinceLastAuth < SENSITIVE_OPERATION_TIMEOUT) {
      // 最近認証済みの場合は直接実行
      return true;
    }

    // 再認証が必要
    console.log(`機密操作 ${operation} のため再認証を要求`);
    setSensitiveOperationPending(operation);
    setPendingUser(user);
    setMfaRequired(true);
    
    try {
      const result = await sendMfaCode(user.email);
      console.log('機密操作用MFA認証コード送信成功:', result);
      setMfaCodeSent(true);
      return false; // 認証待ち
    } catch (err) {
      console.error('機密操作用MFA認証コード送信エラー:', err);
      setMfaError('認証コード送信に失敗しました: ' + (err.message || ''));
      return false;
    }
  };
  useEffect(() => {
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      setIsAuthChecking(false);
      if (user) {
        // セッション作成時刻をチェック（新規または古いセッション検出）
        const storedSessionTime = localStorage.getItem(`sessionTime_${user.uid}`);
        const currentTime = Date.now();
        
        if (!storedSessionTime) {
          // 新規セッション
          setSessionCreatedTime(currentTime);
          localStorage.setItem(`sessionTime_${user.uid}`, currentTime.toString());
          setShowSessionWarning(false);
        } else {
          const sessionAge = currentTime - parseInt(storedSessionTime);
          setSessionCreatedTime(parseInt(storedSessionTime));
          
          // セッション有効期限チェック
          if (sessionAge > MAX_SESSION_LIFETIME) {
            console.log('セッションが期限切れです。自動ログアウトします。');
            firebase.auth().signOut();
            localStorage.removeItem(`sessionTime_${user.uid}`);
            return;
          }
          
          // 共有デバイス警告（最近のセッション）
          if (sessionAge < SHARED_DEVICE_WARNING_THRESHOLD) {
            setShowSessionWarning(true);
          }
        }
        
        setSessionUser(user); // 復元ユーザーを保持
        setLastActivityTime(Date.now()); // アクティビティタイムを更新
      } else {
        setSessionUser(null);
        setUser(null);
        setSessionCreatedTime(null);
        setShowSessionWarning(false);
        // ログアウト時はすべてのセッション時刻をクリア
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sessionTime_')) {
            localStorage.removeItem(key);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // セッションタイムアウトチェック（アクティビティ監視）
  useEffect(() => {
    const checkSessionTimeout = () => {
      if (sessionUser && (Date.now() - lastActivityTime) > SESSION_TIMEOUT) {
        console.log('セッションタイムアウトのため自動ログアウト');
        handleLogout();
      }
    };

    // 1分ごとにセッションタイムアウトをチェック
    const interval = setInterval(checkSessionTimeout, 60000);
    
    // ユーザーアクティビティ監視（マウス移動、クリック、キーボード入力）
    const updateActivity = () => {
      if (sessionUser || user) {
        setLastActivityTime(Date.now());
      }
    };

    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
    document.addEventListener('click', updateActivity);

    return () => {
      clearInterval(interval);
      document.removeEventListener('mousemove', updateActivity);
      document.removeEventListener('keypress', updateActivity);
      document.removeEventListener('click', updateActivity);
    };
  }, [sessionUser, user, lastActivityTime]);

  // セッション復元ボタン（セキュリティ強化版）
  const handleRestoreSession = async () => {
    if (sessionUser) {
      // セッションタイムアウトチェック
      if ((Date.now() - lastActivityTime) > SESSION_TIMEOUT) {
        console.log('セッションがタイムアウトしました');
        setMfaError('セッションがタイムアウトしました。再度ログインしてください。');
        await handleLogout();
        return;
      }

      // セキュリティ強化：セッション復元時もMFA認証を要求
      console.log('=== セッション復元時のMFA認証開始 ===');
      setPendingUser(sessionUser);
      setMfaRequired(true);
      
      try {
        console.log('セッション復元時のMFA認証コード送信中...', sessionUser.email);
        const result = await sendMfaCode(sessionUser.email);
        console.log('セッション復元時のMFA認証コード送信成功:', result);
        setMfaCodeSent(true);
      } catch (err) {
        console.error('セッション復元時のMFA認証コード送信エラー:', err);
        setMfaError('認証コード送信に失敗しました: ' + (err.message || ''));
      }
    }
  };
  const handleLogout = async () => {
    // ログアウト前にセッション時刻をクリア
    if (user) {
      localStorage.removeItem(`sessionTime_${user.uid}`);
    }
    
    await firebase.auth().signOut();
    setUser(null);
    setUserUsage({ currentUsage: 0, monthlyLimit: 0 });
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
    
    // セキュリティ強化：機密操作関連の状態もクリア
    setSensitiveOperationPending(null);
    setLastSensitiveAuthTime(0);
    setMfaRequired(false);
    setPendingUser(null);
    setMfaCodeSent(false);
    setMfaError("");
    
    // セッション関連の状態もクリア
    setSessionCreatedTime(null);
    setShowSessionWarning(false);
  };

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
  // ソート条件が変わった時に履歴を再ソート
  useEffect(() => {
    if (history.length > 0) {
      const sortedHistory = sortHistory([...history]);
      setHistory(sortedHistory);
    }
  }, [sortBy]); // historyを依存関係から除去して無限ループを防ぐ
  useEffect(() => {
    if (!user) return;
    fetchHistory(user.uid);
    fetchUserProfileApi(user.uid, FIRESTORE_API_URL, setUserProfile, setGrade, saveUserProfileApi);    loadUserUsage(user.email); // 追加: 初回取得
    // --- 追加: 利用回数情報を30秒ごとに自動更新 ---
    const interval = setInterval(() => {
      loadUserUsage(user.email);
    }, 30000); // 4秒から30秒に変更
    return () => clearInterval(interval);
  }, [user, fetchHistory]); // 必要最小限の依存関係のみ保持

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
    setImageLoadedMsg("");
    if (!question.trim() && !imageData) return;
    // --- 質問回数チェック ---
    if ((userUsage.monthlyLimit - userUsage.currentUsage) <= 0) {
      setError('質問可能回数がありません。管理者にご相談ください。');
      return;
    }
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
      setQuestion("");      try {
        if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
        // Firebase認証トークンを取得
        const token = await user.getIdToken();
        if (!token) {
          setError('認証が必要です。再ログインしてください。');
          setLoading(false);
          return;
        }

        // === デバッグログ追加 ===
        console.log('=== API呼び出し前のデバッグ情報 ===');
        console.log('User:', user ? { uid: user.uid, email: user.email } : 'null');
        console.log('API_URL:', API_URL);
        console.log('Token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'null');
        console.log('Request body:', {
          question: q ? q.substring(0, 50) + '...' : 'null',
          grade,
          subject,
          uid: user?.uid,
          hasImageData: !!imageData,
          hasCurrentThread: !!newThread
        });

        const res = await axios.post(
          API_URL,
          { question: q, grade, subject, uid: user?.uid, currentThread: newThread, subjectPrompt, imageData },
          { 
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            } 
          }
        );

        console.log('=== API呼び出し成功 ===');
        console.log('Response status:', res.status);
        console.log('Response data keys:', Object.keys(res.data));
        
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
        // --- 利用回数をインクリメント ---
        const usage = await incrementUserUsage(user.email, FIRESTORE_API_URL);
        setUserUsage(usage);
      } catch (err) {
        console.error('=== API呼び出しエラー ===');
        console.error('Error type:', err.constructor.name);
        console.error('Error message:', err.message);
        if (err.response) {
          console.error('Response status:', err.response.status);
          console.error('Response data:', err.response.data);
          console.error('Response headers:', err.response.headers);
        } else {
          console.error('Network error or request not sent');
        }
        console.error('Full error object:', err);
        
        setError("AI回答の取得に失敗しました: " + (err?.response?.data?.error || err?.message || ''));
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
      // Firebase認証トークンを取得
      const token = await user.getIdToken();
      if (!token) {
        setError('認証が必要です。再ログインしてください。');
        setLoading(false);
        return;
      }      // === 継続質問のデバッグログ ===
      console.log('=== 継続質問のAPI呼び出し前 ===');
      console.log('User UID:', user?.uid);
      console.log('Token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'null');
      console.log('Thread ID:', threadId);
      console.log('Current thread:', currentThread ? {
        question: currentThread.question?.substring(0, 50) + '...',
        answer: currentThread.answer ? 'present' : 'missing',
        threadLength: currentThread.thread?.length || 0
      } : 'null');

      const res = await axios.post(
        API_URL,
        { question: q, grade, subject, uid: user?.uid, currentThread, subjectPrompt, imageData },
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          } 
        }
      );

      console.log('=== 継続質問のAPI呼び出し成功 ===');
      console.log('Response status:', res.status);
      setAnswer(res.data.answer);
      setCurrentAnswerChunks([res.data.answer]);
      setCurrentChunkIndex(1);      setCurrentThread(prev => {
        const updatedThread = [...prev.thread];
        if (updatedThread.length > 0 && updatedThread[updatedThread.length - 1].question === q) {
          updatedThread[updatedThread.length - 1].answer = res.data.answer;
        }
        
        // Firestoreの既存ドキュメントをpatchで更新
        if (FIRESTORE_API_URL && user?.uid && threadId) {
          axios.patch(
            `${FIRESTORE_API_URL}/questionThreads/${threadId}`,
            {
              fields: {
                question: { stringValue: currentThread.question },
                answer: { stringValue: currentThread.answer },
                createdAt: { stringValue: currentThread.createdAt },
                grade: { stringValue: currentThread.grade },
                subject: { stringValue: currentThread.subject || subject },
                uid: { stringValue: user.uid },
                thread: {
                  arrayValue: {
                    values: updatedThread.map(t => ({
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
          ).then(() => {
            fetchHistory(user.uid);
          }).catch(patchErr => {
            console.error('Firestore patch error:', patchErr);
          });
        }
        
        return {
          ...prev,
          thread: updatedThread,
        };      });
      setImageData(null); // 送信後のみクリア
    } catch (error) {
      console.error('=== 継続質問エラー ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      console.error('Full error object:', error);
      
      setError("AI回答の取得に失敗しました: " + (error?.response?.data?.error || error?.message || ''));
      console.error('handleSubmit error', error);
    } finally {
      setLoading(false);
    }
  };

  // --- 追加: AI返答への自由入力欄 ---
  const [followupText, setFollowupText] = useState("");

  // AI返答への自由入力送信
  const handleFollowup = async (e) => {
    e.preventDefault();
    setImageLoadedMsg("");
    if (!followupText.trim() && !followupImageData) return;
    // --- 質問回数チェック ---
    if ((userUsage.monthlyLimit - userUsage.currentUsage) <= 0) {
      setFollowupError('質問可能回数がありません。管理者にご相談ください。');
      return;
    }
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
      
      // Firebase認証トークンを取得
      const token = await user.getIdToken();
      if (!token) {
        setFollowupError('認証が必要です。再ログインしてください。');
        setFollowupLoading(false);
        return;
      }

      // const prevThread = currentThread.thread || []; // 未使用
      const res = await axios.post(
        API_URL,
        { question: q, grade, uid: user?.uid, currentThread, imageData: followupImageData },
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          } 
        }
      );
      setAnswer(res.data.answer);
      setCurrentAnswerChunks([res.data.answer]);
      setCurrentChunkIndex(1);      setCurrentThread(prev => {
        const updatedThread = [...prev.thread];
        if (updatedThread.length > 0 && updatedThread[updatedThread.length - 1].question === q) {
          updatedThread[updatedThread.length - 1].answer = res.data.answer;
        }
        
        // Firestoreの既存ドキュメントをpatchで更新
        if (FIRESTORE_API_URL && user?.uid && threadId) {
          axios.patch(
            `${FIRESTORE_API_URL}/questionThreads/${threadId}`,
            {
              fields: {
                question: { stringValue: currentThread.question },
                answer: { stringValue: currentThread.answer },
                createdAt: { stringValue: currentThread.createdAt },
                grade: { stringValue: currentThread.grade },
                subject: { stringValue: currentThread.subject || subject },
                uid: { stringValue: user.uid },
                thread: {
                  arrayValue: {
                    values: updatedThread.map(t => ({
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
          ).then(() => {
            fetchHistory(user.uid);
          }).catch(patchErr => {
            console.error('Firestore patch error:', patchErr);
          });
        }
          return {
          ...prev,
          thread: updatedThread,
        };
      });
      
      // --- 追加質問でも質問回数をインクリメント ---
      try {
        const usage = await incrementUserUsage(user.email, FIRESTORE_API_URL);
        setUserUsage(usage);
      } catch (usageErr) {
        console.error('質問回数インクリメントエラー:', usageErr);
      }
      
      setFollowupImageData(null); // 送信後のみクリア
    } catch (err) {
      setFollowupError("AIへの再質問に失敗しました: " + (err?.message || ''));
      console.error('handleFollowup error', err);
    } finally {
      setFollowupLoading(false);
    }
  };

  const handleImageInputWrapper = (e) => {
    handleImageInput(e, setImageData, setLoading, setImageLoading, setImageLoadedMsg, setError);
  };

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
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
  // const [followupText, setFollowupText] = useState("");

  // // AI返答への自由入力送信
  // const handleFollowup = async (e) => {
  //   e.preventDefault();
  //   setImageLoadedMsg("");
  //   if (!followupText.trim() && !followupImageData) return;
  //   // --- 質問回数チェック ---
  //   if ((userUsage.monthlyLimit - userUsage.currentUsage) <= 0) {
  //     setFollowupError('質問可能回数がありません。管理者にご相談ください。');
  //     return;
  //   }
  //   setFollowupLoading(true);
  //   setFollowupError("");
  //   // --- ここで数式整形 ---
  //   const q = formatMathInput(followupText);
  //   setFollowupText("");
  //   const newFollow = {
  //     question: q,
  //     answer: '',
  //     createdAt: new Date().toISOString(),
  //     subject,
  //   };
  //   setCurrentThread(prev => ({
  //     ...prev,
  //     thread: [...prev.thread, newFollow],
  //   }));    try {
  //     if (!API_URL) throw new Error('AI APIエンドポイントが未設定です');
      
  //     // Firebase認証トークンを取得
  //     const token = await user.getIdToken();
  //     if (!token) {
  //       setFollowupError('認証が必要です。再ログインしてください。');
  //       setFollowupLoading(false);
  //       return;
  //     }

  //     // const prevThread = currentThread.thread || []; // 未使用
  //     const res = await axios.post(
  //       API_URL,
  //       { question: q, grade, uid: user?.uid, currentThread, imageData: followupImageData },
  //       { 
  //         headers: { 
  //           'Content-Type': 'application/json',
  //           'Authorization': `Bearer ${token}`
  //         } 
  //       }
  //     );
  //     setAnswer(res.data.answer);
  //     setCurrentAnswerChunks([res.data.answer]);
  //     setCurrentChunkIndex(1);      setCurrentThread(prev => {
  //       const updatedThread = [...prev.thread];
  //       if (updatedThread.length > 0 && updatedThread[updatedThread.length - 1].question === q) {
  //         updatedThread[updatedThread.length - 1].answer = res.data.answer;
  //       }
        
  //       // Firestoreの既存ドキュメントをpatchで更新
  //       if (FIRESTORE_API_URL && user?.uid && threadId) {
  //         axios.patch(
  //           `${FIRESTORE_API_URL}/questionThreads/${threadId}`,
  //           {
  //             fields: {
  //               question: { stringValue: currentThread.question },
  //               answer: { stringValue: currentThread.answer },
  //               createdAt: { stringValue: currentThread.createdAt },
  //               grade: { stringValue: currentThread.grade },
  //               subject: { stringValue: currentThread.subject || subject },
  //               uid: { stringValue: user.uid },
  //               thread: {
  //                 arrayValue: {
  //                   values: updatedThread.map(t => ({
  //                     mapValue: {
  //                       fields: {
  //                         q: { stringValue: t.question },
  //                         a: { stringValue: t.answer },
  //                         createdAt: { stringValue: t.createdAt },
  //                         subject: { stringValue: t.subject || subject },
  //                       }
  //                     }
  //                   }))
  //                 }
  //               },
  //             }
  //           },
  //           { headers: { 'Content-Type': 'application/json' } }
  //         ).then(() => {
  //           fetchHistory(user.uid);
  //         }).catch(patchErr => {
  //           console.error('Firestore patch error:', patchErr);
  //         });
  //       }
        
  //       return {
  //         ...prev,
  //         thread: updatedThread,
  //       };
  //     });
  //     setFollowupImageData(null); // 送信後のみクリア
  //   } catch (err) {
  //     setFollowupError("AIへの再質問に失敗しました: " + (err?.message || ''));
  //     console.error('handleFollowup error', err);
  //   } finally {
  //     setFollowupLoading(false);
  //   }
  // };

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
  const saveUserProfile = (profile) => {
    if (!user) return;
    return saveUserProfileApi(profile, user.uid, FIRESTORE_API_URL, setUserProfile, setGrade);
  };

  // Firebase認証トークンを取得する関数
  const getAuthToken = async () => {
    try {
      if (user) {
        return await user.getIdToken();
      }
      return null;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      setError('認証エラーが発生しました。再ログインしてください。');
      return null;
    }
  };

  // isAdmin: userのemailが管理者メールアドレスかどうか
  const isAdmin = useMemo(() => {
    return user && user.email === ADMIN_EMAIL;
  }, [user]);  // loadUserUsage: userのemailで利用回数情報を取得
  const loadUserUsage = useCallback(async (email) => {
    if (!email) return;
    try {
      console.log(`利用回数情報を取得中: ${email}`);
      const usage = await fetchUserUsage(email, FIRESTORE_API_URL);
      console.log(`利用回数情報取得成功:`, usage);
      setUserUsage(usage ?? { currentUsage: 0, monthlyLimit: 0 });
    } catch (err) {
      console.error('利用回数情報の取得に失敗:', err);
      // ユーザーデータが存在しない場合は初期化を試行
      try {
        console.log(`ユーザー ${email} のデータが存在しないため初期化を試行`);
        const initialUsage = await createUserUsage(email, FIRESTORE_API_URL);
        console.log(`初期化成功:`, initialUsage);
        setUserUsage(initialUsage);
      } catch (createError) {
        console.error('userUsage初期化も失敗:', createError);
        setUserUsage({ currentUsage: 0, monthlyLimit: 0 });
      }
    }
  }, []);

  // 管理者による操作後の即座更新コールバック
  const handleUserUsageUpdate = useCallback(async (targetUserEmail) => {
    // 現在のユーザーが管理操作の対象の場合のみ更新
    if (user && user.email === targetUserEmail) {
      await loadUserUsage(targetUserEmail);
    }
  }, [user, loadUserUsage]);

  // UI
  if (isAuthChecking) {
    return <div style={{ textAlign: 'center', marginTop: 80 }}>認証状態を確認中...</div>;
  }
  if (!user) {
    // MFA認証画面
    if (mfaRequired && pendingUser) {
      return (
        <div className="App">
          <header className="App-header">
            <MfaVerification
              email={pendingUser.email}
              onSuccess={handleMfaSuccess}
              onCancel={() => {
                setMfaRequired(false);
                setPendingUser(null);
                setMfaCodeSent(false);
                setMfaError("");
                setSensitiveOperationPending(null);
              }}
              mfaError={mfaError}
              setMfaError={setMfaError}
              mfaLoading={mfaLoading}
              setMfaLoading={setMfaLoading}
              mfaCodeSent={mfaCodeSent}
              setMfaCodeSent={setMfaCodeSent}
              isSensitiveOperation={!!sensitiveOperationPending}
              operationType={sensitiveOperationPending}
              sessionInfo={sessionCreatedTime ? {
                created: new Date(sessionCreatedTime).toLocaleString('ja-JP'),
                isRecent: showSessionWarning
              } : null}
            />
          </header>
        </div>
      );
    }
    // 通常ログイン画面＋セッション復元ボタン
    return (
      <div className="App">
        <header className="App-header">
          <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <img src="/ai-teacher-logo.png" alt="AI先生ロゴ" style={{ width: 48, height: 48 }} />
            AI家庭教師「SeLf」
          </h1>
          {/* 新規登録メッセージ表示 */}
          {registerMsg && (
            <div className="register-message">{registerMsg}</div>
          )}
          {/* reCAPTCHA v3エラー表示 */}
          {captchaError && (
            <div style={{ color: 'red', textAlign: 'center', margin: '10px 0' }}>
              {captchaError}
            </div>
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
          {/* セッション復元ボタン（セキュリティ強化版） */}
          {sessionUser && (
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              {/* 共有デバイス警告 */}
              {showSessionWarning && (
                <div style={{ 
                  background: '#fef3cd', 
                  border: '1px solid #faebcc', 
                  borderRadius: 6, 
                  padding: '12px', 
                  marginBottom: 16,
                  fontSize: 14,
                  color: '#856404'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>⚠️ セキュリティ警告</div>
                  <div style={{ fontSize: 12 }}>
                    最近のセッションが検出されました。<br/>
                    共有デバイスをご利用の場合は、必ずご自分のアカウントかご確認ください。
                  </div>
                </div>
              )}
              
              <p style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                前回のセッションが残っています
              </p>
              
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                <button 
                  onClick={handleRestoreSession} 
                  style={{ 
                    background: '#e0e7ff', 
                    color: '#222', 
                    fontWeight: 'bold', 
                    borderRadius: 6, 
                    border: 'none', 
                    padding: '8px 18px', 
                    fontSize: 15, 
                    cursor: 'pointer' 
                  }}
                >
                  続きから始める（認証必須）
                </button>
                
                <button 
                  onClick={async () => {
                    // セッションを強制クリア
                    await handleLogout();
                    setAuthMode('login');
                  }}
                  style={{ 
                    background: '#fee', 
                    color: '#d63384', 
                    fontWeight: 'bold', 
                    borderRadius: 6, 
                    border: '1px solid #f5c6cb', 
                    padding: '8px 18px', 
                    fontSize: 15, 
                    cursor: 'pointer' 
                  }}
                >
                  新規ログイン
                </button>
              </div>
              
              <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                ※セキュリティのため認証コードをお送りします
              </p>
              
              {sessionCreatedTime && (
                <p style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  セッション開始: {new Date(sessionCreatedTime).toLocaleString('ja-JP')}
                </p>
              )}
            </div>
          )}
        </header>
      </div>
    );
  }

  return (
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
                
                {/* 管理者メニュー */}
                {isAdmin && (
                  <button 
                    onClick={async () => { 
                      setDropdownOpen(false);
                      const authorized = await requireSensitiveAuth('admin');
                      if (authorized) {
                        setCurrentView('admin');
                      }
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      background: currentView === 'admin' ? '#e0e7ff' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                      color: currentView === 'admin' ? '#4f46e5' : '#374151'
                    }}
                  >
                    🔧 管理者メニュー
                  </button>
                )}
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
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <img src="/ai-teacher-logo.png" alt="AI先生ロゴ" style={{ width: 48, height: 48 }} />
            <div>
              AI家庭教師「SeLf」
              <div style={{ fontSize: '0.6em', fontWeight: 'normal', color: '#666', marginTop: 4 }}>
                {userProfile.nickname ? 
                  `${getTimeBasedGreeting()}、${userProfile.nickname}さん！` : 
                  userProfile.name ?
                    `${getTimeBasedGreeting()}、${userProfile.name}さん！` :
                    `${getTimeBasedGreeting()}！`
                }
              </div>
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
                <button type="button" onClick={handleImageButtonClick} style={{ background: '#e0e7ff', color: '#222', fontSize: 14, padding: '4px 10px', fontWeight: 'bold', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
                  <span role="img" aria-label="カメラ" style={{ marginRight: 4 }}>📷</span>画像から質問
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageInputWrapper} />
                <button type="button" onClick={handleSpeechInputWrapper} style={{ background: '#e0e7ff', color: '#222', fontSize: 14, padding: '4px 10px', fontWeight: 'bold', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
                  <span role="img" aria-label="マイク" style={{ marginRight: 4 }}>🎤</span>音声で質問
                </button>
              </div>              <button type="submit" disabled={loading || !question || (userUsage.monthlyLimit - userUsage.currentUsage <= 0)} style={{ marginTop: 8, width: 180, alignSelf: 'center' }}>
                {loading ? '考え中...' : '質問する'}
              </button>
              {/* 残り質問回数表示 */}
              <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14 }}>
                <span style={{ fontWeight: 'bold', color: '#374151' }}>
                  今月の残り質問回数: 
                </span>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: (userUsage.monthlyLimit - userUsage.currentUsage) <= 0 ? '#dc2626' : '#059669' 
                }}>
                  {Math.max(0, userUsage.monthlyLimit - userUsage.currentUsage)}回
                </span>
                <span style={{ color: '#6b7280' }}>
                  （上限: {userUsage.monthlyLimit}回）
                </span>
              </div>
              {(userUsage.monthlyLimit - userUsage.currentUsage) <= 0 && (
                <div style={{ color: '#dc2626', marginTop: 8, fontWeight: 'bold', textAlign: 'center' }}>
                  質問回数の上限に達しました。管理者にご連絡ください。
                </div>
              )}</form>
            
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
                remainingUsage={userUsage.monthlyLimit - userUsage.currentUsage}
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
          <ContactForm 
            onClose={() => setCurrentView('question')} 
            user={user} 
            remainingUsage={userUsage.monthlyLimit - userUsage.currentUsage} 
          />
        )}        {/* プロフィールビュー */}
        {currentView === 'profile' && (
          <ProfileView
            user={user}
            userProfile={userProfile}
            setCurrentView={setCurrentView}
            saveUserProfile={saveUserProfile}
            setGrade={setGrade}
            setUserProfile={setUserProfile}
          />
        )}
        
        {/* 管理者メニュー */}        {currentView === 'admin' && (
          <AdminUsageManager 
            FIRESTORE_API_URL={FIRESTORE_API_URL}
            isAdmin={isAdmin}
            onUserUsageUpdate={handleUserUsageUpdate}
          />
        )}

      </header>
    </div>
  );
}

export default App;
