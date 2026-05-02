package routes

import (
        "net/http"
        "strconv"

        "github.com/gin-gonic/gin"
        "polymarket-trader/internal/models"
        "polymarket-trader/internal/services"
)

func RegisterPortfolioRoutes(rg *gin.RouterGroup) {
        g := rg.Group("/portfolio")
        g.GET("/summary", getPortfolioSummary)
        g.GET("/orders", getOrders)
        g.POST("/orders", createOrder)
        g.PUT("/orders/:id/cancel", cancelOrder)
        g.GET("/positions", getPositions)
        g.POST("/positions/:id/close", closePosition)
        g.POST("/positions/:id/partial-close", partialClosePosition)
        g.GET("/pnl", getPnlHistory)
        g.POST("/seed-demo", seedDemo)
}

func getPortfolioSummary(c *gin.Context) {
        c.JSON(http.StatusOK, services.GetPortfolioSummary())
}

func getOrders(c *gin.Context) {
        orders := services.GetOrders()
        if orders == nil {
                orders = []models.OrderEntry{}
        }
        c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func createOrder(c *gin.Context) {
        var body struct {
                MarketID       string  `json:"marketId"`
                MarketQuestion string  `json:"marketQuestion"`
                Side           string  `json:"side"`
                Type           string  `json:"type"`
                Price          float64 `json:"price"`
                Amount         float64 `json:"amount"`
                Shares         float64 `json:"shares"`
                Status         string  `json:"status"`
        }
        if err := c.ShouldBindJSON(&body); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body: " + err.Error()})
                return
        }
        if body.Shares == 0 && body.Price > 0 {
                body.Shares = body.Amount / body.Price
        }
        if body.Status == "" {
                body.Status = "open"
        }
        if body.Type == "" {
                body.Type = "BUY"
        }
        order := services.AddOrder(models.OrderEntry{
                MarketID:       body.MarketID,
                MarketQuestion: body.MarketQuestion,
                Side:           body.Side,
                Type:           body.Type,
                Price:          body.Price,
                Amount:         body.Amount,
                Shares:         body.Shares,
                Status:         body.Status,
        })
        c.JSON(http.StatusCreated, order)
}

func cancelOrder(c *gin.Context) {
        id := c.Param("id")
        order := services.CancelPortfolioOrder(id)
        if order == nil {
                c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
                return
        }
        c.JSON(http.StatusOK, order)
}

func getPositions(c *gin.Context) {
        positions := services.GetPositions()
        if positions == nil {
                positions = []models.PositionEntry{}
        }
        c.JSON(http.StatusOK, gin.H{"positions": positions})
}

func closePosition(c *gin.Context) {
        id := c.Param("id")
        var body struct {
                CurrentPrice float64 `json:"currentPrice"`
        }
        c.ShouldBindJSON(&body)
        if body.CurrentPrice <= 0 {
                body.CurrentPrice = 1.0
        }
        result := services.FullClosePosition(id, body.CurrentPrice)
        if result == nil {
                c.JSON(http.StatusNotFound, gin.H{"error": "Position not found"})
                return
        }
        c.JSON(http.StatusOK, gin.H{"realizedPnl": result.RealizedPnl, "message": "Position closed successfully"})
}

func partialClosePosition(c *gin.Context) {
        id := c.Param("id")
        var body struct {
                SharesToSell float64 `json:"sharesToSell"`
                CurrentPrice float64 `json:"currentPrice"`
        }
        if err := c.ShouldBindJSON(&body); err != nil || body.SharesToSell <= 0 || body.CurrentPrice <= 0 {
                // Try query params
                sharesStr := c.Query("sharesToSell")
                priceStr := c.Query("currentPrice")
                if s, err2 := strconv.ParseFloat(sharesStr, 64); err2 == nil {
                        body.SharesToSell = s
                }
                if p, err2 := strconv.ParseFloat(priceStr, 64); err2 == nil {
                        body.CurrentPrice = p
                }
        }
        if body.SharesToSell <= 0 || body.CurrentPrice <= 0 {
                c.JSON(http.StatusBadRequest, gin.H{"error": "sharesToSell and currentPrice are required"})
                return
        }
        result := services.PartialClosePosition(id, body.SharesToSell, body.CurrentPrice)
        if result == nil {
                c.JSON(http.StatusNotFound, gin.H{"error": "Position not found"})
                return
        }
        c.JSON(http.StatusOK, gin.H{"realizedPnl": result.RealizedPnl, "remainingShares": result.RemainingShares})
}

func getPnlHistory(c *gin.Context) {
        points := services.GetPnlHistory()
        if points == nil {
                points = []models.PnlPoint{}
        }
        c.JSON(http.StatusOK, gin.H{"pnl": points})
}

func seedDemo(c *gin.Context) {
        result := services.SeedDemoData()
        c.JSON(http.StatusOK, gin.H{"message": "Demo data seeded successfully", "data": result})
}
