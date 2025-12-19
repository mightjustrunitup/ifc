#!/bin/bash
# Deploy IFC Bonsai MCP to Fly.io
# Usage: bash scripts/deploy-flyio.sh [app-name]

set -e

APP_NAME="${1:-ifc-bonsai-mcp}"
REGION="${2:-iad}"

echo "================================================"
echo "🚀 IFC Bonsai MCP - Fly.io Deployment"
echo "================================================"
echo ""

# Check if flyctl is installed
if ! command -v fly &> /dev/null; then
    echo "❌ flyctl CLI not found. Please install it first:"
    echo "   Visit: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if user is authenticated
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please log in to Fly.io first:"
    fly auth login
fi

echo ""
echo "📝 Deployment Configuration:"
echo "   App Name: $APP_NAME"
echo "   Region: $REGION"
echo ""

# Check if app already exists
if fly app list | grep -q "^$APP_NAME"; then
    echo "✅ App '$APP_NAME' already exists, skipping creation"
else
    echo "🔨 Creating new Fly.io app..."
    fly launch --name "$APP_NAME" --region "$REGION" --generate-name=false --no-deploy || true
fi

echo ""
echo "🚢 Deploying application..."
fly deploy --app "$APP_NAME"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Next Steps:"
echo "   1. View your app: fly open --app $APP_NAME"
echo "   2. Check status: fly status --app $APP_NAME"
echo "   3. View logs: fly logs --app $APP_NAME"
echo "   4. Set secrets: fly secrets set VARIABLE_NAME=value --app $APP_NAME"
echo ""
echo "🔗 Your app is available at: https://$APP_NAME.fly.dev"
echo ""
