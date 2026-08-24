; electron-builder NSIS カスタム手順

; UI トーン（Fledge ライトテーマ寄り）
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
!macroend

; 常に現在のユーザー向け（「誰にインストールするか」ページを出さない）
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

; 完了チェック時: インストーラー終了後に軽量フラグ付きで起動（NSIS UI と Electron の競合を避ける）
!macro customInstall
  FileOpen $0 "$INSTDIR\Fledge-first-run.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "set ARGS=%*$\r$\n"
  FileWrite $0 "ping -n 2 127.0.0.1 >nul$\r$\n"
  FileWrite $0 'start "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" %ARGS%$\r$\n'
  FileWrite $0 'del /f /q "%~f0" >nul 2>&1$\r$\n'
  FileClose $0
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 "--fledge-post-install"
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\Fledge-first-run.cmd" "open" "$1"
  FunctionEnd

  !ifndef HIDE_RUN_AFTER_FINISH
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !insertmacro MUI_PAGE_FINISH
!macroend

; Data/ と Instances/ は実行後に作られるため、標準アンインストールでは残る
!macro customUnInstall
  RMDir /r "$INSTDIR\Data"
  RMDir /r "$INSTDIR\Instances"
  Delete "$INSTDIR\Fledge-first-run.cmd"
  RMDir /r "$INSTDIR"
!macroend
