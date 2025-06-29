import React, { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/functions';

function MfaVerification({ 
  email, 
  onSuccess, 
  onCancel, 
  mfaError, 
  setMfaError,
  mfaLoading,
  setMfaLoading,
  mfaCodeSent,
  setMfaCodeSent
}) {
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(300); // 5分
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (!mfaCodeSent) return;
    setCountdown(300);
    setCanResend(false);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [mfaCodeSent]);

  const handleVerifyCode = async () => {
    console.log('=== MFA認証コード検証開始 ===');
    console.log('Email:', email);
    console.log('Code:', code);
    console.log('firebase:', firebase);
    console.log('firebase.functions:', firebase.functions);
    
    setMfaLoading(true);
    setMfaError("");
    try {
      if (!firebase.functions) {
        throw new Error('Firebase Functions が利用できません。初期化を確認してください。');
      }
      
      console.log('verifyMfaCode 関数取得中...');
      const verifyMfaCode = firebase.functions().httpsCallable('verifyMfaCode');
      console.log('verifyMfaCode 関数取得成功:', verifyMfaCode);
      
      console.log('認証コード検証実行中...', { email, code });
      const res = await verifyMfaCode({ email, code });
      console.log('認証コード検証レスポンス:', res);
      
      if (res.data.success) {
        console.log('認証コード検証成功');
        onSuccess();
      } else {
        console.log('認証コード検証失敗:', res.data);
        setMfaError('認証コードが正しくありません');
      }
    } catch (err) {
      console.error('=== MFA認証コード検証エラー詳細 ===');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      console.error('Full error object:', err);
      setMfaError(err.message || '認証に失敗しました');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleResendCode = async () => {
    console.log('=== MFA認証コード再送信開始 ===');
    console.log('Email:', email);
    console.log('firebase:', firebase);
    console.log('firebase.functions:', firebase.functions);
    
    setMfaLoading(true);
    setMfaError("");
    try {
      if (!firebase.functions) {
        throw new Error('Firebase Functions が利用できません。初期化を確認してください。');
      }
      
      console.log('sendMfaCode 関数取得中...');
      const sendMfaCode = firebase.functions().httpsCallable('sendMfaCode');
      console.log('sendMfaCode 関数取得成功:', sendMfaCode);
      
      console.log('認証コード再送信実行中...', { email });
      await sendMfaCode({ email });
      console.log('認証コード再送信成功');
      
      setMfaCodeSent(true);
      setCountdown(300);
      setCanResend(false);
    } catch (err) {
      console.error('=== MFA認証コード再送信エラー詳細 ===');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      console.error('Full error object:', err);
      setMfaError('再送信に失敗しました: ' + (err.message || ''));
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="mfa-verification">
      <h2>メール認証</h2>
      <p>{email} に認証コードを送信しました</p>
      <input
        type="text"
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="6桁の認証コード"
        maxLength={6}
        disabled={mfaLoading}
      />
      <button onClick={handleVerifyCode} disabled={mfaLoading || code.length !== 6}>
        認証
      </button>
      <button onClick={handleResendCode} disabled={!canResend || mfaLoading}>
        コード再送信 ({countdown}秒)
      </button>
      <button onClick={onCancel} disabled={mfaLoading}>キャンセル</button>
      {mfaError && <div className="error">{mfaError}</div>}
    </div>
  );
}

export default MfaVerification;
