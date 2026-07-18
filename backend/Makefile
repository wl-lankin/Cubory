.PHONY: run test build db-create db-drop

run:
	go run ./cmd/api

build:
	go build -o bin/cubory-api ./cmd/api

test:
	go test -p 1 ./...

db-create:
	createdb cubory_dev || true
	createdb cubory_test || true
	psql -d cubory_dev -c "CREATE EXTENSION IF NOT EXISTS citext;"
	psql -d cubory_test -c "CREATE EXTENSION IF NOT EXISTS citext;"

db-drop:
	dropdb cubory_dev || true
	dropdb cubory_test || true
