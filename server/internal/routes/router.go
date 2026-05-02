package routes

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(logger())
	r.Use(cors())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "polymarket-trader-go"})
	})

	api := r.Group("/api")
	{
		RegisterMarketsRoutes(api)
		RegisterPortfolioRoutes(api)
		RegisterTradingRoutes(api)
		RegisterNotificationsRoutes(api)
		RegisterSystemRoutes(api)
	}

	return r
}

func logger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		if param.StatusCode >= 400 {
			return param.TimeStamp.Format("15:04:05") + " " +
				param.Method + " " + param.Path + " " +
				http.StatusText(param.StatusCode) + "\n"
		}
		return ""
	})
}

func cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
