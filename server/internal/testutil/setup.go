package testutil

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
	testcontainers "github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"wsTrack/server/internal/config"
	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
	appauth "wsTrack/server/pkg/auth"
	"wsTrack/server/pkg/hash"
)

var (
	containersMu sync.Mutex
	containers   []testcontainers.Container
	testJWTConfig = config.JWTConfig{
		Secret:          "ws-track-test-secret",
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 24 * time.Hour,
	}
)

func SetupTestDB(tb testing.TB) *gorm.DB {
	tb.Helper()
	defer recoverContainerUnavailable(tb, "postgres")

	ctx := context.Background()
	container, err := tcpostgres.Run(
		ctx,
		"postgres:16-alpine",
		tcpostgres.WithDatabase("wstrack_test"),
		tcpostgres.WithUsername("postgres"),
		tcpostgres.WithPassword("postgres"),
		tcpostgres.BasicWaitStrategies(),
	)
	maybeSkipContainerError(tb, "postgres", err)
	registerContainer(container)

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	maybeSkipContainerError(tb, "postgres", err)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	require.NoError(tb, err)
	require.NoError(tb, db.Exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).Error)
	require.NoError(tb, config.AutoMigrate(db))

	appauth.Configure(appauth.Settings{
		Secret:          testJWTConfig.Secret,
		AccessTokenTTL:  testJWTConfig.AccessTokenTTL,
		RefreshTokenTTL: testJWTConfig.RefreshTokenTTL,
	})

	return db
}

func SetupTestRedis(tb testing.TB) *redis.Client {
	tb.Helper()
	defer recoverContainerUnavailable(tb, "redis")

	ctx := context.Background()
	container, err := tcredis.Run(ctx, "redis:7-alpine")
	maybeSkipContainerError(tb, "redis", err)
	registerContainer(container)

	connString, err := container.ConnectionString(ctx)
	maybeSkipContainerError(tb, "redis", err)

	options, err := redis.ParseURL(connString)
	require.NoError(tb, err)

	client := redis.NewClient(options)
	require.NoError(tb, client.Ping(ctx).Err())

	appauth.Configure(appauth.Settings{
		Secret:          testJWTConfig.Secret,
		AccessTokenTTL:  testJWTConfig.AccessTokenTTL,
		RefreshTokenTTL: testJWTConfig.RefreshTokenTTL,
	})

	return client
}

func TearDown() {
	containersMu.Lock()
	defer containersMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for i := len(containers) - 1; i >= 0; i-- {
		if containers[i] == nil {
			continue
		}

		_ = containers[i].Terminate(ctx)
	}

	containers = nil
}

func CreateTestUser(db *gorm.DB, email, password string) (*model.User, error) {
	passwordHash, err := hash.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &model.User{
		Email:        strings.TrimSpace(strings.ToLower(email)),
		PasswordHash: passwordHash,
		Nickname:     "Test User",
		WeightUnit:   enum.WeightUnitKG,
		Language:     "zh",
		Role:         "user",
	}

	if err := db.Create(user).Error; err != nil {
		return nil, fmt.Errorf("create test user: %w", err)
	}

	return user, nil
}

func GetAuthToken(userID uuid.UUID) (string, error) {
	appauth.Configure(appauth.Settings{
		Secret:          testJWTConfig.Secret,
		AccessTokenTTL:  testJWTConfig.AccessTokenTTL,
		RefreshTokenTTL: testJWTConfig.RefreshTokenTTL,
	})

	return appauth.GenerateAccessToken(userID, "user")
}

func TestJWTConfig() config.JWTConfig {
	return testJWTConfig
}

func registerContainer(container testcontainers.Container) {
	containersMu.Lock()
	defer containersMu.Unlock()
	containers = append(containers, container)
}

func recoverContainerUnavailable(tb testing.TB, dependency string) {
	if recovered := recover(); recovered != nil {
		message := fmt.Sprint(recovered)
		if isContainerRuntimeUnavailable(message) {
			tb.Skipf("skipping %s integration tests: %s", dependency, message)
			return
		}

		panic(recovered)
	}
}

func maybeSkipContainerError(tb testing.TB, dependency string, err error) {
	if err == nil {
		return
	}

	if isContainerRuntimeUnavailable(err.Error()) {
		tb.Skipf("skipping %s integration tests: %v", dependency, err)
		return
	}

	require.NoError(tb, err)
}

func isContainerRuntimeUnavailable(message string) bool {
	lowered := strings.ToLower(message)

	candidates := []string{
		"docker",
		"podman",
		"daemon",
		"socket",
		"xdg_runtime_dir",
		"cannot connect",
		"no such file or directory",
	}

	for _, candidate := range candidates {
		if strings.Contains(lowered, candidate) {
			return true
		}
	}

	return false
}
