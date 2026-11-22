@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
set "PATH=%~dp0..\node_modules\.bin;%PATH%"
cd /d "%~dp0.."
if /i "%~1"=="--no-bundle" goto nobundle
if "%~1"=="" goto bundle
call tauri.cmd %*
exit /b %ERRORLEVEL%
:nobundle
call tauri.cmd build --no-bundle
exit /b %ERRORLEVEL%
:bundle
call tauri.cmd build
exit /b %ERRORLEVEL%
