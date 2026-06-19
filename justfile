# Install backend dependencies
install-backend:
    cd ./src && go mod tidy

# Run backend
run-backend:
    cd ./src && go run .

# Install frontend dependencies
install-frontend:
    cd ./src/ui && npm install

# Run frontend
run-frontend:
    cd ./src/ui && npm run serve

# Install both backend and frontend dependencies
install: install-backend install-frontend

# Run both backend and frontend 
run:
    (cd ./src && go run main.go &) && (cd ./src/ui && npm run serve &) && wait
