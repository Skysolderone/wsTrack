package main

import (
	"fmt"
	"os"

	"go.uber.org/zap"

	"wsTrack/server/internal/config"
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

	if _, err := config.NewDatabase(cfg, logger); err != nil {
		logger.Error("migrate database failed", zap.Error(err))
		os.Exit(1)
	}

	logger.Info("migrate database succeeded")
}
