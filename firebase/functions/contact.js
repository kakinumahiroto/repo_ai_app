const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
require('dotenv').config();

// Firebase認証トークン検証ミドルウェア
async function verifyFirebaseToken(req) {
  try {
    logger.info('=== contact認証チェック開始 ===');
    
    // Emulator環境を検出
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || 
                      process.env.NODE_ENV === 'development';
    
    logger.info('Contact Environment check:', {
      FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR,
      NODE_ENV: process.env.NODE_ENV,
      isEmulator: isEmulator
    });
    
    if (isEmulator) {
      logger.info('=== Contact Emulator環境のため認証チェックをスキップ ===');
      // 疑似ユーザー情報を設定
      const mockUser = {
        uid: 'emulator-contact-user',
        email: 'emulator-contact@example.com',
        email_verified: true
      };
      logger.info('Contact疑似ユーザー情報を設定:', mockUser);
      return mockUser;
    }
    
    const authHeader = req.headers.authorization;
    logger.info('Authorization header:', authHeader ? 'present' : 'missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No valid authorization header provided');
    }

    const idToken = authHeader.split('Bearer ')[1];
    logger.info('IDトークン取得:', idToken ? 'success' : 'failed');
    
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    logger.info('contact認証成功:', { uid: decodedToken.uid, email: decodedToken.email });
    
    return decodedToken;
  } catch (error) {
    logger.error('contact Token verification failed:', error);
    throw new Error('Token verification failed: ' + error.message);
  }
}

exports.contact = functions.https.onRequest(async (req, res) => {
  logger.info('=== contact エンドポイント呼び出し ===');
  logger.info('Request method:', req.method);
  logger.info('Request headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Bearer [token present]' : 'missing',
    'x-user-email': req.headers['x-user-email'] || 'missing'
  });
  
  const gmailUser = process.env.GMAIL_USER
  || (functions.config().gmail && functions.config().gmail.user)
  || 'kahiroto222@gmail.com';
const gmailPass = process.env.GMAIL_PASS
  || (functions.config().gmail && functions.config().gmail.pass);

  if (!gmailUser || !gmailPass) {
    logger.error('メール認証情報が未設定');
    res.status(500).send('メール認証情報が未設定です');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-user-email, Authorization');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.status(204).send('');
    return;
  }
  // Firebase認証トークン検証
  try {
    logger.info('contact認証検証開始...');
    const user = await verifyFirebaseToken(req);
    req.user = user;
    logger.info('contact認証成功 - ユーザー:', { uid: user.uid, email: user.email });
  } catch (error) {
    logger.error('contact認証失敗:', error.message);
    return res.status(401).json({ 
      error: 'Unauthorized: ' + error.message 
    });
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid method:', req.method);
    return res.status(405).send('Method Not Allowed');
  }
  
  const { subject, body } = req.body;
  logger.info('リクエストボディ:', {
    subject: subject || 'missing',
    body: body ? body.substring(0, 50) + '...' : 'missing'
  });
  
  // クライアントから x-user-email ヘッダーでログインユーザーのメールアドレスを受け取る
  const userEmail = req.get('x-user-email') || 'unknown';
  logger.info('送信者メール:', userEmail);
  
  if (!subject || !body) {
    logger.error('必須フィールドが不足');
    return res.status(400).send('Missing fields');
  }
  
  try {
    logger.info('メール送信開始...');
    await transporter.sendMail({
      from: gmailUser,
      to: gmailUser,
      subject: `[お問い合わせ] ${subject} (from: ${userEmail})`,
      text: `送信者: ${userEmail}\n\n${body}`,
    });
    logger.info('メール送信成功');
    res.status(200).send('OK');
  } catch (err) {
    logger.error('メール送信エラー:', err);
    res.status(500).send('メール送信失敗: ' + err.message);
  }
});
