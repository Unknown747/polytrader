package routes

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"polymarket-trader/internal/db"
	"polymarket-trader/internal/services"
)

func RegisterNotificationsRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/notifications")
	g.GET("/status", getNotificationStatus)
	g.POST("/test", sendTestNotification)
	g.GET("/watchlist", getWatchlist)
	g.POST("/watchlist", addToWatchlist)
	g.DELETE("/watchlist/:id", removeFromWatchlist)
	g.GET("/alerts", getPriceAlerts)
	g.POST("/alerts", createPriceAlert)
	g.DELETE("/alerts/:id", deletePriceAlert)
}

func getNotificationStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"telegramConfigured": services.IsTelegramConfigured(),
		"hasToken":           services.BotToken() != "",
		"hasChatID":          services.TelegramChatID() != "",
	})
}

func sendTestNotification(c *gin.Context) {
	result := services.SendTestMessage()
	status := http.StatusOK
	if !result["success"].(bool) {
		status = http.StatusBadRequest
	}
	c.JSON(status, result)
}

func getWatchlist(c *gin.Context) {
	rows, err := db.DB.Query("SELECT market_id, market_question, category, yes_price, no_price, volume24h, added_at FROM market_watchlist ORDER BY added_at DESC")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"watchlist": []interface{}{}})
		return
	}
	defer rows.Close()
	var items []map[string]interface{}
	for rows.Next() {
		var marketID, question, category, addedAt string
		var yesPrice, noPrice, volume24h float64
		rows.Scan(&marketID, &question, &category, &yesPrice, &noPrice, &volume24h, &addedAt)
		items = append(items, map[string]interface{}{
			"marketId":       marketID,
			"marketQuestion": question,
			"category":       category,
			"yesPrice":       yesPrice,
			"noPrice":        noPrice,
			"volume24h":      volume24h,
			"addedAt":        addedAt,
		})
	}
	if items == nil {
		items = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"watchlist": items})
}

func addToWatchlist(c *gin.Context) {
	var body struct {
		MarketID string `json:"marketId"`
		Question string `json:"marketQuestion"`
		Category string `json:"category"`
		YesPrice float64 `json:"yesPrice"`
		NoPrice  float64 `json:"noPrice"`
		Volume24h float64 `json:"volume24h"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.MarketID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "marketId is required"})
		return
	}
	now := time.Now().Format(time.RFC3339)
	_, err := db.DB.Exec(
		"INSERT OR REPLACE INTO market_watchlist (market_id, market_question, category, yes_price, no_price, volume24h, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		body.MarketID, body.Question, body.Category, body.YesPrice, body.NoPrice, body.Volume24h, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add to watchlist"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Added to watchlist", "marketId": body.MarketID})
}

func removeFromWatchlist(c *gin.Context) {
	id := c.Param("id")
	res, err := db.DB.Exec("DELETE FROM market_watchlist WHERE market_id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Market not in watchlist"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Removed from watchlist"})
}

func getPriceAlerts(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, market_id, market_question, side, direction, target_price, triggered, triggered_at, created_at FROM price_alerts ORDER BY created_at DESC")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"alerts": []interface{}{}})
		return
	}
	defer rows.Close()
	var items []map[string]interface{}
	for rows.Next() {
		var id int64
		var marketID, question, side, direction, createdAt string
		var targetPrice float64
		var triggered int
		var triggeredAt sql.NullString
		rows.Scan(&id, &marketID, &question, &side, &direction, &targetPrice, &triggered, &triggeredAt, &createdAt)
		item := map[string]interface{}{
			"id":             id,
			"marketId":       marketID,
			"marketQuestion": question,
			"side":           side,
			"direction":      direction,
			"targetPrice":    targetPrice,
			"triggered":      triggered == 1,
			"createdAt":      createdAt,
		}
		if triggeredAt.Valid {
			item["triggeredAt"] = triggeredAt.String
		}
		items = append(items, item)
	}
	if items == nil {
		items = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"alerts": items})
}

func createPriceAlert(c *gin.Context) {
	var body struct {
		MarketID  string  `json:"marketId"`
		Question  string  `json:"marketQuestion"`
		Side      string  `json:"side"`
		Direction string  `json:"direction"`
		TargetPrice float64 `json:"targetPrice"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body"})
		return
	}
	if body.MarketID == "" || body.Side == "" || body.Direction == "" || body.TargetPrice <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "marketId, side, direction, and targetPrice are required"})
		return
	}
	now := time.Now().Format(time.RFC3339)
	res, err := db.DB.Exec(
		"INSERT INTO price_alerts (market_id, market_question, side, direction, target_price, triggered, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
		body.MarketID, body.Question, body.Side, body.Direction, body.TargetPrice, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create alert"})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Price alert created"})
}

func deletePriceAlert(c *gin.Context) {
	id := c.Param("id")
	res, err := db.DB.Exec("DELETE FROM price_alerts WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Alert deleted"})
}
