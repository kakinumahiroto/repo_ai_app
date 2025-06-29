/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const logger = require("firebase-functions/logger");
const axios = require("axios");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
require("dotenv").config();

// OpenAI API endpoint
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// モデル設定を明確に定義
const AI_MODELS = {
  RAG_SUMMARY: 'gpt-3.5-turbo',      // RAG要約用
  RESPONSE: 'gpt-4o-mini',           // 応答用
  VISION: 'gpt-4o-mini'              // 画像認識用
};

if (!admin.apps.length) {
  try {
    logger.info('Firebase Admin SDK 初期化開始...');
    admin.initializeApp();
    logger.info('Firebase Admin SDK 初期化成功');
    logger.info('Project ID:', admin.app().options.projectId || 'default');
  } catch (error) {
    logger.error('Firebase Admin SDK 初期化失敗:', error);
  }
} else {
  logger.info('Firebase Admin SDK は既に初期化済み');
}

// --- Firebase認証トークン検証ミドルウェア ---
async function verifyFirebaseToken(req) {
  try {
    logger.info('=== 認証チェック開始 ===');
    logger.info('Request method:', req.method);
    logger.info('Request URL:', req.url);
    
    // Emulator環境を検出
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || 
                      process.env.NODE_ENV === 'development';
    
    logger.info('Environment check:', {
      FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR,
      NODE_ENV: process.env.NODE_ENV,
      isEmulator: isEmulator
    });
    
    if (isEmulator) {
      logger.info('=== Emulator環境のため認証チェックをスキップ ===');
      // 疑似ユーザー情報を設定（リクエストボディのuidを使用）
      const mockUser = {
        uid: req.body.uid || 'emulator-user',
        email: 'emulator@example.com',
        email_verified: true
      };
      logger.info('疑似ユーザー情報を設定:', mockUser);
      return mockUser;
    }
    
    const authHeader = req.headers.authorization;
    logger.info('Authorization header:', authHeader ? 'present' : 'missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.error('認証ヘッダーが不正または欠如');
      throw new Error('No valid authorization header provided');
    }

    const idToken = authHeader.split('Bearer ')[1];
    logger.info('IDトークン取得:', idToken ? 'success' : 'failed');
    logger.info('IDトークン（最初の20文字）:', idToken ? idToken.substring(0, 20) + '...' : 'none');
    
    logger.info('Firebase Admin SDK でトークン検証開始...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    logger.info('トークン検証成功:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    });
    
    return decodedToken;
  } catch (error) {
    logger.error('=== Token verification failed ===');
    logger.error('Error type:', error.constructor.name);
    logger.error('Error message:', error.message);
    logger.error('Error code:', error.code);
    logger.error('Full error:', error);
    throw new Error('Token verification failed: ' + error.message);
  }
}

// --- CORSヘッダー付与ユーティリティ ---
function setCORSHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PUT,DELETE,PATCH");
}

exports.aiAnswer = functions.https.onRequest(async (req, res) => {
  logger.info('=== aiAnswer エンドポイント呼び出し ===');
  logger.info('Request method:', req.method);
  logger.info('Request headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Bearer [token present]' : 'missing',
    'origin': req.headers.origin
  });
  
  setCORSHeaders(res);
  if (req.method === "OPTIONS") {
    logger.info('OPTIONS request - returning 204');
    res.status(204).send("");
    return;
  }

  // Firebase認証トークン検証
  try {
    logger.info('認証トークン検証開始...');
    const user = await verifyFirebaseToken(req);
    req.user = user;
    logger.info('認証成功 - ユーザー:', { uid: user.uid, email: user.email });
  } catch (error) {
    logger.error('認証失敗:', error.message);
    return res.status(401).json({ 
      error: 'Unauthorized: ' + error.message 
    });
  }

  logger.info("AI Answer endpoint called");
  const {question, grade, uid} = req.body;
  logger.info('リクエストデータ:', {
    uid: uid,
    question: question ? question.substring(0, 50) + '...' : 'missing',
    grade: grade
  });

  // UIDの一致確認
  if (req.user.uid !== uid) {
    logger.error('UID不一致:', { tokenUID: req.user.uid, bodyUID: uid });
    return res.status(403).json({ 
      error: 'Forbidden: UID mismatch' 
    });
  }

  if (!question) {
    setCORSHeaders(res);
    return res.status(400).json({error: "question is required"});
  }
  // 学年に応じてプロンプトを調整
  let systemPrompt = "あなたは親切な家庭教師です。答えを直接教えず、ヒントや考え方を段階的に説明してください。";
  if (grade === "小学生") {
    systemPrompt += " 小学生にも分かるように、やさしい言葉で説明してください。";
  } else if (grade === "中学生") {
    systemPrompt += " 中学生向けに、丁寧に説明してください。";
  } else if (grade === "高校生") {
    systemPrompt += " 高校生向けに、論理的に説明してください。";
  }
  // 「答えだけ教えて」などの出力制御: ユーザー質問に応じてsystemPromptを強化
  if (/答えだけ|答えを教えて|正解だけ|解答だけ/i.test(question)) {
    systemPrompt += " ただし、答えや正解を直接伝えず、必ずヒントや考え方のみを段階的に説明してください。";
  }
  // 曖昧な質問の具体化誘導: 「わからない」「教えて」など曖昧な場合は追加プロンプト
  if (/わからない|分からない|教えて|できない|どうすれば|どうやって|ヒント/i.test(question)) {
    systemPrompt += " 質問が曖昧な場合は、どの教科・単元か、どこが分からないかを生徒に優しく聞き返してください。";
  }
  try {    const response = await axios.post(
        OPENAI_API_URL,
        {
          model: AI_MODELS.RESPONSE, // gpt-4o-miniを使用
          messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: question},
          ],
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 1,
          stream: false,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
    );
    const aiMessage = response.data.choices[0].message.content;
    // Firestoreに履歴保存（普通のJSON形式で保存）
    await admin.firestore().collection("questionThreads").add({
      question,
      answer: aiMessage,
      grade: grade || "",
      uid: uid || "",
      createdAt: new Date().toISOString(),
      thread: [],
    });
    res.json({answer: aiMessage});
  } catch (err) {
    logger.error("OpenAI API error", err);
    setCORSHeaders(res);
    if (err.response && err.response.status === 429) {
      return res.status(429).json({
        error: "現在AIサーバーが混雑中、または利用上限に達しています。しばらくしてから再度お試しください。",
      });
    }
    res.status(500).json({error: "AI回答取得に失敗しました"});
  }
});

// --- RAG付きAI回答エンドポイント ---
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("langchain/prompts");
const { RunnableSequence } = require("langchain/schema/runnable");

// --- v1: region指定なしでCORS完全対応 ---
exports.ragChat = functions.https.onRequest(async (req, res) => {
  logger.info('=== ragChat エンドポイント呼び出し ===');
  logger.info('Request method:', req.method);
  logger.info('Request headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Bearer [token present]' : 'missing',
    'origin': req.headers.origin
  });
  logger.info('Request body keys:', Object.keys(req.body || {}));
  
  setCORSHeaders(res);
  if (req.method === "OPTIONS") {
    logger.info('OPTIONS request - returning 204');
    res.status(204).send("");
    return;
  }

  // Firebase認証トークン検証
  try {
    logger.info('認証トークン検証開始...');
    const user = await verifyFirebaseToken(req);
    req.user = user;
    logger.info('認証成功 - ユーザー:', { uid: user.uid, email: user.email });
  } catch (error) {
    logger.error('認証失敗:', error.message);
    return res.status(401).json({ 
      error: 'Unauthorized: ' + error.message 
    });
  }

  const { uid, question, currentThread, imageData } = req.body;
  logger.info('リクエストデータ:', {
    uid: uid,
    question: question ? question.substring(0, 50) + '...' : 'missing',
    hasCurrentThread: !!currentThread,
    hasImageData: !!imageData
  });

  // UIDの一致確認
  if (req.user.uid !== uid) {
    logger.error('UID不一致:', { tokenUID: req.user.uid, bodyUID: uid });
    return res.status(403).json({ 
      error: 'Forbidden: UID mismatch' 
    });
  }
  logger.info('UID一致確認完了');

  if (!uid || !question) {
    setCORSHeaders(res);
    return res.status(400).json({ error: "uid and question are required" });
  }  try {
    logger.info('=== Firestore履歴取得開始 ===');
    // 1. Firestoreから最新10件の履歴取得
    const snap = await admin.firestore()
      .collection("questionThreads")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    
    logger.info('Firestore履歴取得完了:', { documentCount: snap.size });
    
    let history = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.question && d.answer) {
        history.push({ role: "user", content: d.question });
        history.push({ role: "assistant", content: d.answer });
      }
      if (Array.isArray(d.thread)) {
        d.thread.forEach(t => {
          if (t.q && t.a) {
            history.push({ role: "user", content: t.q });
            history.push({ role: "assistant", content: t.a });
          }
        });
      }
    });
    
    history = history.reverse();
    logger.info('履歴の初期長さ:', history.length);
    
    if (currentThread && currentThread.question) {
      logger.info('現在のスレッドを履歴に追加');
      history.push({ role: "user", content: currentThread.question });
      if (currentThread.answer) {
        history.push({ role: "assistant", content: currentThread.answer });
      }
      if (Array.isArray(currentThread.thread)) {
        currentThread.thread.forEach(t => {
          if (t.question) history.push({ role: "user", content: t.question });
          if (t.answer) history.push({ role: "assistant", content: t.answer });
        });
      }
    }
    
    const trimmedHistory = history.slice(-16);
    logger.info('トリミング後の履歴長さ:', trimmedHistory.length);
    
    const lastUser = trimmedHistory.filter(h => h.role === "user").map(h => h.content).slice(-2).join(" / ");
    const lastAssistant = trimmedHistory.filter(h => h.role === "assistant").map(h => h.content).slice(-2).join(" / ");
    const contextSummary = `直前の会話: ユーザー「${lastUser}」 / AI「${lastAssistant}」`;
    const userMessage = `${contextSummary}\n質問: ${question}`;
    
    logger.info('=== RAG要約処理開始 ===');// 2. LangChainでRAG要点抽出（RunnableSequence新API）
    const llm = new ChatOpenAI({
      openAIApiKey: OPENAI_API_KEY,
      modelName: AI_MODELS.RAG_SUMMARY, // gpt-3.5-turboを使用
      temperature: 0.2,
      maxTokens: 512,
    });
    const prompt = PromptTemplate.fromTemplate(
      "以下は生徒とAIの会話履歴です。重要な発言・話題・意図を要約してください。\n---\n{history}\n---\n要点:"
    );
    const ragChain = RunnableSequence.from([
      async (input) => ({ history: input }),
      prompt,
      llm,
      async (output) => output.content // ChatOpenAIの返却値からcontentのみ抽出
    ]);    const historyText = trimmedHistory.map(h => `${h.role}: ${h.content}`).join("\n");
    const summary = await ragChain.invoke(historyText);
    logger.info('RAG要約完了:', summary ? 'success' : 'empty');
    
    // --- 画像データがある場合はOpenAI Vision APIで画像＋テキストプロンプト ---
    let aiMessage;
    if (imageData) {
      logger.info('=== Vision APIで画像処理開始 ===');
      // gpt-4o, gpt-4-vision-previewはimagesプロパティで画像を受け付ける
      const visionMessages = [
        { role: "system", content: `会話履歴の要点: ${summary}` },
        ...trimmedHistory,
        {
          role: "user",
          content: [
            { type: "text", text: userMessage },
            { type: "image_url", image_url: { url: imageData } }
          ]
        }
      ];
      visionMessages.push({ role: "system", content: `[DEBUG] RAG要約: ${summary}` });
      
      logger.info('Vision API呼び出し開始...');
      const response = await axios.post(
        OPENAI_API_URL,
        {
          model: AI_MODELS.VISION, // gpt-4o-miniを使用（画像認識）
          messages: visionMessages,
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 1,
          stream: false,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      );
      aiMessage = response.data.choices[0].message.content;
      logger.info('Vision API呼び出し成功');
    } else {
      logger.info('=== テキストAPI呼び出し開始 ===');
      // ...従来通り...
      const messages = [
        { role: "system", content: `会話履歴の要点: ${summary}` },
        ...trimmedHistory,
        { role: "user", content: userMessage }
      ];
      messages.push({ role: "system", content: `[DEBUG] RAG要約: ${summary}` });
      
      logger.info('OpenAI API呼び出し開始...');
      const response = await axios.post(
        OPENAI_API_URL,
        {
          model: AI_MODELS.RESPONSE, // gpt-4o-miniを使用（テキスト応答）
          messages,
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 1,
          stream: false,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      );
      aiMessage = response.data.choices[0].message.content;
      logger.info('OpenAI API呼び出し成功');
    }
    
    logger.info('=== ragChat処理完了 ===');
    logger.info('AI回答生成:', aiMessage ? 'success' : 'empty');
    res.json({ answer: aiMessage, rag_summary: summary, debug_rag_summary: summary });
  } catch (err) {
    logger.error("RAG Chat API error", err);
    setCORSHeaders(res);
    res.status(500).json({ error: "RAG付きAI回答取得に失敗しました" });
  }
});


// --- お問い合わせエンドポイント ---
const contact = require('./contact');
exports.contact = contact.contact;

// --- MFAエンドポイント ---
const mfa = require('./mfa');
exports.sendMfaCode = mfa.sendMfaCode;
exports.verifyMfaCode = mfa.verifyMfaCode;

// --- ログイン試行上限通知機能 ---
exports.sendLoginLimitNotification = functions.https.onCall(async (data, context) => {
  try {
    logger.info('=== ログイン試行上限通知開始 ===');
    logger.info('Request data:', data);
    logger.info('Context:', context);
    
    // データ構造を確認してメールアドレスを取得
    let email = data.email || data?.data?.email || (typeof data === 'string' ? data : null);
    
    logger.info('Extracted email:', email);
    
    if (!email) {
      logger.error('メールアドレスが見つかりません:', { data, context });
      throw new functions.https.HttpsError('invalid-argument', 'メールアドレスが必要です');
    }
    
    // 環境変数の確認
    const gmailUser = process.env.GMAIL_USER || 'aiappself@gmail.com';
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;
    
    logger.info('Gmail settings:', {
      user: gmailUser,
      hasPassword: !!gmailPassword,
      passwordLength: gmailPassword ? gmailPassword.length : 0
    });
    
    // Gmail設定が不完全な場合はログのみで処理を続行
    if (!gmailPassword || gmailPassword === 'your_gmail_app_password_here') {
      logger.warn('Gmail設定が不完全です。ログのみで通知を記録します。');
      logger.info(`[管理者通知] ログイン試行上限超過 - メールアドレス: ${email}`);
      
      // Firestoreに通知ログを保存
      try {
        const db = admin.firestore();
        
        // タイムスタンプの生成（安全な方法）
        let timestamp;
        try {
          timestamp = admin.firestore.FieldValue.serverTimestamp();
        } catch (timestampError) {
          logger.warn('serverTimestamp利用不可、現在時刻を使用:', timestampError);
          timestamp = new Date();
        }
        
        const docRef = await db.collection('loginLimitNotifications').add({
          email: email,
          timestamp: timestamp,
          notificationSent: false,
          reason: 'Gmail設定未完了のためメール送信をスキップ'
        });
        logger.info('通知ログをFirestoreに保存しました - Doc ID:', docRef.id);
      } catch (firestoreError) {
        logger.error('Firestore保存エラー:', firestoreError);
      }
      
      return { 
        success: true, 
        message: 'ログイン試行上限通知をログに記録しました（メール送信はスキップ）' 
      };
    }
    
    // メール送信を試行
    try {
      const nodemailer = require('nodemailer');
      
      // Gmail設定
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPassword
        }
      });
      
      // 接続テスト
      await transporter.verify();
      logger.info('Gmail SMTP接続確認成功');
      
      const mailOptions = {
        from: gmailUser,
        to: 'aiappself@gmail.com',
        subject: 'ログイン試行上限超過通知',
        text: `メールアドレス：${email}\n\nログイン試行回数が上限に達しました。`,
        html: `
          <h2>ログイン試行上限超過通知</h2>
          <p><strong>メールアドレス：</strong>${email}</p>
          <p>ログイン試行回数が上限に達しました。</p>
          <p>必要に応じて対応をお願いします。</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
      logger.info('ログイン試行上限通知メール送信成功:', email);
      
      // Firestoreに成功ログを保存
      try {
        const db = admin.firestore();
        
        // タイムスタンプの生成（安全な方法）
        let timestamp;
        try {
          timestamp = admin.firestore.FieldValue.serverTimestamp();
        } catch (timestampError) {
          logger.warn('serverTimestamp利用不可、現在時刻を使用:', timestampError);
          timestamp = new Date();
        }
        
        const docRef = await db.collection('loginLimitNotifications').add({
          email: email,
          timestamp: timestamp,
          notificationSent: true,
          reason: 'メール送信成功'
        });
        logger.info('成功ログをFirestoreに保存しました - Doc ID:', docRef.id);
      } catch (firestoreError) {
        logger.error('Firestore保存エラー:', firestoreError);
      }
      
      return { success: true, message: '通知メールを送信しました' };
      
    } catch (emailError) {
      logger.error('メール送信エラー:', emailError);
      
      // メール送信失敗でもログは残す
      try {
        const db = admin.firestore();
        
        // タイムスタンプの生成（安全な方法）
        let timestamp;
        try {
          timestamp = admin.firestore.FieldValue.serverTimestamp();
        } catch (timestampError) {
          logger.warn('serverTimestamp利用不可、現在時刻を使用:', timestampError);
          timestamp = new Date();
        }
        
        await db.collection('loginLimitNotifications').add({
          email: email,
          timestamp: timestamp,
          notificationSent: false,
          reason: 'メール送信エラー: ' + emailError.message,
          error: emailError.toString()
        });
        logger.info('エラーログをFirestoreに保存しました');
      } catch (firestoreError) {
        logger.error('Firestore保存エラー:', firestoreError);
      }
      
      // エラーを投げずに警告として処理
      logger.warn('メール送信に失敗しましたが、処理を継続します');
      return { 
        success: true, 
        message: 'ログイン試行上限通知をログに記録しました（メール送信は失敗）' 
      };
    }
    
  } catch (error) {
    logger.error('ログイン試行上限通知エラー:', error);
    
    // 重要なエラーのみ例外として投げる
    if (error.code === 'invalid-argument') {
      throw error;
    }
    
    // その他のエラーは警告として処理
    return { 
      success: false, 
      message: 'エラーが発生しましたが処理を継続します: ' + error.message 
    };
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
