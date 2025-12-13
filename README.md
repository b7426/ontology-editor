# Ontology Editor

A web-based ontology editor with graph visualization and RDF export.

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.10+

### Running Locally

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Using Docker Compose
```bash
docker-compose up --build
```
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Deployment to GCP

This project uses a cost-effective architecture:
- **Frontend**: Firebase Hosting (free tier)
- **Backend**: Cloud Run (scales to zero)

**Estimated cost when idle: ~$0/month**

### Prerequisites

1. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Install [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
3. Create a GCP project and enable billing
4. Enable required APIs:
   ```bash
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com
   ```

### Setup Firebase

```bash
# Login to Firebase
firebase login

# Initialize Firebase in the frontend directory
cd frontend
firebase init hosting
# Select your GCP project
# Use 'dist' as the public directory
# Configure as single-page app: Yes
```

### Deploy

```bash
# Set your project ID
export GCP_PROJECT_ID=your-project-id

# Deploy everything
./deploy.sh all

# Or deploy individually
./deploy.sh backend
./deploy.sh frontend <backend-url>
```

### Manual Deployment

**Backend (Cloud Run):**
```bash
cd backend
gcloud builds submit --tag gcr.io/$GCP_PROJECT_ID/ontology-editor-api
gcloud run deploy ontology-editor-api \
  --image gcr.io/$GCP_PROJECT_ID/ontology-editor-api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --min-instances 0 \
  --max-instances 1
```

**Frontend (Firebase):**
```bash
cd frontend
VITE_API_URL=https://your-backend-url npm run build
firebase deploy --only hosting
```

## Cost Breakdown

| Service | Idle Cost | With Traffic |
|---------|-----------|--------------|
| Firebase Hosting | Free (10GB/month) | Free up to 360MB/day |
| Cloud Run | $0 (scales to zero) | ~$0.00002/request |
| Container Registry | ~$0.026/GB/month | Same |

**For a low-traffic app, expect < $1/month total.**
