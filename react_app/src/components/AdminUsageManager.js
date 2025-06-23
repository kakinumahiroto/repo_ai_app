import React, { useState, useEffect } from 'react';
import { fetchAllUsersUsage, updateUserUsageLimit, resetUserUsage } from '../utils/usage';

function AdminUsageManager({ FIRESTORE_API_URL, isAdmin, onUserUsageUpdate }) {
  const [allUsersUsage, setAllUsersUsage] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');

  // 全ユーザーの利用回数情報を読み込み
  const loadAllUsersUsage = async () => {
    setLoading(true);
    setError('');
    try {
      const usageData = await fetchAllUsersUsage(FIRESTORE_API_URL);
      setAllUsersUsage(usageData);
    } catch (err) {
      setError('利用回数データの取得に失敗しました');
      console.error('利用回数データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  // useEffectは必ず最上位で呼ぶ
  useEffect(() => {
    if (isAdmin) {      loadAllUsersUsage();
      // --- 追加: 定期的に自動更新 ---
      const interval = setInterval(() => {
        loadAllUsersUsage();
      }, 30000); // 4秒から30秒に変更
      return () => clearInterval(interval);
    }
  }, [FIRESTORE_API_URL, isAdmin]);

  // 管理者でない場合は何も表示しない
  if (!isAdmin) {
    return null;
  }

  // 利用回数制限を更新
  const handleUpdateLimit = async (userEmail, newLimit) => {
    if (!newLimit || newLimit < 0) {
      setError('有効な制限回数を入力してください');
      return;
    }    try {
      await updateUserUsageLimit(userEmail, parseInt(newLimit), FIRESTORE_API_URL);
      setUpdateMessage(`${userEmail} の制限回数を ${newLimit} に更新しました`);
      setTimeout(() => setUpdateMessage(''), 3000);
      await loadAllUsersUsage(); // データを再読み込み
      // コールバックでApp.jsのuserUsageも更新
      if (onUserUsageUpdate) {
        onUserUsageUpdate(userEmail);
      }
    } catch (err) {
      setError('制限回数の更新に失敗しました');
      console.error('制限回数更新エラー:', err);
    }
  };

  // 利用回数をリセット
  const handleResetUsage = async (userEmail) => {
    if (!window.confirm(`${userEmail} の利用回数をリセットしますか？`)) {
      return;
    }    try {
      await resetUserUsage(userEmail, FIRESTORE_API_URL);
      setUpdateMessage(`${userEmail} の利用回数をリセットしました`);
      setTimeout(() => setUpdateMessage(''), 3000);
      await loadAllUsersUsage(); // データを再読み込み
      // コールバックでApp.jsのuserUsageも更新
      if (onUserUsageUpdate) {
        onUserUsageUpdate(userEmail);
      }
    } catch (err) {
      setError('利用回数のリセットに失敗しました');
      console.error('利用回数リセットエラー:', err);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ color: '#374151', marginBottom: '20px' }}>🔧 利用回数管理（管理者）</h2>
      
      {error && (
        <div style={{ 
          background: '#fee2e2', 
          color: '#dc2626', 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '16px' 
        }}>
          {error}
        </div>
      )}

      {updateMessage && (
        <div style={{ 
          background: '#dcfce7', 
          color: '#16a34a', 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '16px' 
        }}>
          {updateMessage}
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <button 
          onClick={loadAllUsersUsage}
          disabled={loading}
          style={{
            background: '#3b82f6',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {loading ? '読み込み中...' : '🔄 データを更新'}
        </button>
      </div>

      {allUsersUsage.length === 0 && !loading ? (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
          利用回数データがありません
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            background: 'white', 
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  ユーザーID（メールアドレス）
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  今月の使用回数
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  利用可能回数（付与）
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  残り質問可能回数
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  最終リセット日
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {allUsersUsage.map((userData, index) => (
                <UserUsageRow 
                  key={userData.email} 
                  userData={userData}
                  onUpdateLimit={handleUpdateLimit}
                  onResetUsage={handleResetUsage}
                  isEven={index % 2 === 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 個別のユーザー行コンポーネント
function UserUsageRow({ userData, onUpdateLimit, onResetUsage, isEven }) {
  const [newLimit, setNewLimit] = useState(userData.monthlyLimit);
  const [isEditing, setIsEditing] = useState(false);

  const handleSaveLimit = () => {
    onUpdateLimit(userData.email, newLimit);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setNewLimit(userData.monthlyLimit);
    setIsEditing(false);
  };

  const isOverLimit = userData.currentUsage >= userData.monthlyLimit;

  return (
    <tr style={{ background: isEven ? '#f9fafb' : 'white' }}>
      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontWeight: '500', color: '#374151' }}>
          {userData.email}
        </div>
      </td>
      <td style={{ 
        padding: '12px', 
        textAlign: 'center', 
        borderBottom: '1px solid #e5e7eb',
        color: isOverLimit ? '#dc2626' : '#374151',
        fontWeight: isOverLimit ? 'bold' : 'normal'
      }}>
        {userData.currentUsage}
        {isOverLimit && <span style={{ marginLeft: '4px' }}>⚠️</span>}
      </td>
      <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <input
              type="number"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              min="0"
              style={{
                width: '60px',
                padding: '4px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                textAlign: 'center',
                fontSize: '14px'
              }}
            />
            <button
              onClick={handleSaveLimit}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              ✓
            </button>
            <button
              onClick={handleCancelEdit}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <span>{userData.monthlyLimit}</span>
            <button
              onClick={() => setIsEditing(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px'
              }}
              title="編集"
            >
              ✏️
            </button>
          </div>
        )}
      </td>
      <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#374151', fontWeight: 'bold' }}>
        {Math.max(userData.monthlyLimit - userData.currentUsage, 0)}
      </td>
      <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#6b7280' }}>
        {userData.lastResetDate || '未設定'}
      </td>
      <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => onResetUsage(userData.email)}
          style={{
            background: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
          title="利用回数をリセット"
        >
          🔄 リセット
        </button>
      </td>
    </tr>
  );
}

export default AdminUsageManager;
