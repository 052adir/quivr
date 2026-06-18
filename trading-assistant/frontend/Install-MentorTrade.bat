@echo off
setlocal enabledelayedexpansion
echo Installing MentorTrade Watcher into MT5...
echo.
set "URL=https://mentor-trade.onrender.com/api/download/watcher-ea"
set "DEST=%TEMP%\MentorTrade_Watcher.ex5"
echo Downloading the EA...
curl -L -s -o "%DEST%" "%URL%"
if exist "%DEST%" (
  set /a count=0
  for /d %%T in ("%APPDATA%\MetaQuotes\Terminal\*") do (
    if exist "%%T\MQL5\Experts\" (
      copy /Y "%DEST%" "%%T\MQL5\Experts\MentorTrade_Watcher.ex5" >nul
      set /a count+=1
    )
  )
  echo.
  echo Done. Installed into !count! MetaTrader 5 terminals.
  echo Open MT5, drag MentorTrade_Watcher onto a chart, enter your token, allow WebRequest.
) else (
  echo ERROR: download failed. Check your internet connection.
)
echo.
pause
