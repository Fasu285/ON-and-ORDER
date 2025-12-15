# Deployment Guide

## Architecture Overview
- **Frontend**: React PWA hosted on Firebase Hosting or Vercel.
- **Backend**: Node.js/Go service on Google Cloud Run.
- **Database**: Cloud SQL (PostgreSQL) for persistence.
- **Cache**: Cloud Memorystore (Redis) for ephemeral game state.
- **Security**: Cloud KMS for secret encryption.

## Prerequisites
- Google Cloud Platform Project
- gcloud CLI installed
- Docker installed

## Step 1: Backend Infrastructure (Terraform/gcloud)

1. **Enable APIs**:
   ```bash
   gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com cloudkms.googleapis.com
   ```

2. **Create KMS Keyring and Key**:
   ```bash
   gcloud kms keyrings create on-order-ring --location global
   gcloud kms keys create game-secrets --location global --keyring on-order-ring --purpose encryption
   ```

3. **Create Cloud SQL Instance**:
   ```bash
   gcloud sql instances create on-order-db --database-version=POSTGRES_13 --tier=db-f1-micro --region=us-central1
   gcloud sql users set-password postgres --instance=on-order-db --password=[DB_PASSWORD]
   ```

4. **Create Redis Instance**:
   ```bash
   gcloud redis instances create on-order-cache --size=1 --region=us-central1
   ```

## Step 2: Backend Deployment

1. **Build Container**:
   ```bash
   gcloud builds submit --tag gcr.io/[PROJECT_ID]/on-order-backend
   ```

2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy on-order-api \
     --image gcr.io/[PROJECT_ID]/on-order-backend \
     --add-cloudsql-instances [PROJECT_ID]:us-central1:on-order-db \
     --set-env-vars DB_HOST=/cloudsql/[CONNECTION_NAME],REDIS_HOST=[REDIS_IP],KMS_KEY=[KEY_ID] \
     --allow-unauthenticated
   ```

## Step 3: Frontend Deployment

1. **Build**:
   ```bash
   npm run build
   ```

2. **Deploy (e.g., Firebase)**:
   ```bash
   firebase deploy --only hosting
   ```

## Step 4: Database Migration
Run the migration script (using a temporary connection or a specialized Cloud Run job) to create `users`, `matches`, `moves` tables.

## Production Checklist
- [ ] TLS enabled on all endpoints.
- [ ] Database backups scheduled.
- [ ] Rate limiting enabled in Redis.
- [ ] Monitoring alerts set up for 5xx errors.
