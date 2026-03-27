package errors

import "fmt"

const (
	CodeSuccess           = 0
	CodeBadRequest        = 40000
	CodeUnauthorized      = 40100
	CodeForbidden         = 40300
	CodeNotFound          = 40400
	CodeConflict          = 40900
	CodeInternal          = 50000
	CodeRateLimitExceeded = 42900
)

type AppError struct {
	HTTPStatus int
	Code       int
	Message    string
	Err        error
}

func (e *AppError) Error() string {
	if e.Err == nil {
		return e.Message
	}

	return fmt.Sprintf("%s: %v", e.Message, e.Err)
}

func (e *AppError) Unwrap() error {
	return e.Err
}

func New(httpStatus, code int, message string) *AppError {
	return &AppError{
		HTTPStatus: httpStatus,
		Code:       code,
		Message:    message,
	}
}

func Wrap(err error, httpStatus, code int, message string) *AppError {
	return &AppError{
		HTTPStatus: httpStatus,
		Code:       code,
		Message:    message,
		Err:        err,
	}
}
