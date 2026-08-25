; Fledge NSIS hooks
; 手順: 利用規約(ラジオ) → インストール先 → ショートカット/起動 → 完了

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"

  ; 利用規約ページを同意/不同意のラジオボタンにする（licensePage 挿入より前に定義）
  !define MUI_LICENSEPAGE_RADIOBUTTONS
  !define MUI_LICENSEPAGE_RADIOBUTTONS_TEXT_ACCEPT "利用規約に同意する"
  !define MUI_LICENSEPAGE_RADIOBUTTONS_TEXT_DECLINE "利用規約に同意しない"

  Var fledgeDesktopShortcut
  Var fledgeRunAfter
  Var fledgeDesktopCheckbox
  Var fledgeRunCheckbox
!endif

!macro customHeader
  SetFont "Yu Gothic UI" 9
  !define MUI_ABORTWARNING
  BrandingText "Fledge by folne"
!macroend

; 常に現在のユーザー向け（「誰にインストールするか」ページを出さない）
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customInit
    StrCpy $fledgeDesktopShortcut "1"
    StrCpy $fledgeRunAfter "1"
  !macroend

  ; ディレクトリ選択のあと: ショートカット / 起動するか
  ; ※ Function は MUI2 読み込み後に展開されるようマクロ内に置く
  !macro customPageAfterChangeDir
    Page custom fledgeOptionsPageCreate fledgeOptionsPageLeave

    Function fledgeOptionsPageCreate
      ${if} ${isUpdated}
        Abort
      ${endif}

      !insertmacro MUI_HEADER_TEXT "追加オプション" "ショートカットと起動の設定を選べます"

      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0 100% 24u "インストール後の動作を選択してください。"
      Pop $0

      ${NSD_CreateCheckbox} 0 36u 100% 14u "デスクトップに Fledge のショートカットを作成する"
      Pop $fledgeDesktopCheckbox
      ${If} $fledgeDesktopShortcut == "1"
        ${NSD_Check} $fledgeDesktopCheckbox
      ${EndIf}

      ${NSD_CreateCheckbox} 0 56u 100% 14u "インストール完了後に Fledge を起動する"
      Pop $fledgeRunCheckbox
      ${If} $fledgeRunAfter == "1"
        ${NSD_Check} $fledgeRunCheckbox
      ${EndIf}

      nsDialogs::Show
    FunctionEnd

    Function fledgeOptionsPageLeave
      ${NSD_GetState} $fledgeDesktopCheckbox $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $fledgeDesktopShortcut "1"
      ${Else}
        StrCpy $fledgeDesktopShortcut "0"
      ${EndIf}

      ${NSD_GetState} $fledgeRunCheckbox $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $fledgeRunAfter "1"
      ${Else}
        StrCpy $fledgeRunAfter "0"
      ${EndIf}
    FunctionEnd
  !macroend

  ; デスクトップショートカットをオフにした場合は作成後に削除
  !macro customInstall
    ${If} $fledgeDesktopShortcut == "0"
      ${If} $newDesktopLink != ""
        Delete "$newDesktopLink"
      ${EndIf}
    ${EndIf}
  !macroend

  ; 完了ページには起動チェックを出さず、前ページの選択に従って起動する
  !macro customFinishPage
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 "--fledge-post-install"
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    Function fledgeFinishLeave
      ${If} $fledgeRunAfter == "1"
        Call StartApp
      ${EndIf}
    FunctionEnd

    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE fledgeFinishLeave
    !insertmacro MUI_PAGE_FINISH
  !macroend
!endif

; Data/ と Instances/ は実行後に作られるため、標準アンインストールでは残る
!macro customUnInstall
  RMDir /r "$INSTDIR\Data"
  RMDir /r "$INSTDIR\Instances"
  Delete "$INSTDIR\Fledge-first-run.cmd"
  DeleteRegKey HKCU "Software\Fledge"
  RMDir /r "$INSTDIR"
!macroend
