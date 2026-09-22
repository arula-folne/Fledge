; Fledge Tauri NSIS hooks
; - 16:10 window + filled content area (minimal Win32 calls — heavy System::Call
;   patterns were flagged as Trojan:Win32/Wacatac.B!ml by Defender ML)
; - Sidebar/header bitmap control sizes unchanged (art aspect preserved)
; - Wipe identity + INSTDIR on real uninstall (not /UPDATE)

!define FLEDGE_INSTALLER_W 680
!define FLEDGE_INSTALLER_H 425

!define MUI_CUSTOMFUNCTION_GUIINIT FledgeOnGuiInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.FledgeOnGuiInit

; $R8=dW $R9=dH — grow control width/height (top-left fixed)
!macro FledgeGrow id dW dH
  GetDlgItem $R6 $HWNDPARENT ${id}
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetWindowRect(p$R6,pr1)'
  System::Call 'user32::MapWindowPoints(p0,p$HWNDPARENT,pr1,i2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + ${dW}
  IntOp $7 $7 + ${dH}
  System::Call 'user32::SetWindowPos(p$R6,p0,i$2,i$3,i$0,i$7,i0x14)'
  System::Free $1
!macroend

; $R8=dW $R9=dH — move control (keep size)
!macro FledgeMove id dW dH
  GetDlgItem $R6 $HWNDPARENT ${id}
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetWindowRect(p$R6,pr1)'
  System::Call 'user32::MapWindowPoints(p0,p$HWNDPARENT,pr1,i2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $2 $2 + ${dW}
  IntOp $3 $3 + ${dH}
  System::Call 'user32::SetWindowPos(p$R6,p0,i$2,i$3,i$0,i$7,i0x14)'
  System::Free $1
!macroend

; grow width + move down
!macro FledgeGrowWMoveDown id dW dH
  GetDlgItem $R6 $HWNDPARENT ${id}
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetWindowRect(p$R6,pr1)'
  System::Call 'user32::MapWindowPoints(p0,p$HWNDPARENT,pr1,i2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + ${dW}
  IntOp $3 $3 + ${dH}
  System::Call 'user32::SetWindowPos(p$R6,p0,i$2,i$3,i$0,i$7,i0x14)'
  System::Free $1
!macroend

!macro FledgeOnGuiInitBody
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetClientRect(p$HWNDPARENT,pr1)'
  System::Call '*$1(i,i,i.r2,i.r3)'

  System::Call 'user32::GetSystemMetrics(i0)i.r4'
  System::Call 'user32::GetSystemMetrics(i1)i.r5'
  IntOp $6 $4 - ${FLEDGE_INSTALLER_W}
  IntOp $6 $6 / 2
  IntOp $7 $5 - ${FLEDGE_INSTALLER_H}
  IntOp $7 $7 / 2
  System::Call 'user32::SetWindowPos(p$HWNDPARENT,p0,i$6,i$7,i${FLEDGE_INSTALLER_W},i${FLEDGE_INSTALLER_H},i4)'

  System::Call 'user32::GetClientRect(p$HWNDPARENT,pr1)'
  System::Call '*$1(i,i,i.r4,i.r5)'
  IntOp $R8 $4 - $2
  IntOp $R9 $5 - $3
  System::Free $1

  ${If} $R8 = 0
  ${AndIf} $R9 = 0
    Return
  ${EndIf}

  ; Content hosts
  !insertmacro FledgeGrow 1044 $R8 $R9
  !insertmacro FledgeGrow 1018 $R8 $R9
  ; Header strip (width only) + under-header line
  !insertmacro FledgeGrow 1034 $R8 0
  !insertmacro FledgeGrow 1036 $R8 0
  !insertmacro FledgeGrow 1037 $R8 0
  !insertmacro FledgeGrow 1038 $R8 0
  ; Buttons
  !insertmacro FledgeMove 1 $R8 $R9
  !insertmacro FledgeMove 2 $R8 $R9
  !insertmacro FledgeMove 3 $R8 $R9
  ; Lines + branding
  !insertmacro FledgeGrowWMoveDown 1045 $R8 $R9
  !insertmacro FledgeGrowWMoveDown 1035 $R8 $R9
  !insertmacro FledgeGrowWMoveDown 1028 $R8 $R9
  !insertmacro FledgeGrowWMoveDown 1256 $R8 $R9
!macroend

Function FledgeOnGuiInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $R6
  Push $R8
  Push $R9
  !insertmacro FledgeOnGuiInitBody
  Pop $R9
  Pop $R8
  Pop $R6
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function un.FledgeOnGuiInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $R6
  Push $R8
  Push $R9
  !insertmacro FledgeOnGuiInitBody
  Pop $R9
  Pop $R8
  Pop $R6
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    RMDir /r "$INSTDIR"
    RMDir /r "$APPDATA\fledge"
    RMDir /r "$APPDATA\Fledge"
    RMDir /r "$LOCALAPPDATA\fledge-updater"
    RMDir /r "$APPDATA\net.folne.fledge"
    RMDir /r "$LOCALAPPDATA\net.folne.fledge"
    DeleteRegKey HKCU "Software\Fledge"
  ${EndIf}
!macroend
