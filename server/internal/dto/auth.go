package dto

import "github.com/google/uuid"

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8,max=64"`
	Nickname string `json:"nickname" binding:"required,min=2,max=50"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type UserInfo struct {
	ID         uuid.UUID `json:"id"`
	Email      string    `json:"email"`
	Nickname   string    `json:"nickname"`
	WeightUnit string    `json:"weight_unit"`
	Language   string    `json:"language"`
	Role       string    `json:"role"`
}

type AuthResponse struct {
	AccessToken  string   `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
	ExpiresIn    int64    `json:"expires_in"`
	User         UserInfo `json:"user"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type UpdateProfileRequest struct {
	Nickname   *string `json:"nickname" binding:"omitempty,min=2,max=50"`
	WeightUnit *string `json:"weight_unit" binding:"omitempty,oneof=kg lbs"`
	Language   *string `json:"language" binding:"omitempty,oneof=zh en"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8,max=64"`
}
