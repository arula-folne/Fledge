; Fledge Tauri NSIS hooks
; - Resize installer to 16:10 and expand the inner display area (not just the frame)
; - Sidebar / header bitmaps keep their pixel aspect (not distorted)
; - Wipe identity + INSTDIR on real uninstall (not /UPDATE)

!define FLEDGE_INSTALLER_W 680
!define FLEDGE_INSTALLER_H 425

; Prefer aspect-preserving stretch if a control is taller than the bitmap.
!define MUI_WELCOMEFINISHPAGE_BITMAP_STRETCH AspectFitHeight

; Declare Welcome vars before MUI pages so FledgeWelcomeShow can reference them.
; (Tauri includes this file before !insertmacro MUI_PAGE_WELCOME.)
!ifndef MUI_WELCOMEPAGE_INTERFACE
  !define MUI_WELCOMEPAGE_INTERFACE
  Var mui.WelcomePage
  Var mui.WelcomePage.Image
  Var mui.WelcomePage.Image.Bitmap
  Var mui.WelcomePage.Title
  Var mui.WelcomePage.Title.Font
  Var mui.WelcomePage.Text
!endif

; Must be defined before MUI pages (this file is !include'd early by Tauri).
!define MUI_CUSTOMFUNCTION_GUIINIT FledgeOnGuiInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.FledgeOnGuiInit

; Welcome page SHOW (first page that supports SHOW = Welcome).
!define MUI_PAGE_CUSTOMFUNCTION_SHOW FledgeWelcomeShow

; Shared layout body (installer + uninstaller).
; Expects working registers; uses $R6=hwnd $R8=dW $R9=dH.
!macro FledgeRelayoutChildrenBody
  ${If} $R8 = 0
  ${AndIf} $R9 = 0
    Return
  ${EndIf}

  ; Buttons — bottom-right
  GetDlgItem $R6 $HWNDPARENT 1
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $2 $2 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 2
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $2 $2 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 3
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $2 $2 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'

  ; Full-window page host + standard content host — grow
  GetDlgItem $R6 $HWNDPARENT 1044
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  IntOp $7 $7 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1018
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  IntOp $7 $7 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'

  ; Header bg / under-header line / titles — grow width
  GetDlgItem $R6 $HWNDPARENT 1034
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1036
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1037
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1038
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'

  ; Header bitmap — keep size/aspect; shift if right-anchored
  GetDlgItem $R6 $HWNDPARENT 1046
  ${If} $R6 != 0
    System::Call 'user32::GetClientRect(p $HWNDPARENT, p r1)'
    System::Call '*$1(i,i,i.r2,i.r3)'
    IntOp $0 $2 / 2
    System::Call 'user32::GetWindowRect(p $R6, p r1)'
    System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
    System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
    ${If} $2 > $0
      IntOp $7 $4 - $2
      IntOp $0 $5 - $3
      IntOp $2 $2 + $R8
      System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $7, i $0, i 0x14)'
    ${EndIf}
  ${EndIf}

  ; Lines + branding — grow width, move down
  GetDlgItem $R6 $HWNDPARENT 1045
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1035
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1028
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  GetDlgItem $R6 $HWNDPARENT 1256
  System::Call 'user32::GetWindowRect(p $R6, p r1)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r1, i 2)'
  System::Call '*$1(i.r2,i.r3,i.r4,i.r5)'
  IntOp $0 $4 - $2
  IntOp $7 $5 - $3
  IntOp $0 $0 + $R8
  IntOp $3 $3 + $R9
  System::Call 'user32::SetWindowPos(p $R6, p 0, i $2, i $3, i $0, i $7, i 0x14)'
  System::Free $1
!macroend

!macro FledgeOnGuiInitBody
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p r1)'
  System::Call '*$1(i,i,i.r2,i.r3)'

  System::Call 'user32::GetSystemMetrics(i 0) i .r4'
  System::Call 'user32::GetSystemMetrics(i 1) i .r5'
  IntOp $6 $4 - ${FLEDGE_INSTALLER_W}
  IntOp $6 $6 / 2
  IntOp $7 $5 - ${FLEDGE_INSTALLER_H}
  IntOp $7 $7 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i $6, i $7, i ${FLEDGE_INSTALLER_W}, i ${FLEDGE_INSTALLER_H}, i 4)'

  System::Call 'user32::GetClientRect(p $HWNDPARENT, p r1)'
  System::Call '*$1(i,i,i.r4,i.r5)'
  IntOp $R8 $4 - $2
  IntOp $R9 $5 - $3
  System::Free $1

  !insertmacro FledgeRelayoutChildrenBody
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

Function FledgeWelcomeShow
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7

  ${If} $mui.WelcomePage == 0
    Goto fledge_welcome_done
  ${EndIf}

  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetClientRect(p $mui.WelcomePage, p r1)'
  System::Call '*$1(i,i,i.r2,i.r3)'

  ${If} $mui.WelcomePage.Title != 0
    System::Call 'user32::GetWindowRect(p $mui.WelcomePage.Title, p r1)'
    System::Call 'user32::MapWindowPoints(p 0, p $mui.WelcomePage, p r1, i 2)'
    System::Call '*$1(i.r4,i.r5,i.r6,i.r7)'
    IntOp $6 $2 - $4
    IntOp $6 $6 - 12
    IntOp $7 $7 - $5
    ${If} $6 > 40
      System::Call 'user32::SetWindowPos(p $mui.WelcomePage.Title, p 0, i $4, i $5, i $6, i $7, i 0x14)'
    ${EndIf}
  ${EndIf}

  ${If} $mui.WelcomePage.Text != 0
    System::Call 'user32::GetWindowRect(p $mui.WelcomePage.Text, p r1)'
    System::Call 'user32::MapWindowPoints(p 0, p $mui.WelcomePage, p r1, i 2)'
    System::Call '*$1(i.r4,i.r5,i.r6,i.r7)'
    IntOp $6 $2 - $4
    IntOp $6 $6 - 12
    IntOp $0 $3 - $5
    IntOp $0 $0 - 12
    ${If} $6 > 40
    ${AndIf} $0 > 40
      System::Call 'user32::SetWindowPos(p $mui.WelcomePage.Text, p 0, i $4, i $5, i $6, i $0, i 0x14)'
    ${EndIf}
  ${EndIf}

  System::Free $1

  fledge_welcome_done:
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
