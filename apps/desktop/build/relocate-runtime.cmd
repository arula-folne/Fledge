@echo off
setlocal EnableExtensions
set "SRC=%~1"
set "DST=%SRC%\data\meta\runtime"
if not exist "%DST%" mkdir "%DST%"

if exist "%SRC%\Fledge.exe" move /Y "%SRC%\Fledge.exe" "%DST%\Fledge.exe" >nul

for %%F in ("%SRC%\*") do (
  if /I not "%%~nxF"=="Uninstall Fledge.exe" if /I not "%%~nxF"=="uninstall.exe" if /I not "%%~nxF"=="_fledge-launch.exe" if /I not "%%~nxF"=="data-root.json" if /I not "%%~nxF"=="Fledge.exe" if /I not "%%~nxF"=="uninstallerIcon.ico" (
    move /Y "%%F" "%DST%\" >nul
  )
)

for /d %%D in ("%SRC%\*") do (
  if /I not "%%~nxD"=="data" if /I not "%%~nxD"=="Instance" if /I not "%%~nxD"=="Instances" (
    move /Y "%%D" "%DST%\" >nul
  )
)
