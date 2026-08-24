; Fledge modern installer UI
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
  Var FledgeTermsCheck
  Var FledgeInstallDir
  Var FledgeDesktopCheck
  Var FledgeDesktopEnabled
  Var FledgeLaunchCheck
!endif

!macro customHeader
  !ifndef MUI_BGCOLOR
    !define MUI_BGCOLOR F7F9FC
  !endif
  !ifndef MUI_TEXTCOLOR
    !define MUI_TEXTCOLOR 1A2332
  !endif
  !ifndef MUI_INSTFILESPAGE_COLORS
    !define MUI_INSTFILESPAGE_COLORS "1A2332|F7F9FC"
  !endif
  !define MUI_FONT "Segoe UI"
  !define MUI_FONTSIZE 10
  !define MUI_ABORTWARNING
  BrandingText "Fledge by folne"
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customInit
    ReadRegStr $0 HKCU "Software\Fledge" "DesktopShortcut"
    ${If} $0 == "0"
      StrCpy $FledgeDesktopEnabled "0"
    ${Else}
      StrCpy $FledgeDesktopEnabled "1"
    ${EndIf}
  !macroend
!endif

; 常に現在のユーザー向け（「誰にインストールするか」ページを出さない）
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

!ifndef BUILD_UNINSTALLER

; 標準 Welcome/License の代わりに、余白とタイポグラフィを整えた専用ページを使う。
!macro customWelcomePage
  Page custom FledgeTermsPage FledgeTermsLeave
  Page custom FledgeOptionsPage FledgeOptionsLeave
!macroend

Function FledgeTermsPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 0 100% 22u "Fledge をインストール"
  Pop $1
  CreateFont $2 "Segoe UI" 18 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 27u 100% 18u "軽量で使いやすい Minecraft ランチャー"
  Pop $1
  SetCtlColors $1 64748B F7F9FC

  ${NSD_CreateText} 0 52u 100% 94u "利用規約の要点$\r$\n$\r$\n・Fledge は非公式の Minecraft ランチャーです。$\r$\n・Minecraft、Microsoft、導入する Mod の各規約を守って利用してください。$\r$\n・セーブデータ、設定、Mod の管理は利用者の責任です。$\r$\n・本アプリは現状有姿で提供され、データ損失等を保証しません。"
  Pop $1
  SendMessage $1 ${EM_SETREADONLY} 1 0
  SetCtlColors $1 334155 FFFFFF

  ${NSD_CreateLink} 0 151u 100% 14u "利用規約の全文をブラウザーで確認"
  Pop $1
  ${NSD_OnClick} $1 FledgeOpenTerms

  ${NSD_CreateCheckbox} 0 171u 100% 18u "利用規約を確認し、同意します"
  Pop $FledgeTermsCheck
  SetCtlColors $FledgeTermsCheck 1A2332 F7F9FC

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:次へ"
  nsDialogs::Show
FunctionEnd

Function FledgeOpenTerms
  ExecShell "open" "https://github.com/arula-folne/Fledge/blob/main/TERMS.md"
FunctionEnd

Function FledgeTermsLeave
  ${NSD_GetState} $FledgeTermsCheck $0
  ${If} $0 != ${BST_CHECKED}
    MessageBox MB_OK|MB_ICONEXCLAMATION "インストールを続けるには、利用規約への同意が必要です。"
    Abort
  ${EndIf}
FunctionEnd

Function FledgeOptionsPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 0 100% 22u "インストール設定"
  Pop $1
  CreateFont $2 "Segoe UI" 18 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 28u 100% 17u "保存場所とショートカットを選択してください。"
  Pop $1
  SetCtlColors $1 64748B F7F9FC

  ${NSD_CreateLabel} 0 58u 100% 15u "インストール場所"
  Pop $1
  SetCtlColors $1 334155 F7F9FC

  ${NSD_CreateDirRequest} 0 76u 78% 16u "$INSTDIR"
  Pop $FledgeInstallDir
  ${NSD_CreateBrowseButton} 81% 76u 19% 16u "参照…"
  Pop $1
  ${NSD_OnClick} $1 FledgeBrowseInstallDir

  ${NSD_CreateCheckbox} 0 115u 100% 18u "デスクトップに Fledge のアイコンを表示する"
  Pop $FledgeDesktopCheck
  ${If} $FledgeDesktopEnabled == "1"
    ${NSD_Check} $FledgeDesktopCheck
  ${EndIf}
  SetCtlColors $FledgeDesktopCheck 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 142u 100% 35u "Fledge は現在のユーザーにのみインストールされます。管理者権限は必要ありません。"
  Pop $1
  SetCtlColors $1 64748B F7F9FC

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:インストール"
  nsDialogs::Show
FunctionEnd

Function FledgeBrowseInstallDir
  ${NSD_GetText} $FledgeInstallDir $0
  nsDialogs::SelectFolderDialog "Fledge のインストール場所" "$0"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $FledgeInstallDir "$0"
  ${EndIf}
FunctionEnd

Function FledgeOptionsLeave
  ${NSD_GetText} $FledgeInstallDir $0
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "インストール場所を選択してください。"
    Abort
  ${EndIf}
  ; electron-builder 標準のディレクトリページと同様、アプリ名のサブフォルダに収める。
  StrLen $1 "${APP_FILENAME}"
  StrCpy $2 "$0" $1 -$1
  ${If} $2 != "${APP_FILENAME}"
    StrCpy $0 "$0\${APP_FILENAME}"
  ${EndIf}
  StrCpy $INSTDIR "$0"
  ${NSD_GetState} $FledgeDesktopCheck $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $FledgeDesktopEnabled "1"
  ${Else}
    StrCpy $FledgeDesktopEnabled "0"
  ${EndIf}
FunctionEnd

; electron-builder がショートカットを作成した直後に、ユーザーの選択を反映する。
!macro customInstall
  WriteRegStr HKCU "Software\Fledge" "DesktopShortcut" "$FledgeDesktopEnabled"
  ${If} $FledgeDesktopEnabled != "1"
    Delete "$newDesktopLink"
  ${EndIf}
!macroend

; 完了ページも専用 UI にし、起動するかを明示的に選べるようにする。
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 "--fledge-post-install"
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Page custom FledgeFinishPage FledgeFinishLeave
!macroend

Function FledgeFinishPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 15u 100% 28u "インストールが完了しました"
  Pop $1
  CreateFont $2 "Segoe UI" 19 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 1A2332 F7F9FC

  ${NSD_CreateLabel} 0 54u 100% 40u "Fledge をすぐに起動できます。$\r$\n設定はあとからアプリ内で変更できます。"
  Pop $1
  SetCtlColors $1 64748B F7F9FC

  ${NSD_CreateCheckbox} 0 112u 100% 20u "インストーラーを閉じたあと Fledge を起動する"
  Pop $FledgeLaunchCheck
  ${NSD_Check} $FledgeLaunchCheck
  SetCtlColors $FledgeLaunchCheck 1A2332 F7F9FC

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:完了"
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd

Function FledgeFinishLeave
  ${NSD_GetState} $FledgeLaunchCheck $0
  ${If} $0 == ${BST_CHECKED}
    Call StartApp
  ${EndIf}
FunctionEnd

!endif

; Data/ と Instances/ は実行後に作られるため、標準アンインストールでは残る
!macro customUnInstall
  RMDir /r "$INSTDIR\Data"
  RMDir /r "$INSTDIR\Instances"
  Delete "$INSTDIR\Fledge-first-run.cmd"
  DeleteRegKey HKCU "Software\Fledge"
  RMDir /r "$INSTDIR"
!macroend
