const functions = require('firebase-functions');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const logger = require('firebase-functions/logger');

// メール送信関数
async function sendMfaEmail(email, code) {
  logger.info('=== MFA認証メール送信開始 ===');
  logger.info('送信先メール:', email);
  logger.info('認証コード:', code);
  
  try {
    // Gmail認証情報の取得
    const gmailUser = process.env.GMAIL_USER
      || (functions.config().gmail && functions.config().gmail.user)
      || 'kahiroto222@gmail.com';
    const gmailPass = process.env.GMAIL_PASS
      || (functions.config().gmail && functions.config().gmail.pass);

    logger.info('Gmail認証情報:', {
      user: gmailUser,
      passExists: !!gmailPass
    });

    if (!gmailUser || !gmailPass) {
      logger.error('Gmail認証情報が未設定');
      throw new Error('Gmail認証情報が未設定です');
    }

    // Nodemailer transporter の作成
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    logger.info('Nodemailer transporter作成完了');

    // メール送信
    const mailOptions = {
      from: gmailUser,
      to: email,
      subject: 'AI家庭教師「SeLf」認証コード',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">AI家庭教師「SeLf」認証コード</h2>
          <p>以下の認証コードを入力してください：</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #4f46e5; font-size: 36px; margin: 0; letter-spacing: 4px;">${code}</h1>
          </div>
          <p><strong>このコードは5分間有効です。</strong></p>
          <p>※このメールに心当たりがない場合は、無視してください。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            このメールは AI家庭教師「SeLf」から自動送信されています。
          </p>
        </div>
      `
    };

    logger.info('メール送信実行中...', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    await transporter.sendMail(mailOptions);
    logger.info('MFA認証メール送信成功');
    
  } catch (error) {
    logger.error('MFA認証メール送信エラー:', error);
    throw error;
  }
}

exports.sendMfaCode = functions.https.onCall(async (data, context) => {
  logger.info('=== sendMfaCode関数呼び出し ===');
  
  // より詳細なコンテキスト情報のログ出力
  logger.info('コンテキスト情報:', {
    hasAuth: !!context.auth,
    authUid: context.auth?.uid,
    authEmail: context.auth?.token?.email,
    authProvider: context.auth?.token?.firebase?.sign_in_provider,
    authIdentities: context.auth?.token?.firebase?.identities
  });
  
  // 安全なログ出力 - 循環参照を避けるためdataの中身のみを確認
  try {
    logger.info('受信データの概要:', {
      hasData: !!data,
      dataType: typeof data,
      dataKeys: data ? Object.keys(data) : [],
      email: data?.email,
      dataFromData: data?.data,
      rawDataStructure: data
    });
  } catch (logError) {
    logger.warn('データログ出力中にエラー:', logError.message);
  }
  
  try {
    // Firebase Functions エミュレータのバグ対応：認証情報がdata.authに格納される場合がある
    let authContext = context.auth;
    if (!authContext && data?.auth) {
      logger.warn('認証コンテキストがdata.authから取得されました（エミュレータの問題）');
      authContext = data.auth;
    }
    
    // 認証チェック
    if (!authContext) {
      logger.error('認証コンテキストが存在しません');
      
      // エミュレータ環境では認証コンテキストが正常に動作しない場合があるため、
      // 開発環境では警告のみ出力し、処理を継続
      if (process.env.FUNCTIONS_EMULATOR === 'true' || 
          process.env.NODE_ENV === 'development' ||
          context.rawRequest?.headers?.host?.includes('localhost')) {
        logger.warn('エミュレータ環境: 認証コンテキストなしで処理継続');
      } else {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
      }
    } else {
      logger.info('認証ユーザー確認済み:', {
        uid: authContext.uid,
        email: authContext.token?.email
      });
    }
    
    // データの存在確認とデータ抽出の修正
    if (!data) {
      logger.error('データが null または undefined');
      throw new functions.https.HttpsError('invalid-argument', 'No data provided');
    }
    
    // データ構造を確認し、適切にemailを抽出
    let email;
    if (data.email) {
      email = data.email;
    } else if (data.data && data.data.email) {
      // エミュレータ環境でのデータ構造の違いに対応
      email = data.data.email;
    } else if (typeof data === 'string') {
      // JSON文字列の場合の処理
      try {
        const parsedData = JSON.parse(data);
        email = parsedData.email;
      } catch (parseError) {
        logger.error('JSON解析エラー:', parseError);
      }
    }
    
    logger.info('抽出されたemail:', {
      email: email,
      emailType: typeof email,
      emailLength: email ? email.length : 'N/A',
      originalDataStructure: {
        hasDirectEmail: !!data.email,
        hasNestedEmail: !!data.data?.email,
        dataType: typeof data
      }
    });
    
    // emailが空の場合、認証コンテキストからメールアドレスを取得を試行
    if (!email || email.trim() === '') {
      logger.warn('データからemailが取得できません。認証コンテキストから取得を試行...');
      
      // 修正した認証コンテキストを使用
      if (authContext) {
        const authEmail = authContext.token?.email || authContext.token?.firebase?.identities?.email?.[0];
        if (authEmail) {
          logger.info('認証コンテキストからメールアドレスを取得:', authEmail);
          email = authEmail;
        }
      }
      
      if (!email || email.trim() === '') {
        logger.error('メールアドレスが取得できません:', {
          dataEmail: data?.email,
          dataNestedEmail: data?.data?.email,
          authEmail: authContext?.token?.email,
          identityEmail: authContext?.token?.firebase?.identities?.email?.[0],
          hasContext: !!authContext
        });
        throw new functions.https.HttpsError('invalid-argument', 'Email is required');
      }
    }
    
    logger.info('処理対象メール:', email);
    
    // 認証されたユーザーのメールと一致するかチェック
    const authEmail = authContext?.token?.email || authContext?.token?.firebase?.identities?.email?.[0];
    if (authEmail && email !== authEmail) {
      logger.warn('認証ユーザーのメールと送信先メールが不一致:', {
        authEmail,
        requestEmail: email
      });
    }
    
    // 認証コード生成
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    logger.info('認証コード生成:', code);
    
    // コードをハッシュ化
    logger.info('認証コードハッシュ化中...');
    const hashedCode = await bcrypt.hash(code, 10);
    logger.info('認証コードハッシュ化完了');
    
    // Firestoreに保存
    logger.info('Firestoreへの保存開始...');
    
    // 5分後の有効期限を設定
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000);
    logger.info('有効期限設定:', expiryTime.toISOString());
    
    try {
      // Firestore Timestamp を安全に作成
      let expiresAtTimestamp;
      try {
        // Firebase Admin SDK v9+ の新しい方法を試行
        expiresAtTimestamp = admin.firestore.Timestamp.fromDate(expiryTime);
      } catch (timestampError) {
        logger.warn('Timestamp.fromDate エラー、フォールバックを使用:', timestampError.message);
        // フォールバック: 通常のDateオブジェクトを使用
        expiresAtTimestamp = expiryTime;
      }
      
      const docData = {
        code: hashedCode,
        expiresAt: expiresAtTimestamp,
        attempts: 0,
        used: false
      };
      
      // serverTimestamp も安全に設定
      try {
        docData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      } catch (fieldValueError) {
        logger.warn('FieldValue.serverTimestamp エラー、現在時刻を使用:', fieldValueError.message);
        docData.createdAt = new Date();
      }
      
      await admin.firestore().collection('mfaCodes').doc(email).set(docData);
      logger.info('Firestore保存成功');
    } catch (firestoreError) {
      logger.error('Firestore保存エラー:', firestoreError);
      throw new functions.https.HttpsError('internal', 'Failed to save MFA code');
    }
    logger.info('Firestore保存完了');
    
    // メール送信
    logger.info('MFA認証メール送信開始...');
    await sendMfaEmail(email, code);
    logger.info('MFA認証メール送信完了');
    
    return { success: true };
  } catch (error) {
    logger.error('MFA code send error:', error);
    logger.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw new functions.https.HttpsError('internal', 'Failed to send MFA code: ' + error.message);
  }
});

exports.verifyMfaCode = functions.https.onCall(async (data, context) => {
  logger.info('=== verifyMfaCode関数呼び出し ===');
  logger.info('データ:', { email: data.email, codeLength: data.code ? data.code.length : 0 });
  logger.info('コンテキスト認証:', context.auth ? 'あり' : 'なし');
  
  try {
    // データ構造の修正対応
    let email, code;
    if (data.email && data.code) {
      email = data.email;
      code = data.code;
    } else if (data.data && data.data.email && data.data.code) {
      email = data.data.email;
      code = data.data.code;
    } else {
      email = data.email;
      code = data.code;
    }
    
    if (!email || !code) {
      logger.error('必須パラメータが不足:', { email: !!email, code: !!code });
      throw new functions.https.HttpsError('invalid-argument', 'Email and code are required');
    }
    
    // Firebase Functions エミュレータのバグ対応：認証情報がdata.authに格納される場合がある
    let authContext = context.auth;
    if (!authContext && data?.auth) {
      logger.warn('認証コンテキストがdata.authから取得されました（エミュレータの問題）');
      authContext = data.auth;
    }
    
    if (!authContext) {
      logger.error('認証が必要');
      
      // エミュレータ環境では認証コンテキストが正常に動作しない場合があるため、
      // 開発環境では警告のみ出力し、処理を継続
      if (process.env.FUNCTIONS_EMULATOR === 'true' || 
          process.env.NODE_ENV === 'development' ||
          context.rawRequest?.headers?.host?.includes('localhost')) {
        logger.warn('エミュレータ環境: 認証コンテキストなしで処理継続');
      } else {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
      }
    } else {
      logger.info('認証ユーザー:', {
        uid: authContext.uid,
        email: authContext.token.email
      });
    }
    
    // Firestoreから認証コードを取得
    logger.info('Firestoreから認証コード取得中...');
    const codeDoc = await admin.firestore().collection('mfaCodes').doc(email).get();
    
    if (!codeDoc.exists) {
      logger.error('認証コードが見つかりません:', email);
      throw new functions.https.HttpsError('not-found', 'MFA code not found');
    }
    
    const codeData = codeDoc.data();
    
    // 安全にTimestampを処理
    let expiresAtDate;
    try {
      expiresAtDate = codeData.expiresAt.toDate ? codeData.expiresAt.toDate() : new Date(codeData.expiresAt);
    } catch (dateError) {
      logger.warn('日付変換エラー、期限切れとして処理:', dateError.message);
      throw new functions.https.HttpsError('deadline-exceeded', 'MFA code expired');
    }
    
    logger.info('認証コードデータ:', {
      expiresAt: expiresAtDate,
      attempts: codeData.attempts,
      used: codeData.used
    });
    
    // 有効期限チェック
    if (expiresAtDate < new Date()) {
      logger.error('認証コードが期限切れ');
      throw new functions.https.HttpsError('deadline-exceeded', 'MFA code expired');
    }
    
    // 使用済みチェック
    if (codeData.used) {
      logger.error('認証コードが既に使用済み');
      throw new functions.https.HttpsError('failed-precondition', 'MFA code already used');
    }
    
    // 試行回数チェック
    if (codeData.attempts >= 3) {
      logger.error('認証試行回数が上限に達しています');
      throw new functions.https.HttpsError('failed-precondition', 'Too many attempts');
    }
    
    // 認証コード検証
    logger.info('認証コード検証中...');
    const isValid = await bcrypt.compare(code, codeData.code);
    
    if (!isValid) {
      logger.error('認証コードが無効');
      // 試行回数を増やす
      await admin.firestore().collection('mfaCodes').doc(email).update({
        attempts: admin.firestore.FieldValue.increment(1)
      });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid MFA code');
    }
    
    // 認証成功 - 使用済みマークを付ける
    logger.info('認証コード検証成功');
    await admin.firestore().collection('mfaCodes').doc(email).update({
      used: true
    });
    
    logger.info('MFA認証完了');
    return { success: true };
  } catch (error) {
    logger.error('MFA code verify error:', error);
    logger.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
});
