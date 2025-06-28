# reCAPTCHA設定ガイド

## 概要

このアプリケーションは、ローカル環境と本番環境で自動的にreCAPTCHAキーを切り替える機能を持っています。テスト用のreCAPTCHAキーによる警告メッセージを回避するため、適切な環境変数設定が必要です。

## 設定手順

### 1. reCAPTCHAサイトキーの取得

1. [Google reCAPTCHA管理コンソール](https://www.google.com/recaptcha/admin/)にアクセス
2. 新しいサイトを登録（v3を選択）
3. **ローカル開発用**:
   - ドメインに `localhost` と `127.0.0.1` を追加
4. **本番環境用**:
   - 実際の本番ドメインを追加

### 2. 環境変数ファイルの作成

`.env.template`をコピーして`.env`ファイルを作成し、以下の値を設定してください：

```bash
# ローカル開発用（localhost, 127.0.0.1で動作）
REACT_APP_RECAPTCHA_SITE_KEY_LOCAL=your_local_recaptcha_site_key_here

# 本番環境用（本番ドメインで動作）
REACT_APP_RECAPTCHA_SITE_KEY_PROD=your_production_recaptcha_site_key_here
```

### 3. 自動切り替えロジック

アプリケーションは以下のロジックで自動的にreCAPTCHAキーを選択します：

- `localhost` または `127.0.0.1` → `REACT_APP_RECAPTCHA_SITE_KEY_LOCAL`
- その他のドメイン → `REACT_APP_RECAPTCHA_SITE_KEY_PROD`

### 4. トラブルシューティング

#### 警告メッセージが表示される場合
- 環境変数が正しく設定されているか確認
- reCAPTCHAサイトキーが正しいドメインに対応しているか確認
- ブラウザの開発者ツールでコンソールエラーを確認

#### reCAPTCHA機能が無効になる場合
- 環境変数が未設定の場合、reCAPTCHA機能は自動的に無効になります
- ログイン・登録は引き続き動作しますが、reCAPTCHA認証はスキップされます

## ファイル構成

```
react_app/
├── .env.template          # 環境変数テンプレート
├── .env                   # 実際の環境変数（要作成）
├── public/
│   └── index.html         # reCAPTCHAスクリプト削除済み
└── src/
    └── App.js            # 動的reCAPTCHA読み込み実装
```

## セキュリティ注意事項

- `.env`ファイルは`.gitignore`に追加してリポジトリにコミットしないこと
- 本番環境では環境変数を安全に管理すること
- reCAPTCHAサイトキーは公開情報ですが、適切なドメイン制限を設定すること
