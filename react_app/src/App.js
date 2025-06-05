import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const res = await axios.post(
        process.env.REACT_APP_API_URL,
        { question },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setAnswer(res.data.answer);
    } catch (err) {
      setError("AI回答の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI家庭教師アプリ</h1>
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 480 }}>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="質問を入力してください（例：この数学の問題の考え方を教えて）"
            rows={4}
            style={{ width: '100%', fontSize: 16 }}
            required
          />
          <br />
          <button type="submit" disabled={loading || !question} style={{ fontSize: 18, marginTop: 8 }}>
            {loading ? 'AIが考え中...' : '質問する'}
          </button>
        </form>
        {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
        {answer && (
          <div style={{ background: '#fff', color: '#222', marginTop: 24, padding: 16, borderRadius: 8, maxWidth: 480 }}>
            <strong>AI家庭教師のヒント:</strong>
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{answer}</div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
