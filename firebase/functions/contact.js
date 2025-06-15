const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
require('dotenv').config();

exports.contact = functions.https.onRequest(async (req, res) => {
  const gmailUser = process.env.GMAIL_USER
  || (functions.config().gmail && functions.config().gmail.user)
  || 'kahiroto222@gmail.com';
const gmailPass = process.env.GMAIL_PASS
  || (functions.config().gmail && functions.config().gmail.pass);

  if (!gmailUser || !gmailPass) {
    res.status(500).send('メール認証情報が未設定です');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-user-email');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { subject, body } = req.body;
  // クライアントから x-user-email ヘッダーでログインユーザーのメールアドレスを受け取る
  const userEmail = req.get('x-user-email') || 'unknown';
  if (!subject || !body) return res.status(400).send('Missing fields');
  try {
    await transporter.sendMail({
      from: gmailUser,
      to: gmailUser,
      subject: `[お問い合わせ] ${subject} (from: ${userEmail})`,
      text: `送信者: ${userEmail}\n\n${body}`,
    });
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('メール送信失敗: ' + err.message);
  }
});
