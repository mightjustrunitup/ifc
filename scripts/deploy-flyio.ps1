# Deploy IFC Bonsai MCP to Fly.io (Windows)
# Usage: .\scripts\deploy-flyio.ps1 -AppName "ifc-bonsai-mcp" -Region "iad"

param(
    [string]$AppName = "ifc-bonsai-mcp",
    [string]$Region = "iad"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "🚀 IFC Bonsai MCP - Fly.io Deployment" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if flyctl is installed
if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
    Write-Host "❌ flyctl CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   Visit: https://fly.io/docs/hands-on/install-flyctl/" -ForegroundColor Yellow
    exit 1
}

# Check if user is authenticated
$auth_check = fly auth whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "🔐 Please log in to Fly.io first:" -ForegroundColor Yellow
    fly auth login
}

Write-Host ""
Write-Host "📝 Deployment Configuration:" -ForegroundColor Green
Write-Host "   App Name: $AppName"
Write-Host "   Region: $Region"
Write-Host ""

# Check if app already exists
$app_exists = fly app list 2>&1 | Select-String -Pattern "^$AppName"
if ($app_exists) {
    Write-Host "✅ App '$AppName' already exists, skipping creation" -ForegroundColor Green
} else {
    Write-Host "🔨 Creating new Fly.io app..." -ForegroundColor Yellow
    fly launch --name "$AppName" --region "$Region" --generate-name=false --no-deploy | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Could not create app, continuing with deployment..." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🚢 Deploying application..." -ForegroundColor Yellow
fly deploy --app "$AppName"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Next Steps:" -ForegroundColor Green
    Write-Host "   1. View your app: fly open --app $AppName"
    Write-Host "   2. Check status: fly status --app $AppName"
    Write-Host "   3. View logs: fly logs --app $AppName"
    Write-Host "   4. Set secrets: fly secrets set VARIABLE_NAME=value --app $AppName"
    Write-Host ""
    Write-Host "🔗 Your app is available at: https://$AppName.fly.dev" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "❌ Deployment failed. Check the output above for details." -ForegroundColor Red
}
