#!/bin/bash
set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="ontology-editor-api"
API_KEY="${API_KEY:-}"

echo "=== Ontology Editor Deployment ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "API Key: ${API_KEY:+configured}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if firebase is installed
if ! command -v firebase &> /dev/null; then
    echo "Warning: Firebase CLI is not installed"
    echo "Install with: npm install -g firebase-tools"
fi

# Function to deploy backend
deploy_backend() {
    echo "=== Deploying Backend to Cloud Run ==="

    cd backend

    # Build and push using Cloud Build
    gcloud builds submit \
        --project=$PROJECT_ID \
        --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

    # Deploy to Cloud Run
    DEPLOY_ARGS=(
        "--project=$PROJECT_ID"
        "--image" "gcr.io/$PROJECT_ID/$SERVICE_NAME"
        "--region" "$REGION"
        "--platform" "managed"
        "--allow-unauthenticated"
        "--memory" "256Mi"
        "--cpu" "1"
        "--min-instances" "0"
        "--max-instances" "1"
    )

    # Add API_KEY if set
    if [ -n "$API_KEY" ]; then
        DEPLOY_ARGS+=("--set-env-vars" "API_KEY=$API_KEY")
    fi

    gcloud run deploy $SERVICE_NAME "${DEPLOY_ARGS[@]}"

    # Get the service URL
    BACKEND_URL=$(gcloud run services describe $SERVICE_NAME \
        --project=$PROJECT_ID \
        --region=$REGION \
        --format='value(status.url)')

    echo "Backend deployed to: $BACKEND_URL"
    cd ..

    echo $BACKEND_URL
}

# Function to deploy frontend
deploy_frontend() {
    BACKEND_URL=$1

    echo "=== Deploying Frontend to Firebase Hosting ==="

    cd frontend

    # Build with the backend URL and API key
    VITE_API_URL=$BACKEND_URL VITE_API_KEY=$API_KEY npm run build

    # Deploy to Firebase
    firebase deploy --only hosting --project=$PROJECT_ID

    cd ..

    echo "Frontend deployed!"
}

# Main deployment
case "${1:-all}" in
    backend)
        deploy_backend
        ;;
    frontend)
        if [ -z "$2" ]; then
            echo "Error: Backend URL required for frontend deployment"
            echo "Usage: ./deploy.sh frontend <backend-url>"
            exit 1
        fi
        deploy_frontend $2
        ;;
    all)
        BACKEND_URL=$(deploy_backend)
        deploy_frontend $BACKEND_URL
        ;;
    *)
        echo "Usage: ./deploy.sh [backend|frontend|all]"
        echo ""
        echo "Commands:"
        echo "  backend   - Deploy only the backend to Cloud Run"
        echo "  frontend  - Deploy only the frontend to Firebase (requires backend URL)"
        echo "  all       - Deploy both (default)"
        echo ""
        echo "Environment variables:"
        echo "  GCP_PROJECT_ID - Your GCP project ID"
        echo "  GCP_REGION     - GCP region (default: us-central1)"
        echo "  API_KEY        - API key for authentication (optional)"
        exit 1
        ;;
esac

echo ""
echo "=== Deployment Complete ==="
