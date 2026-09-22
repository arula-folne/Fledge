; Fledge Tauri NSIS hooks
; Wipe identity data on real uninstall (not /UPDATE). Paths must not collide with INSTDIR
; ($LOCALAPPDATA\Fledge) — use fledge-updater and %APPDATA%\fledge instead.
;
; Tauri 本体は INSTDIR を空のときだけ RMDir するため、data/ 等が残ると ○○\Fledge が消えない。
; POSTUNINSTALL で INSTDIR ごと再帰削除する。

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    ; Install tree（選択パスの ○○\Fledge と中の data / instances など）
    RMDir /r "$INSTDIR"
    ; Settings + MSA tokens (dirs::config_dir\fledge)
    RMDir /r "$APPDATA\fledge"
    RMDir /r "$APPDATA\Fledge"
    ; Updater staging (must stay outside INSTDIR)
    RMDir /r "$LOCALAPPDATA\fledge-updater"
    ; Tauri identifier / WebView2 profile
    RMDir /r "$APPDATA\net.folne.fledge"
    RMDir /r "$LOCALAPPDATA\net.folne.fledge"
    DeleteRegKey HKCU "Software\Fledge"
  ${EndIf}
!macroend
