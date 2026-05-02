package routes

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"polymarket-trader/internal/services"
)

func RegisterMarketsRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/markets")
	g.GET("", getMarkets)
	g.GET("/:id", getMarketByID)
	g.GET("/opportunities", getOpportunities)
	g.GET("/strategy/opportunities", getOpportunities)
	g.POST("/strategy/backtest", runBacktest)
}

func getMarkets(c *gin.Context) {
	markets, err := services.GetCachedMarkets()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Failed to fetch markets: " + err.Error()})
		return
	}

	q := strings.ToLower(c.Query("q"))
	status := c.Query("status")
	category := strings.ToLower(c.Query("category"))
	limitStr := c.Query("limit")
	offsetStr := c.Query("offset")
	limit := 50
	offset := 0
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
		}
	}
	if offsetStr != "" {
		if n, err := strconv.Atoi(offsetStr); err == nil && n >= 0 {
			offset = n
		}
	}

	var filtered []interface{}
	for _, m := range markets {
		if q != "" && !strings.Contains(strings.ToLower(m.Question), q) && !strings.Contains(strings.ToLower(m.Category), q) {
			continue
		}
		if status != "" && m.Status != status {
			continue
		}
		if category != "" && strings.ToLower(m.Category) != category {
			continue
		}
		filtered = append(filtered, m)
	}

	total := len(filtered)
	if offset >= total {
		c.JSON(http.StatusOK, gin.H{"markets": []interface{}{}, "total": total, "limit": limit, "offset": offset})
		return
	}
	end := offset + limit
	if end > total {
		end = total
	}
	c.JSON(http.StatusOK, gin.H{"markets": filtered[offset:end], "total": total, "limit": limit, "offset": offset})
}

func getMarketByID(c *gin.Context) {
	id := c.Param("id")
	m, err := services.FetchMarketByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Market not found"})
		return
	}
	c.JSON(http.StatusOK, m)
}

func getOpportunities(c *gin.Context) {
	markets, err := services.GetCachedMarkets()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Failed to fetch markets: " + err.Error()})
		return
	}
	cfg := services.GetConfig()
	opportunities := services.ScanOpportunities(markets, cfg)
	c.JSON(http.StatusOK, gin.H{"opportunities": opportunities, "count": len(opportunities), "config": cfg})
}

func runBacktest(c *gin.Context) {
	var req services.BacktestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}
	result := services.RunBacktest(req)
	c.JSON(http.StatusOK, result)
}
