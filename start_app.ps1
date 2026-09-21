Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Starting SecureClass (Backend + Frontend)..." -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Start Backend in a dedicated window
Write-Host "Starting FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"

# Wait a moment
Start-Sleep -Seconds 2

# Start Frontend in a dedicated window
Write-Host "Starting Vite Frontend on http://localhost:5173 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; npm run dev"

# Wait and open browser
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

Write-Host "SecureClass launched successfully! Accessible at http://localhost:5173" -ForegroundColor Green
