APP_NAME := ws-track-api

.PHONY: run migrate seed swagger test build docker

run:
	go run ./cmd/api

migrate:
	go run ./cmd/migrate

seed:
	go run ./cmd/seed

swagger:
	go run -mod=mod github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o docs/swagger

test:
	GOCACHE=/tmp/go-build go test ./...

build:
	mkdir -p bin
	go build -o bin/$(APP_NAME) ./cmd/api

docker:
	docker build -t $(APP_NAME):latest .
