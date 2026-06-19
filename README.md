# WIP Beta Trial Non-MVP Version 0.0.0.0.0.1

⚠ THIS REPO IS A WORK IN PROGRESS AND NOT GUARANTEED IN ANY WAY UNDER ANY 
CIRCUMSTANCES TO DO LITERALLY ANY THING AT ALL WHAT SO EVER! ⚠

## Boston Utilities 
 
Utility data explorer for City of Boston-owned properties.

### Running locally

Available `just` commands:

```bash
    deps             # Environment dependencies
    install          # Install both backend and frontend dependencies
    install-backend  # Install backend dependencies
    install-frontend # Install frontend dependencies
    run              # Run both backend and frontend concurrently
    run-backend      # Run backend
    run-frontend     # Run frontend
```

# Boston Utility Bills Data Explorer

A full-stack application for exploring Boston utility bills data from BigQuery.

## Architecture

- **Backend**: Go with Gin framework
- **Frontend**: Vue.js 3 with Vite
- **Database**: Google BigQuery

## Prerequisites

- Go 1.21+
- Node.js 18+
- Google Cloud service account with BigQuery access

## Setup

### 1. Install Go dependencies

```bash
go mod download
```

### 2. Install Vue dependencies

```bash
cd ui
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory with your BigQuery credentials:

```
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
PORT=80
```

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
go run main.go
```

**Terminal 2 - Frontend:**
```bash
cd ui
npm run dev
```

Access the application at `http://localhost:80`

### Production Build

```bash
# Build Vue frontend
cd ui
npm run build

# Run Go backend (serves static files)
cd ..
go run main.go
```

## API Endpoints

- `GET /api/utility-bills` - Fetch utility bills with filtering and pagination
  - Query params: `limit`, `offset`, `energy_type`, `department`
- `GET /api/utility-bills/stats` - Get aggregated statistics

## Features

- ✅ Real-time data from BigQuery
- ✅ Advanced filtering by energy type and department
- ✅ Pagination support
- ✅ Statistics dashboard
- ✅ Responsive design
- ✅ Error handling and loading states

