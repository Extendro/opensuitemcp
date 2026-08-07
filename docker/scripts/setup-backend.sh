#!/bin/bash
set -e

echo "🚀 Setting up backend environment..."

# Get the project root directory (where this script is located, go up 2 levels)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Get project name - prompt user for custom name or use directory name
DEFAULT_PROJECT_NAME="$(basename "$PROJECT_ROOT")"
echo ""
echo "📁 Default project name: ${DEFAULT_PROJECT_NAME}"
read -p "Use default project name? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
  read -p "Enter custom project name: " CUSTOM_PROJECT_NAME
  if [ -z "$CUSTOM_PROJECT_NAME" ]; then
    echo "⚠️  No project name provided, using default: ${DEFAULT_PROJECT_NAME}"
    PROJECT_NAME="$DEFAULT_PROJECT_NAME"
  else
    # Sanitize project name (lowercase, alphanumeric and hyphens only)
    PROJECT_NAME=$(echo "$CUSTOM_PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')
    if [ -z "$PROJECT_NAME" ]; then
      echo "⚠️  Invalid project name, using default: ${DEFAULT_PROJECT_NAME}"
      PROJECT_NAME="$DEFAULT_PROJECT_NAME"
    else
      echo "✅ Using project name: ${PROJECT_NAME}"
    fi
  fi
else
  PROJECT_NAME="$DEFAULT_PROJECT_NAME"
  echo "✅ Using project name: ${PROJECT_NAME}"
fi
echo ""

# Change to project root directory
cd "$PROJECT_ROOT"

# Check if .env.local exists
ENV_FILE=".env.local"
if [ -f "$ENV_FILE" ]; then
  echo "⚠️  .env.local already exists."
  read -p "Do you want to overwrite it? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled. Existing .env.local preserved."
    exit 0
  fi
  echo "📝 Backing up existing .env.local to .env.local.backup"
  cp "$ENV_FILE" "${ENV_FILE}.backup"
fi

# Generate secrets
echo "🔐 Generating secure secrets..."
POSTGRES_PW=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 24)
REDIS_PW=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 24)
AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)

# Create .env.local (Next.js / migrate / app)
echo "📝 Creating .env.local..."
cat > "$ENV_FILE" <<EOF
# Database
POSTGRES_URL="postgresql://postgres:${POSTGRES_PW}@localhost:5432/${PROJECT_NAME}"

# Redis
REDIS_URL="redis://:${REDIS_PW}@localhost:6379"

# Authentication
AUTH_SECRET="${AUTH_SECRET}"

# Encryption (for user API keys)
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

# Application
NEXTAUTH_URL="http://localhost:3000"

# SearXNG
SEARXNG_ENDPOINT="http://localhost:8080"
EOF

echo "✅ .env.local created successfully!"

# Persist compose vars (not loaded from .env.local). Same passwords as URLs above.
COMPOSE_ENV_FILE="docker/.env"
echo "📝 Creating ${COMPOSE_ENV_FILE} for docker compose..."
mkdir -p docker
cat > "$COMPOSE_ENV_FILE" <<EOF
PROJECT_NAME=${PROJECT_NAME}
POSTGRES_PW=${POSTGRES_PW}
REDIS_PW=${REDIS_PW}
EOF
echo "✅ ${COMPOSE_ENV_FILE} created successfully!"

COMPOSE=(docker compose --env-file "${COMPOSE_ENV_FILE}" -f docker/docker-compose.yml -p "${PROJECT_NAME}")

print_compose_next_steps() {
  echo "📋 Next steps:"
  echo "   1. Run: ${COMPOSE[*]} up -d"
  echo "   2. Run: pnpm db:migrate"
  echo "   3. Run: pnpm dev"
}

# Check if docker-compose.yml exists
if [ ! -f "docker/docker-compose.yml" ]; then
  echo "⚠️  docker/docker-compose.yml not found. Skipping Docker setup."
  print_compose_next_steps
  exit 0
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "⚠️  Docker is not running. Skipping container startup."
  echo "   Install/start Docker Desktop (macOS/Windows) or the Docker engine (Linux), then:"
  print_compose_next_steps
  exit 0
fi

# Ask if user wants to start Docker containers
echo "🐳 Docker is available."
read -p "Do you want to start Docker containers now? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
  print_compose_next_steps
  exit 0
fi

# Build and start containers
echo "🔨 Building SearXNG image (this may take a minute)..."
"${COMPOSE[@]}" build searxng

echo "🚀 Starting Docker containers..."
"${COMPOSE[@]}" up -d

echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if containers are running
if "${COMPOSE[@]}" ps | grep -q "Up"; then
  echo "✅ Docker containers are running!"
else
  echo "⚠️  Some containers may not have started. Check with: ${COMPOSE[*]} ps"
fi

echo ""
echo "🎉 Backend setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Run: pnpm install (if you haven't already)"
echo "   2. Run: pnpm skills:sync"
echo "   3. Run: pnpm db:migrate"
echo "   4. Run: pnpm dev"
echo ""
echo "💡 Remember to:"
echo "   - Add your LLM API key in the App Portal after signing in (Google, Anthropic, or OpenAI)"
echo "   - Re-run pnpm skills:sync weekly (or cron) to pick up new Oracle skills"
echo ""
echo "💡 To recreate backend containers later (new shell, no exports needed):"
echo "   ${COMPOSE[*]} up -d"
