package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/service"
	"wsTrack/server/pkg/response"
)

type TemplateHandler struct {
	templateService *service.TemplateService
}

func NewTemplateHandler(templateService *service.TemplateService) *TemplateHandler {
	return &TemplateHandler{templateService: templateService}
}

// List godoc
// @Summary List templates
// @Tags templates
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates [get]
func (h *TemplateHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	items, err := h.templateService.List(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}

// Get godoc
// @Summary Get template detail
// @Tags templates
// @Produce json
// @Security BearerAuth
// @Param id path string true "Template ID"
// @Success 200 {object} response.Response{data=dto.TemplateResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates/{id} [get]
func (h *TemplateHandler) Get(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid template id")
		return
	}

	item, err := h.templateService.GetByID(id, userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// SaveFromPlan godoc
// @Summary Save a plan as template
// @Tags templates
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.SaveAsTemplateRequest true "Save template request"
// @Success 200 {object} response.Response{data=dto.TemplateResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates/from-plan [post]
func (h *TemplateHandler) SaveFromPlan(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.SaveAsTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.templateService.SaveFromPlan(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Apply godoc
// @Summary Apply template to create a new plan
// @Tags templates
// @Produce json
// @Security BearerAuth
// @Param id path string true "Template ID"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates/{id}/apply [post]
func (h *TemplateHandler) Apply(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid template id")
		return
	}

	item, err := h.templateService.Apply(userID, id)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Import godoc
// @Summary Import template JSON
// @Tags templates
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.ImportTemplateRequest true "Import template request"
// @Success 200 {object} response.Response{data=dto.TemplateResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates/import [post]
func (h *TemplateHandler) Import(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.ImportTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.templateService.Import(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Export godoc
// @Summary Export template JSON
// @Tags templates
// @Produce json
// @Security BearerAuth
// @Param id path string true "Template ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates/{id}/export [get]
func (h *TemplateHandler) Export(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid template id")
		return
	}

	item, err := h.templateService.Export(userID, id)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Delete godoc
// @Summary Delete custom template
// @Tags templates
// @Produce json
// @Security BearerAuth
// @Param id path string true "Template ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /templates/{id} [delete]
func (h *TemplateHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid template id")
		return
	}

	if err := h.templateService.Delete(userID, id); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}
