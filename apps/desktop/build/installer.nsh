; Fledge NSIS hooks — 標準の文字ベース UI を使い、必要な挙動だけ足す
!include "LogicLib.nsh"

!macro customHeader
  !define MUI_ABORTWARNING
  BrandingText "Fledge by folne"
!macroend

; 常に現在のユーザー向け（「誰にインストールするか」ページを出さない）
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

; 標準の完了ページを使い、初回起動だけ軽量フラグを付ける
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 "--fledge-post-install"
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
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
  DeleteRegKey HKCU "Software\Fledge"
  RMDir /r "$INSTDIR"
!macroend
