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
  handleAuth,
  authError
}) {
  return (
    <form onSubmit={handleAuth} style={{ maxWidth: 360, margin: '40px auto', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px #bfcfff' }}>
      <h2 style={{ marginBottom: 16 }}>{authMode === "login" ? "ログイン" : "新規登録"}</h2>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="メールアドレス" required style={{ width: '100%', marginBottom: 12, padding: 8, fontSize: 15 }} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード" required style={{ width: '100%', marginBottom: 12, padding: 8, fontSize: 15 }} />
      {authMode === "register" && (
        <input 
          type="text" 
          value={nickname} 
          onChange={e => setNickname(e.target.value)} 
          placeholder="ニックネーム（任意）" 
          style={{ width: '100%', marginBottom: 16, padding: 8, fontSize: 15 }} 
        />
      )}
      {authMode === "login" && <div style={{ marginBottom: 16 }}></div>}
      <button type="submit" style={{ width: '100%', marginBottom: 8 }}>{authMode === "login" ? "ログイン" : "登録"}</button>
      <div style={{ textAlign: 'right', fontSize: 13 }}>
        <span style={{ cursor: 'pointer', color: '#4f46e5' }} onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "新規登録はこちら" : "ログインはこちら"}</span>
      </div>
      {authError && <div style={{ color: 'red', marginTop: 10 }}>{authError}</div>}
    </form>
  );
}

export default AuthForm;
