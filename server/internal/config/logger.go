package config

import (
	"fmt"
	"strings"

	"go.uber.org/zap"
)

func NewLogger(mode string) (*zap.Logger, error) {
	var (
		logger *zap.Logger
		err    error
	)

	if strings.EqualFold(mode, "release") {
		logger, err = zap.NewProduction()
	} else {
		logger, err = zap.NewDevelopment()
	}
	if err != nil {
		return nil, fmt.Errorf("new logger: %w", err)
	}

	return logger, nil
}
