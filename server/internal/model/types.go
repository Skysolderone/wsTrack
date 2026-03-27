package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/lib/pq"
)

type StringArray []string

func (a StringArray) Value() (driver.Value, error) {
	return pq.Array([]string(a)).Value()
}

func (a *StringArray) Scan(src interface{}) error {
	if a == nil {
		return errors.New("StringArray: scan on nil pointer")
	}

	return pq.Array((*[]string)(a)).Scan(src)
}

func (StringArray) GormDataType() string {
	return "text[]"
}

type JSON []byte

func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	if !json.Valid(j) {
		return nil, errors.New("invalid JSON payload")
	}

	return []byte(j), nil
}

func (j *JSON) Scan(value interface{}) error {
	if j == nil {
		return errors.New("JSON: scan on nil pointer")
	}

	switch v := value.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = append((*j)[:0], v...)
	default:
		return fmt.Errorf("JSON: unsupported scan type %T", value)
	}

	return nil
}

func (JSON) GormDataType() string {
	return "jsonb"
}
