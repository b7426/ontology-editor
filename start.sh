#!/bin/bash
set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment
source venv/bin/activate

# Load environment variables from .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

case "${1:-all}" in
    backend)
        echo "Starting backend on http://localhost:8000"
        cd backend
        uvicorn main:app --reload --host 0.0.0.0 --port 8000
        ;;
    frontend)
        echo "Starting frontend on http://localhost:5173"
        cd frontend
        npm run dev
        ;;
    all)
        echo "Starting Ontology Editor..."
        echo "  Backend:  http://localhost:8000"
        echo "  Frontend: http://localhost:5173"
        echo ""

        # Start backend
        cd backend
        uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
        BACKEND_PID=$!
        cd ..

        # Wait for backend to start
        sleep 2

        # Start frontend
        cd frontend
        npm run dev &
        FRONTEND_PID=$!
        cd ..

        # Wait for both processes
        wait
        ;;
    *)
        echo "Usage: ./start.sh [backend|frontend|all]"
        echo ""
        echo "Commands:"
        echo "  backend   - Start only the backend API server"
        echo "  frontend  - Start only the frontend dev server"
        echo "  all       - Start both (default)"
        echo ""
        echo "Environment:"
        echo "  Create a .env file with OPENAI_API_KEY=your_key"
        exit 1
        ;;
esac
