import React from 'react';

function AuthForm({
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  nickname,
  setNickname,
  grade,
  setGrade,
  handleAuth,
  authError,
  showPasswordReset,
  handlePasswordReset,
  isLoginBlocked
}) {  return (
    <form onSubmit={handleAuth} style={{ maxWidth: 360, margin: '40px auto', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px #bfcfff' }} className="auth-form">
      <h2 style={{ marginBottom: 16, textAlign: 'center', color: '#374151' }}>{authMode === "login" ? "ログイン" : "新規登録"}</h2><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="メールアドレス" required style={{ width: '100%', marginBottom: 12, padding: 8, fontSize: 15 }} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード" required style={{ width: '100%', marginBottom: 12, padding: 8, fontSize: 15 }} />
      {authMode === "register" && (
        <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
          ※パスワードは8文字以上、大文字・小文字・数字・記号をすべて含めてください。
        </div>
      )}
      {authMode === "register" && (
        <>
          <input 
            type="text" 
            value={nickname} 
            onChange={e => setNickname(e.target.value)} 
            placeholder="ニックネーム（任意）" 
            style={{ width: '100%', marginBottom: 12, padding: 8, fontSize: 15 }} 
          />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold', color: '#374151', fontSize: 14 }}>
              🎓 学年設定
            </label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                fontSize: 15,
                border: '1px solid #ccc',
                borderRadius: 4,
                backgroundColor: 'white'
              }}
            >
              <option value="小学生">小学生</option>
              <option value="中学生">中学生</option>
              <option value="高校生">高校生</option>
            </select>
          </div>
        </>
      )}
      {authMode === "login" && <div style={{ marginBottom: 16 }}></div>}
      
      {/* ログインブロック時のパスワードリセットボタン */}
      {authMode === "login" && showPasswordReset && (
        <button 
          type="button" 
          onClick={handlePasswordReset}
          style={{ 
            width: '100%', 
            marginBottom: 8,
            backgroundColor: '#dc3545',
            color: 'white',
            padding: '10px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          パスワードをリセット
        </button>
      )}
      
      {/* 通常のログイン/登録ボタン */}
      <button 
        type="submit" 
        disabled={isLoginBlocked}
        style={{ 
          width: '100%', 
          marginBottom: 8,
          opacity: isLoginBlocked ? 0.6 : 1,
          cursor: isLoginBlocked ? 'not-allowed' : 'pointer'
        }}
      >
        {authMode === "login" ? "ログイン" : "登録"}
      </button>
      <div style={{ textAlign: 'right', fontSize: 13 }}>
        <span style={{ cursor: 'pointer', color: '#4f46e5' }} onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "新規登録はこちら" : "ログインはこちら"}</span>
      </div>
      {authError && <div style={{ color: 'red', marginTop: 10 }}>{authError}</div>}
    </form>
  );
}

export default AuthForm;
