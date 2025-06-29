import React, { useState } from 'react';

const ProfileView = ({ user, userProfile, setCurrentView, saveUserProfile, setGrade }) => {
  const [editMode, setEditMode] = useState(false);
  const [nicknameEditMode, setNicknameEditMode] = useState(false);
  const [tempGrade, setTempGrade] = useState(userProfile.preferredGrade || '小学生');
  const [tempNickname, setTempNickname] = useState(userProfile.nickname || '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const updatedProfile = {
        ...userProfile,
        preferredGrade: tempGrade
      };
      await saveUserProfile(updatedProfile);
      setGrade(tempGrade);
      setEditMode(false);
      setSaveMessage('学年設定を保存しました！');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('保存に失敗しました。もう一度お試しください。');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleNicknameSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const updatedProfile = {
        ...userProfile,
        nickname: tempNickname.trim()
      };
      await saveUserProfile(updatedProfile);
      setNicknameEditMode(false);
      setSaveMessage('ニックネームを保存しました！');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('保存に失敗しました。もう一度お試しください。');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setTempGrade(userProfile.preferredGrade || '小学生');
    setEditMode(false);
  };

  const handleNicknameCancel = () => {
    setTempNickname(userProfile.nickname || '');
    setNicknameEditMode(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginBottom: 24, color: '#374151', textAlign: 'center' }}>👤 プロフィール</h2>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8, color: '#374151' }}>
            📧 メールアドレス
          </label>
          <div style={{ 
            padding: '12px 16px', 
            background: '#f9fafb', 
            border: '1px solid #e5e7eb', 
            borderRadius: 8, 
            color: '#6b7280' 
          }}>
            {user?.email || 'メールアドレスが取得できません'}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontWeight: 'bold', color: '#374151' }}>
              🏷️ ニックネーム
            </label>
            {!nicknameEditMode && (
              <button
                onClick={() => setNicknameEditMode(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 12,
                  color: '#4f46e5',
                  cursor: 'pointer'
                }}
              >
                ✏️ 編集
              </button>
            )}
          </div>
          {nicknameEditMode ? (
            <div>
              <input
                type="text"
                value={tempNickname}
                onChange={(e) => setTempNickname(e.target.value)}
                placeholder="ニックネームを入力"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #4f46e5',
                  borderRadius: 8,
                  fontSize: 16,
                  marginBottom: 12,
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleNicknameSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 'bold',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  保存
                </button>
                <button
                  onClick={handleNicknameCancel}
                  disabled={saving}
                  style={{
                    flex: 1,
                    background: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 'bold',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '12px 16px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              color: '#6b7280',
              fontSize: 16
            }}>
              {userProfile.nickname || '未設定'}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontWeight: 'bold', color: '#374151' }}>
              🎓 学年
            </label>
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 12,
                  color: '#4f46e5',
                  cursor: 'pointer'
                }}
              >
                ✏️ 編集
              </button>
            )}
          </div>
          {editMode ? (
            <div>
              <select
                value={tempGrade}
                onChange={(e) => setTempGrade(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #4f46e5',
                  borderRadius: 8,
                  fontSize: 16,
                  marginBottom: 12,
                  boxSizing: 'border-box'
                }}
              >
                <option value="小学生">小学生</option>
                <option value="中学生">中学生</option>
                <option value="高校生">高校生</option>
                <option value="大学生">大学生</option>
                <option value="社会人">社会人</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 'bold',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  保存
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    flex: 1,
                    background: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 'bold',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '12px 16px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              color: '#6b7280',
              fontSize: 16
            }}>
              {userProfile.preferredGrade || '未設定'}
            </div>
          )}
        </div>
        {/* MFA設定セクション */}
        <div className="mfa-settings" style={{ marginBottom: 24, marginTop: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#374151' }}>多要素認証設定</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={userProfile.mfaEnabled || false}
              onChange={async (e) => {
                // ON/OFF時にAPIで保存
                const updatedProfile = { ...userProfile, mfaEnabled: e.target.checked, mfaLastEnabled: new Date().toISOString() };
                await saveUserProfile(updatedProfile);
              }}
            />
            メール認証を有効にする
          </label>
          {userProfile.mfaEnabled && (
            <p style={{ color: 'green', margin: 0, marginTop: 8 }}>✓ メール認証が有効です</p>
          )}
        </div>
        {saveMessage && (
          <div style={{ color: '#10b981', marginTop: 12, textAlign: 'center' }}>{saveMessage}</div>
        )}
        <button
          onClick={() => setCurrentView('question')}
          style={{
            marginTop: 24,
            width: '100%',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '12px 0',
            fontSize: 16,
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ← 戻る
        </button>
      </div>
    </div>
  );
};

export default ProfileView;
