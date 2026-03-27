package validator

import (
	"errors"
	"strings"

	"github.com/gin-gonic/gin/binding"
	playground "github.com/go-playground/validator/v10"
)

func RegisterCustomValidators() error {
	engine, ok := binding.Validator.Engine().(*playground.Validate)
	if !ok {
		return errors.New("validator engine unavailable")
	}

	return engine.RegisterValidation("trimmed", func(fl playground.FieldLevel) bool {
		field := fl.Field().String()
		return strings.TrimSpace(field) != ""
	})
}
