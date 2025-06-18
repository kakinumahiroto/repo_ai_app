// 画像・音声入力系のユーティリティ
export function handleImageInput(e, setImageData, setLoading, setImageLoading, setImageLoadedMsg, setError) {
  const file = e.target.files[0];
  if (!file) return;
  setLoading && setLoading(true);
  setImageLoading && setImageLoading(true);
  setImageLoadedMsg && setImageLoadedMsg("");
  setError && setError("");
  try {
    const reader = new FileReader();
    reader.onload = () => {
      setImageData && setImageData(reader.result);
      setImageLoading && setImageLoading(false);
      setImageLoadedMsg && setImageLoadedMsg("画像を読み込みました");
    };
    reader.readAsDataURL(file);
  } catch (err) {
    setError && setError("画像の読み込みに失敗しました");
    setImageLoading && setImageLoading(false);
    setImageLoadedMsg && setImageLoadedMsg("");
  } finally {
    setLoading && setLoading(false);
  }
}

export function handleSpeechInput(setQuestion, setError) {
  if (!(window.webkitSpeechRecognition || window.SpeechRecognition)) {
    setError && setError('音声認識に未対応のブラウザです');
    return;
  }
  setError && setError("");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    setQuestion && setQuestion(prev => (prev ? prev + '\n' : '') + transcript);
  };
  recognition.onerror = (event) => {
    setError && setError('音声認識エラー: ' + event.error);
  };
  recognition.start();
}
