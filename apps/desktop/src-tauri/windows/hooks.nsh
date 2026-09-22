; Fledge Tauri NSIS hooks
; Wipe identity data on real uninstall (not /UPDATE). Paths must not collide with INSTDIR
; ($LOCALAPPDATA\Fledge) — use fledge-updater and %APPDATA%\fledge instead.

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
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
