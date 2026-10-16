// Package apierr defines the typed error every handler maps onto an HTTP
// status and the {"error":{"code","message"}} response body.
package apierr

import "errors"

// Error carries the HTTP status and machine code the API should respond with.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

// New builds a typed API error.
func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

// BadRequest is a 400 error.
func BadRequest(code, message string) *Error {
	return New(400, code, message)
}

// NotFound is a 404 error.
func NotFound(code, message string) *Error {
	return New(404, code, message)
}

// Conflict is a 409 error.
func Conflict(code, message string) *Error {
	return New(409, code, message)
}

// Internal is a 500 error.
func Internal(message string) *Error {
	return New(500, "internal", message)
}

// As extracts the typed error from err's chain.
func As(err error) (*Error, bool) {
	var e *Error
	if errors.As(err, &e) {
		return e, true
	}
	return nil, false
}
