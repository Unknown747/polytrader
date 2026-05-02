package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"polymarket-trader/internal/services"
)

func RegisterTradingRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/trading")

	g.GET("/config", getTradingConfig)
	g.POST("/config", updateTradingConfig)
	g.PATCH("/config", updateTradingConfig)

	g.GET("/strategy/config", getTradingConfig)
	g.POST("/strategy/config", updateTradingConfig)

	g.GET("/auto-trader/status", getAutoTraderStatus)
	g.GET("/auto-trader/history", getAutoTraderHistory)
	g.POST("/auto-trader/trigger", triggerManualScan)
	g.POST("/auto-trader/emergency-stop", setEmergencyStop)
	g.POST("/auto-trader/reset-stop", resetEmergencyStop)

	g.GET("/adaptive-profile", getAdaptiveProfile)
	g.GET("/adaptive-trading-profile", getAdaptiveProfile)

	g.GET("/clob/balance", getClobBalance)
	g.GET("/clob/positions", getClobPositions)
	g.GET("/clob/orders", getClobOrders)
	g.GET("/clob/trades", getClobTrades)
	g.POST("/clob/order", placeClobOrder)
	g.DELETE("/clob/order/:id", cancelClobOrder)
	g.DELETE("/clob/orders", cancelAllClobOrders)
	g.GET("/clob/status", getClobStatus)

	g.GET("/paper/portfolio", getPaperPortfolio)
	g.POST("/paper/reset", resetPaperPortfolio)
	g.GET("/paper/analytics", getPaperAnalytics)
	g.GET("/paper/equity-curve", getEquityCurve)

	g.GET("/network-mode", getNetworkMode)
	g.POST("/network-mode", setNetworkMode)

	g.GET("/risk-state", getRiskState)
	g.GET("/backtest", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Use POST /api/markets/strategy/backtest"})
	})
}

func getTradingConfig(c *gin.Context) {
	c.JSON(http.StatusOK, services.GetConfig())
}

func updateTradingConfig(c *gin.Context) {
	var patch map[string]interface{}
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body: " + err.Error()})
		return
	}
	cfg := services.UpdateConfig(patch)
	c.JSON(http.StatusOK, cfg)
}

func getAutoTraderStatus(c *gin.Context) {
	cfg := services.GetConfig()
	status := services.GetAutoTraderStats(cfg)
	schedulerStatus := services.GetSchedulerStatus()
	status["scheduler"] = schedulerStatus
	status["enabled"] = cfg.AutoTradingEnabled
	status["clobConfigured"] = services.IsClobConfigured()
	status["tradesToday"] = services.TradesToday()
	status["maxDailyTrades"] = cfg.MaxDailyTrades
	status["emergencyStop"] = services.IsEmergencyStop()
	status["consecutiveLosses"] = services.GetConsecutiveLosses()
	cooldown := services.GetLossCooldownUntil()
	if cooldown != nil {
		status["cooldownUntil"] = cooldown.Format("2006-01-02T15:04:05Z07:00")
	} else {
		status["cooldownUntil"] = nil
	}
	c.JSON(http.StatusOK, status)
}

func getAutoTraderHistory(c *gin.Context) {
	trades := services.GetTradeHistory()
	c.JSON(http.StatusOK, gin.H{"trades": trades, "total": len(trades)})
}

func triggerManualScan(c *gin.Context) {
	services.TriggerManualScan()
	c.JSON(http.StatusOK, gin.H{"message": "Manual scan triggered", "status": "running"})
}

func setEmergencyStop(c *gin.Context) {
	services.SetEmergencyStop(true)
	c.JSON(http.StatusOK, gin.H{"message": "Emergency stop activated", "emergencyStop": true})
}

func resetEmergencyStop(c *gin.Context) {
	services.SetEmergencyStop(false)
	c.JSON(http.StatusOK, gin.H{"message": "Emergency stop reset", "emergencyStop": false})
}

func getAdaptiveProfile(c *gin.Context) {
	cfg := services.GetConfig()
	balance := cfg.Bankroll
	if services.IsClobConfigured() {
		if b, err := services.GetUsdcBalance(); err == nil && b > 0 {
			balance = b
		}
	}
	profile := services.ComputeAdaptiveProfile(balance, cfg)
	c.JSON(http.StatusOK, profile)
}

func getClobBalance(c *gin.Context) {
	if !services.IsClobConfigured() {
		c.JSON(http.StatusOK, gin.H{"balance": 0, "configured": false, "message": "Polymarket credentials not configured"})
		return
	}
	balance, err := services.GetUsdcBalance()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Failed to fetch balance: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"balance": balance, "configured": true})
}

func getClobPositions(c *gin.Context) {
	positions := services.GetLivePositions()
	c.JSON(http.StatusOK, gin.H{"positions": positions, "count": len(positions)})
}

func getClobOrders(c *gin.Context) {
	orders := services.GetOpenOrders()
	c.JSON(http.StatusOK, gin.H{"orders": orders, "count": len(orders)})
}

func getClobTrades(c *gin.Context) {
	trades := services.GetFilledTrades()
	pnlHistory := services.ComputeLivePnlHistory(trades)
	c.JSON(http.StatusOK, gin.H{"trades": trades, "pnlHistory": pnlHistory, "count": len(trades)})
}

func placeClobOrder(c *gin.Context) {
	var body struct {
		TokenID  string  `json:"tokenId"`
		Side     string  `json:"side"`
		Price    float64 `json:"price"`
		Amount   float64 `json:"amount"`
		Question string  `json:"question"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body: " + err.Error()})
		return
	}
	if !services.IsClobConfigured() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Polymarket credentials not configured"})
		return
	}
	success, orderID, errMsg := services.PlaceOrder(services.PlaceOrderParams{
		TokenID:  body.TokenID,
		Side:     body.Side,
		Price:    body.Price,
		Amount:   body.Amount,
		Question: body.Question,
	})
	if !success {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": errMsg})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "orderId": orderID})
}

func cancelClobOrder(c *gin.Context) {
	id := c.Param("id")
	ok, errMsg := services.CancelOrder(id)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": errMsg})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func cancelAllClobOrders(c *gin.Context) {
	cancelled, errors := services.CancelAllOrders()
	c.JSON(http.StatusOK, gin.H{"cancelled": cancelled, "errors": errors})
}

func getClobStatus(c *gin.Context) {
	configured := services.IsClobConfigured()
	status := gin.H{
		"configured": configured,
		"address":    "",
		"network":    services.GetNetworkMode(),
	}
	if configured {
		status["address"] = services.GetWalletAddress()
	}
	c.JSON(http.StatusOK, status)
}

func getPaperPortfolio(c *gin.Context) {
	cfg := services.GetConfig()
	c.JSON(http.StatusOK, services.GetPaperPortfolio(cfg))
}

func resetPaperPortfolio(c *gin.Context) {
	cfg := services.GetConfig()
	services.ResetPaperPortfolio(cfg)
	c.JSON(http.StatusOK, gin.H{"message": "Paper portfolio reset", "balance": cfg.PaperBankroll})
}

func getPaperAnalytics(c *gin.Context) {
	c.JSON(http.StatusOK, services.GetPerformanceAnalytics())
}

func getEquityCurve(c *gin.Context) {
	curve := services.GetEquityCurve()
	c.JSON(http.StatusOK, gin.H{"curve": curve})
}

func getNetworkMode(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"mode": services.GetNetworkMode()})
}

func setNetworkMode(c *gin.Context) {
	var body struct {
		Mode string `json:"mode"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || (body.Mode != "mainnet" && body.Mode != "testnet") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mode must be 'mainnet' or 'testnet'"})
		return
	}
	services.SetNetworkMode(body.Mode)
	c.JSON(http.StatusOK, gin.H{"mode": body.Mode, "message": "Network mode updated"})
}

func getRiskState(c *gin.Context) {
	cooldown := services.GetLossCooldownUntil()
	dailyPause := services.GetDailyLossPauseUntil()
	state := gin.H{
		"emergencyStop":     services.IsEmergencyStop(),
		"consecutiveLosses": services.GetConsecutiveLosses(),
	}
	if cooldown != nil {
		state["cooldownUntil"] = cooldown.Format("2006-01-02T15:04:05Z07:00")
	}
	if dailyPause != nil {
		state["dailyLossPauseUntil"] = dailyPause.Format("2006-01-02T15:04:05Z07:00")
	}
	c.JSON(http.StatusOK, state)
}
