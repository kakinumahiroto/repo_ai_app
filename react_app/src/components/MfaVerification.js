import React, { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/functions';

// 操作タイプの表示名を取得
const getOperationDisplayName = (operationType) => {
  switch (operationType) {
    case 'admin': return '管理者機能';
    case 'profile_save': return 'プロファイル保存';
    default: return '機密操作';
  }
};

function MfaVerification({ 
  email, 
  onSuccess, 
  onCancel, 
  mfaError, 
  setMfaError,
  mfaLoading,
  setMfaLoading,
  mfaCodeSent,
  setMfaCodeSent,
  isSensitiveOperation = false,
  operationType = null,
  sessionInfo = null
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
    <div 
      className="mfa-verification-container"
      style={{ 
        maxWidth: 420, 
        margin: '40px auto', 
        background: '#fff', 
        borderRadius: 12, 
        padding: 32, 
        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
        border: '1px solid #e0e7ff'
      }}
    >
      <h2 style={{ 
        marginBottom: 24, 
        textAlign: 'center', 
        color: '#4f46e5', 
        fontWeight: 700,
        fontSize: '1.3rem'
      }}>
        {isSensitiveOperation ? '🔐 追加認証が必要です' : '📧 メール認証'}
      </h2>
      
      {/* セッション情報の表示 */}
      {sessionInfo && sessionInfo.isRecent && (
        <div 
          className="session-warning"
          style={{ 
            background: '#fff3cd', 
            border: '1px solid #ffeaa7', 
            borderRadius: 8, 
            padding: 16, 
            marginBottom: 20,
            fontSize: 14,
            color: '#856404'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>🔒 セッション情報</div>
          <div style={{ fontSize: 13 }}>
            開始時刻: {sessionInfo.created}<br/>
            ⚠️ 最近のセッションです。ご本人のアカウントか確認してください。
          </div>
        </div>
      )}
      
      <p style={{ 
        textAlign: 'center', 
        marginBottom: 24, 
        color: '#374151', 
        fontSize: 15,
        lineHeight: 1.5 
      }}>
        {isSensitiveOperation 
          ? `セキュリティのため、${getOperationDisplayName(operationType)}を実行するには追加認証が必要です。${email} に認証コードを送信しました。`
          : `${email} に認証コードを送信しました`
        }
      </p>
      
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6桁の認証コード"
          maxLength={6}
          disabled={mfaLoading}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: 18,
            textAlign: 'center',
            border: '2px solid #e0e7ff',
            borderRadius: 8,
            background: '#f8fafc',
            color: '#374151',
            letterSpacing: '0.2em',
            fontWeight: 'bold',
            boxSizing: 'border-box'
          }}
        />
      </div>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 12, 
        marginBottom: 16 
      }}>
        <button 
          onClick={handleVerifyCode} 
          disabled={mfaLoading || code.length !== 6}
          style={{
            background: code.length === 6 
              ? 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)' 
              : '#bfcfff',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '14px 20px',
            cursor: code.length === 6 ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontSize: 16,
            boxShadow: code.length === 6 
              ? '0 4px 12px rgba(79, 70, 229, 0.25)' 
              : 'none',
            transition: 'all 0.2s'
          }}
        >
          {mfaLoading ? '認証中...' : '認証'}
        </button>
        
        <button 
          onClick={handleResendCode} 
          disabled={!canResend || mfaLoading}
          style={{
            background: canResend && !mfaLoading 
              ? '#e0e7ff' 
              : '#f1f5f9',
            color: canResend && !mfaLoading 
              ? '#4f46e5' 
              : '#94a3b8',
            border: '1px solid #e0e7ff',
            borderRadius: 8,
            padding: '12px 20px',
            cursor: canResend && !mfaLoading ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            fontSize: 14,
            transition: 'all 0.2s'
          }}
        >
          {canResend 
            ? 'コード再送信' 
            : `コード再送信 (${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, '0')})`
          }
        </button>
      </div>
      
      <button 
        onClick={onCancel} 
        disabled={mfaLoading}
        style={{
          background: 'transparent',
          color: '#6b7280',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: '10px 20px',
          cursor: 'pointer',
          fontWeight: 500,
          fontSize: 14,
          width: '100%',
          transition: 'all 0.2s'
        }}
      >
        キャンセル
      </button>
      
      {mfaError && (
        <div 
          className="error-message"
          style={{
            marginTop: 16,
            padding: 12,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14,
            textAlign: 'center'
          }}
        >
          {mfaError}
        </div>
      )}
    </div>
  );
}

export default MfaVerification;
