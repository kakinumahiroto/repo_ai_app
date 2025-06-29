import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/functions';

// 開発環境でも本番のCloud Functionsを使用するかどうかの設定
const USE_PRODUCTION_FUNCTIONS = process.env.REACT_APP_USE_PRODUCTION_FUNCTIONS === 'true';

export async function sendMfaCode(email) {
  try {
    console.log('=== sendMfaCode呼び出し開始 ===');
    console.log('送信メール:', email);
    console.log('本番Functions使用:', USE_PRODUCTION_FUNCTIONS);
    
    // 現在のユーザーを確認
    const currentUser = firebase.auth().currentUser;
    console.log('現在のユーザー:', currentUser ? currentUser.email : 'なし');
    
    if (!currentUser) {
      throw new Error('ユーザーが認証されていません');
    }
    
    // 認証状態が安定するまで少し待機
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 再度現在のユーザーを確認
    const user = firebase.auth().currentUser;
    if (!user) {
      throw new Error('認証状態が不安定です。再試行してください。');
    }
    
    console.log('認証状態確認完了:', {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified
    });
    
    // IDトークンを取得して確認
    const idToken = await user.getIdToken(true); // forceRefresh = true
    console.log('IDトークン取得成功:', !!idToken);
    console.log('IDトークン（最初の50文字）:', idToken ? idToken.substring(0, 50) + '...' : 'なし');
    
    // Firebase Functions設定
    const functions = firebase.functions();
    
    // エミュレータ vs 本番環境の選択
    if (USE_PRODUCTION_FUNCTIONS) {
      console.log('本番Functions使用に設定済み');
      // 本番環境のRegionを明示的に設定（必要に応じて）
      // functions = firebase.app().functions('us-central1');
    } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('エミュレータ使用: localhost:5001');
      functions.useEmulator('localhost', 5001);
    } else {
      console.log('本番Functions使用（本番環境）');
    }
    
    // Firebase Functions呼び出し
    const sendMfaCodeFunction = functions.httpsCallable('sendMfaCode');
    console.log('関数呼び出し前 - データ:', { email });
    console.log('関数呼び出し前 - 認証状態:', {
      isAuthenticated: !!user,
      hasToken: !!idToken
    });
    
    const result = await sendMfaCodeFunction({ email });
    console.log('関数呼び出し結果:', result);
    
    return result;
  } catch (error) {
    console.error('sendMfaCode エラー:', error);
    throw error;
  }
}

export async function verifyMfaCode(email, code) {
  try {
    console.log('=== verifyMfaCode呼び出し開始 ===');
    console.log('検証メール:', email);
    console.log('検証コード長:', code ? code.length : 0);
    console.log('本番Functions使用:', USE_PRODUCTION_FUNCTIONS);
    
    // 現在のユーザーを確認
    const currentUser = firebase.auth().currentUser;
    console.log('現在のユーザー:', currentUser ? currentUser.email : 'なし');
    
    if (!currentUser) {
      throw new Error('ユーザーが認証されていません');
    }
    
    // IDトークンを取得して確認
    const idToken = await currentUser.getIdToken(true); // forceRefresh = true
    console.log('IDトークン取得成功:', !!idToken);
    
    // Firebase Functions設定
    const functions = firebase.functions();
    
    // エミュレータ vs 本番環境の選択
    if (USE_PRODUCTION_FUNCTIONS) {
      console.log('本番Functions使用に設定済み');
    } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('エミュレータ使用: localhost:5001');
      functions.useEmulator('localhost', 5001);
    } else {
      console.log('本番Functions使用（本番環境）');
    }
    
    const verifyMfaCodeFunction = functions.httpsCallable('verifyMfaCode');
    console.log('関数呼び出し前 - データ:', { email, codeLength: code ? code.length : 0 });
    
    const result = await verifyMfaCodeFunction({ email, code });
    console.log('関数呼び出し結果:', result);
    
    return result;
  } catch (error) {
    console.error('verifyMfaCode エラー:', error);
    throw error;
  }
}
