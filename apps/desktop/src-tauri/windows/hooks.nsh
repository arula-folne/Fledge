; Fledge Tauri NSIS hooks
; - Resize installer window to 16:10 without stretching sidebar/header bitmaps
;   (MUI bitmap controls stay at fixed dialog-units; images keep 164x314 / 150x57)
; - Wipe identity + INSTDIR on real uninstall (not /UPDATE)

; Outer window 16:10 (includes title bar / frame)
!define FLEDGE_INSTALLER_W 680
!define FLEDGE_INSTALLER_H 425

; Must be defined before MUI pages (this file is !include'd early by Tauri).
!define MUI_CUSTOMFUNCTION_GUIINIT FledgeOnGuiInit

Function FledgeOnGuiInit
  ; Enlarge outer window to 16:10 and center it.
  ; Child dialog / bitmap controls keep MUI fixed sizes → image aspect unchanged.
  Push $0
  Push $1
  Push $2
  Push $3
  System::Call 'user32::GetSystemMetrics(i 0) i .r2' ; SM_CXSCREEN
  System::Call 'user32::GetSystemMetrics(i 1) i .r3' ; SM_CYSCREEN
  IntOp $0 $2 - ${FLEDGE_INSTALLER_W}
  IntOp $0 $0 / 2
  IntOp $1 $3 - ${FLEDGE_INSTALLER_H}
  IntOp $1 $1 / 2
  ; SWP_NOZORDER = 4
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i $0, i $1, i ${FLEDGE_INSTALLER_W}, i ${FLEDGE_INSTALLER_H}, i 4)'
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

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
