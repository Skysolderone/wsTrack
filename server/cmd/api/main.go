package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"go.uber.org/zap"

	"wsTrack/server/internal/config"
	"wsTrack/server/internal/handler"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/service"
	appauth "wsTrack/server/pkg/auth"
	"wsTrack/server/pkg/response"
	appvalidator "wsTrack/server/pkg/validator"
)

// @title Strength Tracker API
// @version 1.0
// @description Backend service for the strength training record app.
// @BasePath /api/v1
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
	cfg, err := config.Load("config.yaml")
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		os.Exit(1)
	}

	logger, err := config.NewLogger(cfg.Server.Mode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init logger: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		_ = logger.Sync()
	}()
	zap.ReplaceGlobals(logger)

	gin.SetMode(cfg.Server.Mode)

	if err := appvalidator.RegisterCustomValidators(); err != nil {
		logger.Error("register validator failed", zap.Error(err))
		os.Exit(1)
	}

	db, err := config.NewDatabase(cfg, logger)
	if err != nil {
		logger.Error("init database failed", zap.Error(err))
		os.Exit(1)
	}

	redisClient, err := config.NewRedis(cfg)
	if err != nil {
		logger.Error("init redis failed", zap.Error(err))
		os.Exit(1)
	}

	appauth.Configure(appauth.Settings{
		Secret:          cfg.JWT.Secret,
		AccessTokenTTL:  cfg.JWT.AccessTokenTTL,
		RefreshTokenTTL: cfg.JWT.RefreshTokenTTL,
	})
	middleware.SetRateLimitClient(redisClient)

	userRepo := repository.NewUserRepository(db)
	exerciseRepo := repository.NewExerciseRepository(db)
	planRepo := repository.NewPlanRepository(db)
	planDayRepo := repository.NewPlanDayRepository(db)
	planExerciseRepo := repository.NewPlanExerciseRepository(db)
	workoutRepo := repository.NewWorkoutRepository(db)
	statsRepo := repository.NewStatsRepository(db)
	templateRepo := repository.NewTemplateRepository(db)
	personalRecordRepo := repository.NewPersonalRecordRepository(db)
	challengeRepo := repository.NewChallengeRepository(db)
	coachRepo := repository.NewCoachRepository(db)
	authService := service.NewAuthService(userRepo, redisClient, cfg.JWT)
	exerciseService := service.NewExerciseService(exerciseRepo)
	planService := service.NewPlanService(planRepo, planDayRepo, planExerciseRepo, exerciseRepo)
	templateService := service.NewTemplateService(templateRepo, planRepo, exerciseRepo)
	prService := service.NewPRService(personalRecordRepo)
	challengeService := service.NewChallengeService(challengeRepo)
	workoutService := service.NewWorkoutService(workoutRepo, exerciseRepo, planDayRepo, redisClient, prService, challengeService)
	statsService := service.NewStatsService(statsRepo, redisClient)
	coachService := service.NewCoachService(userRepo, coachRepo, planRepo, workoutRepo, statsService)

	authHandler := handler.NewAuthHandler(authService)
	exerciseHandler := handler.NewExerciseHandler(exerciseService)
	planHandler := handler.NewPlanHandler(planService)
	workoutHandler := handler.NewWorkoutHandler(workoutService)
	statsHandler := handler.NewStatsHandler(statsService)
	templateHandler := handler.NewTemplateHandler(templateService)
	prHandler := handler.NewPRHandler(prService)
	challengeHandler := handler.NewChallengeHandler(challengeService)
	coachHandler := handler.NewCoachHandler(coachService)
	clientHandler := handler.NewClientHandler(coachService)

	middleware.SetCoachRelationChecker(coachRepo)

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.Logger(), middleware.CORS(), middleware.RateLimit())

	r.GET("/healthz", func(c *gin.Context) {
		response.Success(c, gin.H{
			"status": "ok",
		})
	})
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	authGroup := r.Group("/api/v1/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.RefreshToken)
	}

	authProtected := r.Group("/api/v1/auth")
	authProtected.Use(middleware.Auth())
	{
		authProtected.GET("/profile", authHandler.GetProfile)
		authProtected.PUT("/profile", authHandler.UpdateProfile)
		authProtected.PUT("/password", authHandler.ChangePassword)
	}

	api := r.Group("/api/v1")
	api.Use(middleware.Auth())
	{
		exercises := api.Group("/exercises")
		{
			exercises.GET("", exerciseHandler.List)
			exercises.GET("/:id", exerciseHandler.Get)
			exercises.POST("", exerciseHandler.Create)
			exercises.PUT("/:id", exerciseHandler.Update)
			exercises.DELETE("/:id", exerciseHandler.Delete)
		}

		plans := api.Group("/plans")
		{
			plans.GET("", planHandler.List)
			plans.GET("/:id", planHandler.Get)
			plans.POST("", planHandler.Create)
			plans.PUT("/:id", planHandler.Update)
			plans.DELETE("/:id", planHandler.Delete)
			plans.POST("/:id/duplicate", planHandler.Duplicate)
			plans.POST("/:id/activate", planHandler.Activate)
			plans.POST("/:id/days", planHandler.AddDay)
			plans.PUT("/days/:dayId", planHandler.UpdateDay)
			plans.DELETE("/days/:dayId", planHandler.DeleteDay)
			plans.PUT("/days/:dayId/reorder", planHandler.ReorderDays)
			plans.POST("/days/:dayId/exercises", planHandler.AddExercise)
			plans.PUT("/exercises/:exerciseId", planHandler.UpdateExercise)
			plans.DELETE("/exercises/:exerciseId", planHandler.DeleteExercise)
			plans.PUT("/days/:dayId/exercises/reorder", planHandler.ReorderExercises)
		}

		workouts := api.Group("/workouts")
		{
			workouts.GET("", workoutHandler.List)
			workouts.GET("/:id", workoutHandler.Get)
			workouts.POST("", workoutHandler.Create)
			workouts.PUT("/:id", workoutHandler.Update)
			workouts.DELETE("/:id", workoutHandler.Delete)
			workouts.POST("/sync", workoutHandler.Sync)
		}

		stats := api.Group("/stats")
		{
			stats.GET("/dashboard", statsHandler.Dashboard)
			stats.GET("/volume", statsHandler.Volume)
			stats.GET("/muscles", statsHandler.Muscles)
			stats.GET("/prs", statsHandler.PRs)
			stats.GET("/frequency", statsHandler.Frequency)
			stats.GET("/exercise/:exerciseId", statsHandler.Exercise)
		}

		prs := api.Group("/prs")
		{
			prs.GET("", prHandler.List)
			prs.GET("/exercise/:exerciseId", prHandler.ListByExercise)
		}

		challenges := api.Group("/challenges")
		{
			challenges.GET("", challengeHandler.List)
			challenges.POST("", challengeHandler.Create)
			challenges.PUT("/:id", challengeHandler.Update)
			challenges.DELETE("/:id", challengeHandler.Delete)
		}

		coach := api.Group("/coach")
		coach.Use(middleware.CoachOnly())
		{
			coach.POST("/invite", coachHandler.Invite)
			coach.GET("/clients", coachHandler.ListClients)
			coach.GET("/clients/:clientId", middleware.ActiveCoachClient(), coachHandler.GetClientDetail)
			coach.GET("/clients/:clientId/workouts", middleware.ActiveCoachClient(), coachHandler.ListClientWorkouts)
			coach.POST("/clients/:clientId/plans", middleware.ActiveCoachClient(), coachHandler.PushPlan)
			coach.POST("/workouts/:workoutId/comment", coachHandler.AddWorkoutComment)
			coach.GET("/dashboard", coachHandler.Dashboard)
		}

		client := api.Group("/client")
		{
			client.GET("/invitations", clientHandler.ListInvitations)
			client.POST("/invitations/:id/accept", clientHandler.AcceptInvitation)
			client.POST("/invitations/:id/reject", clientHandler.RejectInvitation)
			client.GET("/coaches", clientHandler.ListCoaches)
			client.GET("/comments", clientHandler.ListComments)
		}

		templates := api.Group("/templates")
		{
			templates.GET("", templateHandler.List)
			templates.GET("/:id", templateHandler.Get)
			templates.POST("/from-plan", templateHandler.SaveFromPlan)
			templates.POST("/:id/apply", templateHandler.Apply)
			templates.POST("/import", templateHandler.Import)
			templates.GET("/:id/export", templateHandler.Export)
			templates.DELETE("/:id", templateHandler.Delete)
		}
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Server.Port),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("starting api server", zap.String("addr", srv.Addr))
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("api server stopped", zap.Error(err))
		os.Exit(1)
	}
}
