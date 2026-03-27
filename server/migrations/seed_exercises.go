package migrations

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"gorm.io/gorm"

	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

func SeedExercises(ctx context.Context, db *gorm.DB) error {
	var count int64
	if err := db.WithContext(ctx).Model(&model.Exercise{}).Where("user_id IS NULL").Count(&count).Error; err != nil {
		return fmt.Errorf("count preset exercises: %w", err)
	}
	if count > 0 {
		return nil
	}

	presets, err := loadPresetExercises()
	if err != nil {
		return err
	}

	repo := repository.NewExerciseRepository(db.WithContext(ctx))
	if err := repo.BatchCreate(presets); err != nil {
		return fmt.Errorf("seed exercises: %w", err)
	}

	return nil
}

type presetExercise struct {
	Name             string   `json:"name"`
	NameEn           *string  `json:"name_en"`
	Category         string   `json:"category"`
	PrimaryMuscles   []string `json:"primary_muscles"`
	SecondaryMuscles []string `json:"secondary_muscles"`
	Equipment        string   `json:"equipment"`
	TrackingType     string   `json:"tracking_type"`
	Notes            *string  `json:"notes"`
}

func loadPresetExercises() ([]model.Exercise, error) {
	filePath, err := findSeedFile()
	if err != nil {
		return nil, err
	}

	payload, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read exercise seed file: %w", err)
	}

	var rawItems []presetExercise
	if err := json.Unmarshal(payload, &rawItems); err != nil {
		return nil, fmt.Errorf("unmarshal exercise seed file: %w", err)
	}

	exercises := make([]model.Exercise, 0, len(rawItems))
	for idx, item := range rawItems {
		exercises = append(exercises, model.Exercise{
			Name:             item.Name,
			NameEn:           item.NameEn,
			Category:         enum.ExerciseCategory(item.Category),
			PrimaryMuscles:   model.StringArray(item.PrimaryMuscles),
			SecondaryMuscles: model.StringArray(item.SecondaryMuscles),
			Equipment:        enum.Equipment(item.Equipment),
			TrackingType:     enum.TrackingType(item.TrackingType),
			IsCustom:         false,
			SortOrder:        idx + 1,
			Notes:            item.Notes,
		})
	}

	return exercises, nil
}

func findSeedFile() (string, error) {
	candidates := []string{
		filepath.Join("migrations", "data", "exercises.json"),
		filepath.Join("server", "migrations", "data", "exercises.json"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("exercise seed file not found in expected locations")
}
