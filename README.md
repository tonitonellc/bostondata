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

## Prerequisites

- Go 1.21+
- Node.js 18+

## Setup

### 1. Install Go dependencies

```bash
go mod download
```

### 2. Install Vue dependencies

```bash
cd src/ui/
npm install
```

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd src/
go run main.go
```

**Terminal 2 - Frontend:**
```bash
cd src/ui/
npm run dev
```

Access the application at `http://localhost:80`

### Production Build

```bash
# Build Vue frontend
cd src/ui/
npm run build

# Run Go backend (serves static prebuilt VueJS assets)
cd src/
go run main.go
```

