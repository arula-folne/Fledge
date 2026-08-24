; Fledge modern installer UI (Modrinth-inspired: clean, compact, one clear CTA)
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
  Var FledgeTermsCheck
  Var FledgeInstallDir
  Var FledgeDesktopCheck
  Var FledgeDesktopEnabled
  Var FledgeLaunchCheck
  Var FledgeDialog
!endif

!macro customHeader
  !ifndef MUI_BGCOLOR
    !define MUI_BGCOLOR F8FAFC
  !endif
  !ifndef MUI_TEXTCOLOR
    !define MUI_TEXTCOLOR 0F172A
  !endif
  !ifndef MUI_INSTFILESPAGE_COLORS
    !define MUI_INSTFILESPAGE_COLORS "0F172A|F8FAFC"
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

; 同意チェックで「次へ」を有効化する（未同意では進めない）
Function FledgeTermsCheckChange
  ${NSD_GetState} $FledgeTermsCheck $0
  GetDlgItem $1 $HWNDPARENT 1
  ${If} $0 == ${BST_CHECKED}
    EnableWindow $1 1
  ${Else}
    EnableWindow $1 0
  ${EndIf}
FunctionEnd

Function FledgeTermsPage
  nsDialogs::Create 1018
  Pop $FledgeDialog
  ${If} $FledgeDialog == error
    Abort
  ${EndIf}
  SetCtlColors $FledgeDialog 0F172A F8FAFC

  ; --- 見出し ---
  ${NSD_CreateLabel} 0 0 100% 20u "Fledge へようこそ"
  Pop $1
  CreateFont $2 "Segoe UI" 16 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 0F172A F8FAFC

  ${NSD_CreateLabel} 0 22u 100% 14u "軽量でシンプルな Minecraft ランチャー"
  Pop $1
  SetCtlColors $1 64748B F8FAFC

  ; --- 利用規約カード（高さを抑え、同意チェックが必ず見えるようにする） ---
  ${NSD_CreateLabel} 0 44u 100% 12u "利用規約"
  Pop $1
  CreateFont $2 "Segoe UI" 10 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 0F172A F8FAFC

  ${NSD_CreateLabel} 0 58u 100% 36u "・非公式の Minecraft ランチャーです$\r$\n・Minecraft / Microsoft / Mod 各規約を守ってください$\r$\n・セーブや設定の管理は利用者の責任です（現状有姿）"
  Pop $1
  SetCtlColors $1 334155 F8FAFC

  ${NSD_CreateLink} 0 98u 100% 12u "利用規約の全文をブラウザーで開く"
  Pop $1
  ${NSD_OnClick} $1 FledgeOpenTerms

  ; Checkbox に SetCtlColors するとテーマ下で押せなくなることがあるため付けない
  ${NSD_CreateCheckbox} 0 118u 100% 16u "利用規約を確認し、同意します"
  Pop $FledgeTermsCheck
  ${NSD_OnClick} $FledgeTermsCheck FledgeTermsCheckChange

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:次へ"
  EnableWindow $0 0
  nsDialogs::Show
FunctionEnd

Function FledgeOpenTerms
  ExecShell "open" "https://github.com/arula-folne/Fledge/blob/main/TERMS.md"
FunctionEnd

Function FledgeTermsLeave
  ${NSD_GetState} $FledgeTermsCheck $0
  ${If} $0 != ${BST_CHECKED}
    MessageBox MB_OK|MB_ICONEXCLAMATION "インストールを続けるには、下の「利用規約を確認し、同意します」にチェックを入れてください。"
    Abort
  ${EndIf}
FunctionEnd

Function FledgeOptionsPage
  nsDialogs::Create 1018
  Pop $FledgeDialog
  ${If} $FledgeDialog == error
    Abort
  ${EndIf}
  SetCtlColors $FledgeDialog 0F172A F8FAFC

  ${NSD_CreateLabel} 0 0 100% 20u "インストール設定"
  Pop $1
  CreateFont $2 "Segoe UI" 16 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 0F172A F8FAFC

  ${NSD_CreateLabel} 0 22u 100% 14u "保存場所とショートカットを選べます"
  Pop $1
  SetCtlColors $1 64748B F8FAFC

  ${NSD_CreateLabel} 0 46u 100% 12u "インストール場所"
  Pop $1
  CreateFont $2 "Segoe UI" 9 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 334155 F8FAFC

  ${NSD_CreateDirRequest} 0 60u 76% 14u "$INSTDIR"
  Pop $FledgeInstallDir
  ${NSD_CreateBrowseButton} 78% 60u 22% 14u "参照"
  Pop $1
  ${NSD_OnClick} $1 FledgeBrowseInstallDir

  ${NSD_CreateCheckbox} 0 88u 100% 16u "デスクトップにショートカットを作成する"
  Pop $FledgeDesktopCheck
  ${If} $FledgeDesktopEnabled == "1"
    ${NSD_Check} $FledgeDesktopCheck
  ${EndIf}

  ${NSD_CreateLabel} 0 112u 100% 24u "現在のユーザーにのみインストールされます。管理者権限は不要です。"
  Pop $1
  SetCtlColors $1 64748B F8FAFC

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:インストール"
  EnableWindow $0 1
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
  Pop $FledgeDialog
  ${If} $FledgeDialog == error
    Abort
  ${EndIf}
  SetCtlColors $FledgeDialog 0F172A F8FAFC

  ${NSD_CreateLabel} 0 8u 100% 22u "準備完了"
  Pop $1
  CreateFont $2 "Segoe UI" 16 600
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 0F172A F8FAFC

  ${NSD_CreateLabel} 0 36u 100% 28u "Fledge のインストールが完了しました。$\r$\n設定はあとからアプリ内で変更できます。"
  Pop $1
  SetCtlColors $1 64748B F8FAFC

  ${NSD_CreateCheckbox} 0 78u 100% 16u "閉じたあと Fledge を起動する"
  Pop $FledgeLaunchCheck
  ${NSD_Check} $FledgeLaunchCheck

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:完了"
  EnableWindow $0 1
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
