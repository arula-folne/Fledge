import { create } from 'zustand'

/**
 * 開発ビルド専用のデバッグ表示フラグ。
 * 製品ビルドでは設定 UI ごと出さない（import.meta.env.DEV でガード）。
 */
type DebugStore = {
  /** ライブラリグリッドの列数オーバーレイ */
  libraryGridDebug: boolean
  /** 空でも仮インスタンスを表示 */
  libraryPlaceholders: boolean
  /** 先頭カードで作成中ぐるぐるをプレビュー */
  createSpinPreview: boolean
  /** 起動プログレス UI プレビュー */
  launchProgressPreview: boolean
  /** 起動エラー「！」プレビュー */
  launchErrorPreview: boolean
  setLibraryGridDebug: (v: boolean) => void
  setLibraryPlaceholders: (v: boolean) => void
  setCreateSpinPreview: (v: boolean) => void
  setLaunchProgressPreview: (v: boolean) => void
  setLaunchErrorPreview: (v: boolean) => void
}

export const useDebugStore = create<DebugStore>((set) => ({
  libraryGridDebug: false,
  libraryPlaceholders: false,
  createSpinPreview: false,
  launchProgressPreview: false,
  launchErrorPreview: false,
  setLibraryGridDebug: (libraryGridDebug) => set({ libraryGridDebug }),
  setLibraryPlaceholders: (libraryPlaceholders) => set({ libraryPlaceholders }),
  setCreateSpinPreview: (createSpinPreview) => set({ createSpinPreview }),
  setLaunchProgressPreview: (launchProgressPreview) => set({ launchProgressPreview }),
  setLaunchErrorPreview: (launchErrorPreview) => set({ launchErrorPreview }),
}))
