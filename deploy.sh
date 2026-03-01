#!/bin/bash
echo "🍳 Deploying SmartChef to Vercel..."
cd "$(dirname "$0")"
npx vercel@latest . --prod --yes 2>&1
