; Fledge NSIS hooks
; Flow: license (radio) -> install dir -> shortcut/launch -> finish
; Keep UTF-8 BOM. Japanese UI uses ${U+XXXX} to avoid mojibake.

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"

  !define MUI_LICENSEPAGE_RADIOBUTTONS
  !define MUI_LICENSEPAGE_RADIOBUTTONS_TEXT_ACCEPT "${U+5229}${U+7528}${U+898F}${U+7D04}${U+306B}${U+540C}${U+610F}${U+3059}${U+308B}"
  !define MUI_LICENSEPAGE_RADIOBUTTONS_TEXT_DECLINE "${U+5229}${U+7528}${U+898F}${U+7D04}${U+306B}${U+540C}${U+610F}${U+3057}${U+306A}${U+3044}"

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

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customInit
    StrCpy $fledgeDesktopShortcut "1"
    StrCpy $fledgeRunAfter "1"
  !macroend

  !macro customPageAfterChangeDir
    Page custom fledgeOptionsPageCreate fledgeOptionsPageLeave

    Function fledgeOptionsPageCreate
      ${if} ${isUpdated}
        Abort
      ${endif}

      !insertmacro MUI_HEADER_TEXT "${U+8FFD}${U+52A0}${U+30AA}${U+30D7}${U+30B7}${U+30E7}${U+30F3}" "${U+30B7}${U+30E7}${U+30FC}${U+30C8}${U+30AB}${U+30C3}${U+30C8}${U+3068}${U+8D77}${U+52D5}${U+306E}${U+8A2D}${U+5B9A}${U+3092}${U+9078}${U+3079}${U+307E}${U+3059}"

      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0 100% 24u "${U+30A4}${U+30F3}${U+30B9}${U+30C8}${U+30FC}${U+30EB}${U+5F8C}${U+306E}${U+52D5}${U+4F5C}${U+3092}${U+9078}${U+629E}${U+3057}${U+3066}${U+304F}${U+3060}${U+3055}${U+3044}${U+3002}"
      Pop $0

      ${NSD_CreateCheckbox} 0 36u 100% 14u "${U+30C7}${U+30B9}${U+30AF}${U+30C8}${U+30C3}${U+30D7}${U+306B} Fledge ${U+306E}${U+30B7}${U+30E7}${U+30FC}${U+30C8}${U+30AB}${U+30C3}${U+30C8}${U+3092}${U+4F5C}${U+6210}${U+3059}${U+308B}"
      Pop $fledgeDesktopCheckbox
      ${If} $fledgeDesktopShortcut == "1"
        ${NSD_Check} $fledgeDesktopCheckbox
      ${EndIf}

      ${NSD_CreateCheckbox} 0 56u 100% 14u "${U+30A4}${U+30F3}${U+30B9}${U+30C8}${U+30FC}${U+30EB}${U+5B8C}${U+4E86}${U+5F8C}${U+306B} Fledge ${U+3092}${U+8D77}${U+52D5}${U+3059}${U+308B}"
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

  ; Electron 本体（dll / pak / dat 等）は data\meta\runtime へ。ルートは Fledge.exe（起動）と Uninstall と data のみ。
  !macro fledgeRelocateRuntime
    RMDir /r "$INSTDIR\data\meta\runtime"
    CreateDirectory "$INSTDIR\data"
    CreateDirectory "$INSTDIR\data\meta"
    CreateDirectory "$INSTDIR\data\meta\runtime"
    CreateDirectory "$INSTDIR\data\meta\java"
    CreateDirectory "$INSTDIR\data\instances"
    CreateDirectory "$INSTDIR\data\caches"
    CreateDirectory "$INSTDIR\data\skins"
    CreateDirectory "$INSTDIR\data\temp"

    File "/oname=$PLUGINSDIR\fledge-relocate.cmd" "${BUILD_RESOURCES_DIR}\relocate-runtime.cmd"
    nsExec::ExecToLog '"$PLUGINSDIR\fledge-relocate.cmd" "$INSTDIR"'
    Pop $0

    IfFileExists "$INSTDIR\data-root.json" 0 fledge_skip_move_pointer
      Rename "$INSTDIR\data-root.json" "$INSTDIR\data\data-root.json"
    fledge_skip_move_pointer:

    ${If} ${FileExists} "$INSTDIR\_fledge-launch.exe"
      Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      Rename "$INSTDIR\_fledge-launch.exe" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
  !macroend

  !macro customInstall
    !insertmacro fledgeRelocateRuntime
    StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

    ${If} $newStartMenuLink != ""
      Delete "$newStartMenuLink"
      ${If} ${FileExists} "$appExe"
        CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ${EndIf}
    ${EndIf}

    ${If} $fledgeDesktopShortcut == "1"
      ${If} $newDesktopLink != ""
        Delete "$newDesktopLink"
        ${If} ${FileExists} "$appExe"
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ${EndIf}
      ${EndIf}
    ${Else}
      ${If} $newDesktopLink != ""
        Delete "$newDesktopLink"
      ${EndIf}
    ${EndIf}

    ${If} ${FileExists} "$newStartMenuLink"
      StrCpy $launchLink "$newStartMenuLink"
    ${ElseIf} ${FileExists} "$newDesktopLink"
      StrCpy $launchLink "$newDesktopLink"
    ${Else}
      StrCpy $launchLink "$appExe"
    ${EndIf}
  !macroend

  !macro customFinishPage
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 "--fledge-post-install"
      ${endif}
      StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ${If} ${FileExists} "$newStartMenuLink"
        StrCpy $launchLink "$newStartMenuLink"
      ${Else}
        StrCpy $launchLink "$appExe"
      ${EndIf}
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

!macro customUnInstall
  ; アプリ内更新時は旧版アンインストール段階でも走る。Data/Instances はユーザー操作のアンインストール時のみ削除する。
  ${ifNot} ${isUpdated}
    RMDir /r "$INSTDIR\Data"
    RMDir /r "$INSTDIR\Instances"
    RMDir /r "$INSTDIR\data"
    RMDir /r "$INSTDIR\instances"
    RMDir /r "$INSTDIR\profiles"
    RMDir /r "$INSTDIR\Instance"
    RMDir /r "$INSTDIR\app"
    Delete "$INSTDIR\data-root.json"
    Delete "$INSTDIR\Fledge-first-run.cmd"
    DeleteRegKey HKCU "Software\Fledge"
    RMDir /r "$INSTDIR"
  ${endIf}
!macroend

; electron-builder 既定は更新時に INSTDIR 一式を一時退避してから丸ごと削除する。
; exe 横のレガシー Data/Instances / data-root.json を退避→復元（Modrinth 型移行ユーザー向け）。
; 退避に失敗したまま RMDir するとデータ消失になるため、失敗時は更新を中断する。
!macro fledgeAbortUpdatePreserveFailed
  ${ifNot} ${Silent}
    MessageBox MB_OK|MB_ICONSTOP "${U+66F4}${U+65B0}${U+3092}${U+4E2D}${U+65AD}${U+3057}${U+307E}${U+3057}${U+305F}${U+3002}${U+30C7}${U+30FC}${U+30BF}${U+306E}${U+4FDD}${U+5B58}${U+306B}${U+5931}${U+6557}${U+3057}${U+307E}${U+3057}${U+305F}${U+3002} Fledge ${U+3092}${U+9589}${U+3058}${U+3066}${U+3082}${U+3046}${U+4E00}${U+5EA6}${U+304A}${U+8A66}${U+3057}${U+304F}${U+3060}${U+3055}${U+3044}${U+3002}"
  ${endIf}
  Abort
!macroend

!macro fledgePreserveDir src dest skipLabel
  IfFileExists "${src}" 0 ${skipLabel}
    Rename "${src}" "${dest}"
    IfErrors 0 ${skipLabel}_done
    IfFileExists "${dest}" 0 ${skipLabel}_fail
    IfFileExists "${src}" 0 ${skipLabel}_done
    ${skipLabel}_fail:
      !insertmacro fledgeAbortUpdatePreserveFailed
    ${skipLabel}_done:
  ${skipLabel}:
!macroend

!macro fledgePreserveFile src dest skipLabel
  IfFileExists "${src}" 0 ${skipLabel}
    Rename "${src}" "${dest}"
    IfErrors 0 ${skipLabel}_done
    IfFileExists "${dest}" 0 ${skipLabel}_fail
    IfFileExists "${src}" 0 ${skipLabel}_done
    ${skipLabel}_fail:
      !insertmacro fledgeAbortUpdatePreserveFailed
    ${skipLabel}_done:
  ${skipLabel}:
!macroend

!macro customRemoveFiles
  ${if} ${isUpdated}
    ; runtime を先に消すと、退避失敗時に起動不能になる。data ごと退避し、
    ; 新 runtime は customInstall の fledgeRelocateRuntime が入れ替える。
    !insertmacro fledgePreserveDir "$INSTDIR\Data" "$PLUGINSDIR\fledge-keep-Data" fledge_skip_keep_data
    !insertmacro fledgePreserveDir "$INSTDIR\Instances" "$PLUGINSDIR\fledge-keep-Instances" fledge_skip_keep_instances
    !insertmacro fledgePreserveDir "$INSTDIR\data" "$PLUGINSDIR\fledge-keep-data-new" fledge_skip_keep_data_new
    !insertmacro fledgePreserveDir "$INSTDIR\instances" "$PLUGINSDIR\fledge-keep-instances-new" fledge_skip_keep_instances_new
    !insertmacro fledgePreserveDir "$INSTDIR\profiles" "$PLUGINSDIR\fledge-keep-profiles" fledge_skip_keep_profiles
    !insertmacro fledgePreserveDir "$INSTDIR\Instance" "$PLUGINSDIR\fledge-keep-Instance" fledge_skip_keep_Instance
    !insertmacro fledgePreserveFile "$INSTDIR\data-root.json" "$PLUGINSDIR\fledge-keep-data-root.json" fledge_skip_keep_pointer
    RMDir /r "$INSTDIR"
    CreateDirectory "$INSTDIR"
    IfFileExists "$PLUGINSDIR\fledge-keep-Data" 0 fledge_skip_restore_data
      Rename "$PLUGINSDIR\fledge-keep-Data" "$INSTDIR\Data"
    fledge_skip_restore_data:
    IfFileExists "$PLUGINSDIR\fledge-keep-Instances" 0 fledge_skip_restore_instances
      Rename "$PLUGINSDIR\fledge-keep-Instances" "$INSTDIR\Instances"
    fledge_skip_restore_instances:
    IfFileExists "$PLUGINSDIR\fledge-keep-data-new" 0 fledge_skip_restore_data_new
      Rename "$PLUGINSDIR\fledge-keep-data-new" "$INSTDIR\data"
    fledge_skip_restore_data_new:
    IfFileExists "$PLUGINSDIR\fledge-keep-instances-new" 0 fledge_skip_restore_instances_new
      Rename "$PLUGINSDIR\fledge-keep-instances-new" "$INSTDIR\instances"
    fledge_skip_restore_instances_new:
    IfFileExists "$PLUGINSDIR\fledge-keep-profiles" 0 fledge_skip_restore_profiles
      Rename "$PLUGINSDIR\fledge-keep-profiles" "$INSTDIR\profiles"
    fledge_skip_restore_profiles:
    IfFileExists "$PLUGINSDIR\fledge-keep-Instance" 0 fledge_skip_restore_Instance
      Rename "$PLUGINSDIR\fledge-keep-Instance" "$INSTDIR\Instance"
    fledge_skip_restore_Instance:
    IfFileExists "$PLUGINSDIR\fledge-keep-data-root.json" 0 fledge_skip_restore_pointer
      Rename "$PLUGINSDIR\fledge-keep-data-root.json" "$INSTDIR\data-root.json"
    fledge_skip_restore_pointer:
  ${else}
    RMDir /r $INSTDIR
  ${endIf}
!macroend
