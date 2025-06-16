import React, { useState } from 'react';
import { CONTACT_API_URL } from '../App';

function ContactForm({ onClose, user }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch(CONTACT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.email ? { 'x-user-email': user.email } : {})
        },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) throw new Error('送信に失敗しました');
      setSent(true);
    } catch (err) {
      setError('送信に失敗しました: ' + err.message);
    } finally {
      setSending(false);
    }
  };
  if (sent) {
    return (
      <div style={{ 
        maxWidth: 480, 
        margin: '0 auto', 
        padding: 24, 
        textAlign: 'center',
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>        <div style={{ color: '#16a34a', fontWeight: 'bold', marginBottom: 12 }}>お問い合わせを送信しました！</div>
        <button 
          onClick={onClose} 
          className="save-button"
          style={{ 
            marginTop: 8,
            background: '#4f46e5'
          }}
        >
          <span>✓ 閉じる</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: 480, 
      margin: '0 auto', 
      padding: 20 
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          fontSize: 20, 
          marginBottom: 16,
          color: '#374151',
          textAlign: 'center'
        }}>📧 お問い合わせ</h2>        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: 8, 
              color: '#374151' 
            }}>
              件名
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="件名を入力してください"
              style={{ 
                width: '100%', 
                padding: '12px 16px', 
                fontSize: 16,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxSizing: 'border-box'
              }}
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: 8, 
              color: '#374151' 
            }}>
              お問い合わせ内容
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="お問い合わせ内容を詳しくお書きください"
              rows={6}
              style={{ 
                width: '100%', 
                padding: '12px 16px', 
                fontSize: 16,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
              required
            />
          </div>
          {error && (
            <div style={{ 
              color: '#dc2626', 
              marginBottom: 16,
              padding: '8px 12px',
              background: '#fee2e2',
              borderRadius: 6,
              fontSize: 14
            }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12 }}>            <button 
              type="submit" 
              disabled={sending} 
              className="save-button"
              style={{ 
                flex: 1,
                background: sending ? '#9ca3af' : undefined
              }}
            >
              <span>{sending ? '送信中...' : '📤 送信'}</span>
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="cancel-button"
              style={{ 
                flex: 1
              }}
            >
              <span>✖️ キャンセル</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ContactForm;
