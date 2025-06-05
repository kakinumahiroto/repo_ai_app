---

# AI学習アプリ システムアーキテクチャ構成

## 全体像

```
ユーザー（生徒・保護者）
     │
     ▼
[ React Frontend ]  ← UI入力（テキスト/画像/音声）
     │
     ▼
[ Firebase Hosting ]（デプロイ）
     │
     ▼
[ Firebase Authentication ]
     │
     ▼
[ Firestore ]  ← 質問履歴、ユーザー状態保存
     │
     ▼
[ Firebase Functions ]（APIプロキシ）
     │
     ▼
[ OpenAI GPT-4o API ]  ← プロンプト送信・ヒント返答
```

---

## ディレクトリ構成（Cドライブ直下推奨）

```
C:/
├── ai-tutor-frontend/     # Reactアプリ
│   ├── src/
│   ├── public/
│   ├── .env               # 環境変数（非公開）
│   └── package.json
│
├── ai-tutor-functions/    # Firebase Functions（Node.js）
│   ├── functions/
│   │   ├── index.js       # GPT-4oとの連携関数
│   │   └── package.json
│   └── firebase.json
│
└── ai-tutor-backend/      # Python（任意：Cloud RunでGPT処理を拡張）
    ├── main.py
    ├── requirements.txt
    └── .env
```

---

## 使用技術スタック

| カテゴリ    | ツール / 技術                                 |
| ------- | ---------------------------------------- |
| フロントエンド | React, Vite, Tailwind（任意）                |
| バックエンド  | Firebase Functions (Node.js), Flask (任意) |
| データベース  | Firestore (NoSQL)                        |
| 認証      | Firebase Authentication（匿名・Google）       |
| OCR     | Tesseract.js（クライアントサイド）                  |
| 音声認識    | Web Speech API                           |
| AIモデル   | OpenAI GPT-4o API（従量課金）                  |
| ホスティング  | Firebase Hosting                         |

---

## セキュリティ構成

| 項目                | 実装内容                                                          |
| ----------------- | ------------------------------------------------------------- |
| APIキー管理           | `.env` または Firebase Functions Config (`functions:config:set`) |
| Firestore Rules   | ログインユーザーに対する読み書きのみ許可                                          |
| 認証方式              | 匿名ログイン or Googleアカウントログイン                                     |
| 通信方式              | 全通信を HTTPS 経由で実施                                              |
| API制限（Rate Limit） | Cloud Functions 側でリクエスト頻度を制御（今後実装）                            |

---

## デプロイ／開発フロー概要

1. `npx create-react-app` → `ai-tutor-frontend/` に配置
2. `firebase init` → `functions/` など必要項目を選択（JSまたはPython不要なら無効化OK）
3. `.env` に環境変数設定（APIキーなど）
4. Firebase Hosting / Functions デプロイ：

   ```bash
   firebase deploy --only hosting,functions
   ```

---

## オプション：Cloud Run（Python GPT処理）

* より複雑なプロンプト処理やログ分析をしたい場合、Cloud Run + Flask によるAPIも利用可能
* Cloud Scheduler や BigQuery 連携も可能

---

## その他ベストプラクティス

* `node_modules/`、`venv/`、`.env` は `.gitignore` でGitに含めない
* GitHub Copilot Agentを活用する場合、上記構成を記載した `README.md` を起点に生成指示

---

