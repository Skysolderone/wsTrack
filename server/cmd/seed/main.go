package main

import (
	"context"
	"fmt"
	"os"

	"go.uber.org/zap"

	"wsTrack/server/internal/config"
	"wsTrack/server/migrations"
)

func main() {
	cfg, err := config.Load("config.yaml")
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		os.Exit(1)
	}

	logger, err := config.NewLogger(cfg.Server.Mode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init logger: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		_ = logger.Sync()
	}()
	zap.ReplaceGlobals(logger)

	db, err := config.NewDatabase(cfg, logger)
	if err != nil {
		logger.Error("init database failed", zap.Error(err))
		os.Exit(1)
	}

	if err := migrations.SeedExercises(context.Background(), db); err != nil {
		logger.Error("seed exercises failed", zap.Error(err))
		os.Exit(1)
	}

	logger.Info("seed exercises succeeded")
}
