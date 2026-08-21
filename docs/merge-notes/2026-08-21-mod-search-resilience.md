# マージメモ: Mod 検索の耐性化（2026-08-21）

PC ローカルで並行制作中の変更と取り込むとき用。  
**この変更は機能一式の置き換えではなく、Issue #14 向けの限定差分パッチ**です。

## 参照

| 項目 | 値 |
| --- | --- |
| Issue | [#14](https://github.com/arula-folne/Fledge/issues/14)（CLOSED） |
| PR | [#15](https://github.com/arula-folne/Fledge/pull/15)（MERGED） |
| 修正コミット | `ed38583` |
| main マージコミット | `a95353d` |
| 作業開始ベース | `731696e`（GPL-3.0 ライセンス変更時点） |

## 変更ファイル（この 7 つのみ）

1. `apps/desktop/src/features/content/AddContentModal.tsx`  
   - **バグ修正**: 未定義だった `hitsForList` を `hits` に修正（検索結果表示時のクラッシュ）  
   - 検索失敗時の案内＋再試行ボタン、`retry` / `retryDelay` 追加
2. `packages/core/src/content/ModrinthProvider.ts`  
   - `mrFetch` に約 20s タイムアウト、429 再試行、一時的ネットワーク再試行
3. `apps/desktop/src/components/RouteErrorBoundary.tsx`  
   - `resetKeys`、関数 `fallback`、チャンク／構文系失敗向けメッセージ
4. `apps/desktop/src/features/content/ContentTab.tsx`  
   - 検索モーダルを ErrorBoundary で隔離（再試行／閉じる）
5. `apps/desktop/src/pages/LibraryDetailPage.tsx`  
   - `ContentTab` を `lazy` + `Suspense` + ErrorBoundary（詳細ページ全体を落とさない）
6. `apps/desktop/src/App.tsx`  
   - ルート ErrorBoundary の文言を i18n 化
7. `packages/i18n/src/locales/ja.json`  
   - `content.searchFailed` / `searchTimeout` / `searchRateLimited` / panel・browse エラー文言など

## ローカル取り込み手順（推奨）

```bash
git fetch origin
# ローカル作業ブランチ上で
git rebase origin/main
# または
git merge origin/main
```

単発でこの修正だけ欲しい場合:

```bash
git fetch origin
git cherry-pick ed38583
```

## 競合しやすい箇所と残すべき意図

| ファイル | ローカルとぶつかりやすい点 | マージ後に残すこと |
| --- | --- | --- |
| `AddContentModal.tsx` | 検索リスト・prefetch・フィルタ周り | `hits.map`（`hitsForList` に戻さない）。検索エラー＋再試行 UI |
| `ModrinthProvider.ts` | 独自の `mrFetch` / 429 / prefetch | タイムアウト（`timedSignal`）と rate-limit／一時障害の再試行を両立 |
| `LibraryDetailPage.tsx` | タブ構成・ContentTab の import | `ContentTab` は static import に戻さず lazy のまま |
| `ContentTab.tsx` | モーダル開閉・URL 同期 | 検索モーダル外周の ErrorBoundary |
| `ja.json` | 文言追加 | キーは双方採用で問題になりにくい |

## この差分で意図的に触っていないこと

- Modrinth 検索 UI の見た目やフィルタ仕様の作り直し
- CurseForge 復帰やコンテンツ機能の大規模リファクタ
- 上記 7 ファイル以外

ローカルの新機能・UI 変更は優先して残し、上記の「クラッシュ修正・隔離・API 耐性」だけを取り込んでください。
