package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	Addr            string
	DatabaseURL     string
	JWTSecret       []byte
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	TrialDays       int
	AppBaseURL      string // Basis für Links in E-Mails (Portal)
	Env             string // dev | prod
}

func FromEnv() (*Config, error) {
	c := &Config{
		Addr:            getenv("CUBORY_ADDR", ":8880"),
		DatabaseURL:     getenv("CUBORY_DATABASE_URL", "postgres://localhost:5432/cubory_dev?sslmode=disable"),
		JWTSecret:       []byte(getenv("CUBORY_JWT_SECRET", "")),
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 30 * 24 * time.Hour,
		TrialDays:       7,
		AppBaseURL:      getenv("CUBORY_APP_BASE_URL", "http://localhost:5199"),
		Env:             getenv("CUBORY_ENV", "dev"),
	}
	if len(c.JWTSecret) == 0 {
		if c.Env == "prod" {
			return nil, fmt.Errorf("CUBORY_JWT_SECRET ist in prod Pflicht")
		}
		c.JWTSecret = []byte("dev-secret-not-for-production")
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
