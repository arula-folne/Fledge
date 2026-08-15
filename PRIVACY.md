# プライバシーポリシー（Privacy Policy）

最終更新: 2026-08-16

本ポリシーは、Minecraft ランチャー **Fledge**（以下「本アプリ」）が取り扱う情報について説明します。Fledge は個人・OSS プロジェクト（[arula-folne/Fledge](https://github.com/arula-folne/Fledge)）です。Fledge 運営の解析サーバーや広告 SDK はありません。

English summary: Fledge does not include ads, analytics, telemetry, or crash-reporting SDKs. Account tokens stay on your PC. Data leaves the device only to official / opted-in third-party services when you use those features. See below for details.

関連文書: [利用規約](./TERMS.md)

---

## 1. 収集しないもの

Fledge は次を**行いません**。

- 広告の配信
- 利用解析・テレメトリ
- クラッシュ報告の外部送信
- Fledge 独自のアカウントシステムの運営
- 利用者情報の販売

---

## 2. Fledge が端末上で保存・利用する情報

情報は、原則として **あなたの PC 上のアプリデータフォルダ**（本番では `Fledge.exe` と同じ階層の `Data/` および `Instances/`）に保存されます。Fledge のクラウドへアップロードすることはありません。

| 種類 | 保存場所の目安 | 利用目的 |
|------|----------------|----------|
| ランチャー設定 | `Data/Settings/` | テーマ、メモリ、Discord RPC のオン／オフなど |
| Microsoft アカウントの表示情報 | `Data/Accounts/index.json` | ログイン状態の表示（MCID、UUID、任意で XUID・スキン／アバター URL） |
| Microsoft / Minecraft トークン | `Data/Accounts/secrets/`（Electron `safeStorage` で暗号化） | 再ログインを省略し、ゲームを起動するため |
| インスタンス情報 | `Instances/` およびプロファイル | ワールド・Mod・起動設定の管理 |
| キャッシュ・ログ | `Data/Cache/`、`Data/Logs/` など | ダウンロードの再利用、不具合確認（ログは端末内） |
| Java ランタイム | `Data/java-version/` など | ゲーム起動 |

アプリをアンインストールするか、上記フォルダを削除すると、端末上のこれらのデータは消えます。ログアウトすると、該当アカウントの表示情報とトークンは端末から削除されます。

---

## 3. Microsoft アカウント情報

Minecraft の起動には、Microsoft アカウントによる公式認証が必要です。Fledge は **Microsoft / Xbox / Minecraft（Mojang）の公式サービス** に対して、認証ライブラリ経由で通信します。

### 取得・保存しうるもの

- Minecraft のプロフィール名（MCID）
- Minecraft UUID
- 任意で Xbox ユーザー ID（XUID）、スキン／アバターの URL
- アクセストークン・リフレッシュトークン（暗号化して端末に保存）

### 送信先

トークンと認証データは **Microsoft / Xbox Live / Minecraft サービス** へ、ログイン・トークン更新・ゲーム起動に必要な範囲でのみ送られます。Fledge 運営者や第三者の独自サーバーへは送りません。

パスワードは Fledge が保存しません。サインイン画面は Microsoft の公式フローです。

Microsoft 側の取り扱いは、Microsoft のプライバシーに関する声明に従います。

---

## 4. 外部サービスとの連携

機能を使ったときに限り、次の外部サービスと通信することがあります。Fledge が間に入って保管するわけではありません。

| サービス | いつ | 送る可能性のある情報 | 目的 |
|----------|------|----------------------|------|
| Microsoft / Xbox / Minecraft | ログイン・起動 | 認証トークン、プロフィール識別子 | 公式認証とゲーム起動 |
| Mojang のメタデータ / CDN | インストール・起動 | 通常のダウンロードリクエスト | ゲームファイルの取得 |
| Fabric / Forge / NeoForge | ローダー導入時 | 通常のダウンロードリクエスト | MOD ローダーの取得 |
| Eclipse Adoptium（Temurin） | Java 不足時 | 通常のダウンロードリクエスト | Java ランタイムの取得 |
| [Modrinth](https://modrinth.com) | コンテンツ検索・インストール時 | 検索語、対象バージョンなど API に必要なパラメータ | Mod 等の検索と配布ファイルの取得 |
| [mc-heads.net](https://mc-heads.net) | アバター表示のフォールバック時 | Minecraft UUID | 顔アイコンの表示（Microsoft 側の画像 URL があればそちらを優先） |
| ローカルの Discord デスクトップアプリ | **設定で Discord Rich Presence がオンのときだけ** | 下記「Discord」参照 | プレイ状態の表示 |

各サービスのプライバシーポリシーもあわせて確認してください。

---

## 5. Discord Rich Presence

Discord 連携は **任意** で、既定はオフです。オンにしたときだけ、**同じ PC 上の Discord クライアント** へ IPC で状態を送ります。Fledge 独自の Discord サーバーや解析サーバーへは送りません。

送りうる内容の例:

- アプリ名に相当するプレイ表示（「Fledge をプレイ中」など。表示名は Discord 上のアプリケーション名に依存）
- ランチャー待機 / 準備中 / 起動中 / プレイ中といった状態
- インスタンス名、Minecraft バージョン、ローダー名
- 経過時間、アプリアイコン用の画像キー

**送らないもの:** Microsoft のトークン、パスワード、UUID、メールアドレス、ワールドの中身、チャット。

Discord 側の表示は、Discord の設定（アクティビティのプライバシーなど）にも従います。オフにすると送信を止め、表示を消します。

---

## 6. 第三者提供・国外移転

Fledge 運営が利用者情報を第三者に販売・提供することはありません。上記の外部サービスへは、あなたが機能を使った結果として、各サービス自身のサーバー（所在地は各事業者による）へ通信が発生します。

---

## 7. お子さま

本アプリは Minecraft の起動を目的としており、対象年齢は Minecraft および Microsoft アカウントの各規約に従います。13 歳未満の方は、保護者の同意と各サービスの要件を満たす場合にのみご利用ください。

---

## 8. 改定

本ポリシーを変える場合は、本ファイルの「最終更新」を改め、GitHub リポジトリで公開します。

---

## 9. 問い合わせ

質問は GitHub の Issue へお願いします。  
https://github.com/arula-folne/Fledge/issues
