@echo off
setlocal
pushd "%~dp0" || goto :project_error

set "NODE_EXE=%CD%\runtime\node.exe"
if exist "%NODE_EXE%" goto :check_node
where.exe node.exe >nul 2>nul || goto :node_error
set "NODE_EXE=node.exe"

:check_node
"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0]) < 24 ? 1 : 0)" >nul 2>nul
if errorlevel 1 goto :node_error
"%NODE_EXE%" server.js
set "RESULT=%ERRORLEVEL%"
popd
if not "%RESULT%"=="0" pause
exit /b %RESULT%

:node_error
echo Node.js 24 or newer is required.
echo Install it from https://nodejs.org/ or place node.exe in the runtime folder.
popd
pause
exit /b 1

:project_error
echo Cannot open the Balance project folder.
pause
exit /b 1

