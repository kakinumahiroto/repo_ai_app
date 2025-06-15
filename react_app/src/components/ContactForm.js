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
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ color: '#16a34a', fontWeight: 'bold', marginBottom: 12 }}>お問い合わせを送信しました！</div>
        <button onClick={onClose} style={{ marginTop: 8 }}>閉じる</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, minWidth: 320 }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>お問い合わせ</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="件名"
            style={{ width: '100%', padding: 8, fontSize: 16 }}
            required
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="お問い合わせ内容"
            rows={4}
            style={{ width: '100%', padding: 8, fontSize: 16 }}
            required
          />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <button type="submit" disabled={sending} style={{ width: '100%', padding: 10, fontSize: 16 }}>
          {sending ? '送信中...' : '送信'}
        </button>
        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: 8 }}>キャンセル</button>
      </form>
    </div>
  );
}

export default ContactForm;
