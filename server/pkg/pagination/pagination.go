package pagination

import (
	"regexp"
	"strings"

	"gorm.io/gorm"
)

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

var safeSortPattern = regexp.MustCompile(`^[a-zA-Z0-9_\.]+$`)

type PageQuery struct {
	Page     int    `form:"page" binding:"omitempty,min=1"`
	PageSize int    `form:"page_size" binding:"omitempty,min=1,max=100"`
	SortBy   string `form:"sort_by"`
	SortDir  string `form:"sort_dir" binding:"omitempty,oneof=asc desc"`
}

func (p *PageQuery) Offset() int {
	page := p.GetPage()
	pageSize := p.GetPageSize()
	return (page - 1) * pageSize
}

func (p *PageQuery) ApplyTo(db *gorm.DB) *gorm.DB {
	pageSize := p.GetPageSize()
	db = db.Offset(p.Offset()).Limit(pageSize)

	if p.SortBy != "" && safeSortPattern.MatchString(p.SortBy) {
		dir := strings.ToUpper(strings.TrimSpace(p.SortDir))
		if dir != "ASC" {
			dir = "DESC"
		}
		db = db.Order(p.SortBy + " " + dir)
	}

	return db
}

func (p *PageQuery) GetPage() int {
	if p.Page <= 0 {
		return defaultPage
	}

	return p.Page
}

func (p *PageQuery) GetPageSize() int {
	switch {
	case p.PageSize <= 0:
		return defaultPageSize
	case p.PageSize > maxPageSize:
		return maxPageSize
	default:
		return p.PageSize
	}
}
