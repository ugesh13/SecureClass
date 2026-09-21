@echo off
title SecureClass Launcher
echo ====================================================
echo Starting SecureClass (Backend + Frontend)...
echo ====================================================

cd /d "%~dp0"

REM Launch Backend in a new window
echo Starting FastAPI Backend on http://localhost:8000 ...
start "SecureClass Backend" cmd /k "cd /d ""%~dp0backend"" && "".\.venv\Scripts\python.exe"" -m uvicorn app.main:app --reload --port 8000"

REM Wait 2 seconds
timeout /t 2 /nobreak >nul

REM Launch Frontend in a new window
echo Starting Vite Frontend on http://localhost:5173 ...
start "SecureClass Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

REM Open browser after a brief delay
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Both servers have been started!
echo - Frontend: http://localhost:5173
echo - Backend:  http://localhost:8000
echo - API Docs: http://localhost:8000/docs
echo ====================================================
