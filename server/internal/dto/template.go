package dto

import (
	"time"

	"github.com/google/uuid"
)

type TemplateResponse struct {
	ID          uuid.UUID         `json:"id"`
	Name        string            `json:"name"`
	Description *string           `json:"description,omitempty"`
	Goal        *string           `json:"goal,omitempty"`
	IsBuiltIn   bool              `json:"is_built_in"`
	Days        []PlanDayResponse `json:"days"`
	CreatedAt   time.Time         `json:"created_at"`
}

type SaveAsTemplateRequest struct {
	PlanID      uuid.UUID `json:"plan_id" binding:"required"`
	Name        string    `json:"name" binding:"required"`
	Description *string   `json:"description"`
}

type ImportTemplateRequest struct {
	TemplateJSON map[string]interface{} `json:"template_json" binding:"required"`
}

type TemplateSnapshot struct {
	Name        string            `json:"name"`
	Description *string           `json:"description,omitempty"`
	Goal        *string           `json:"goal,omitempty"`
	Days        []PlanDayResponse `json:"days"`
}
