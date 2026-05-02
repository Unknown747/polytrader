package routes

import (
        "math"
        "net/http"
        "os"
        "runtime"
        "time"

        "github.com/gin-gonic/gin"
        "polymarket-trader/internal/db"
        "polymarket-trader/internal/services"
)

var startTime = time.Now()

func RegisterSystemRoutes(rg *gin.RouterGroup) {
        g := rg.Group("/system")
        g.GET("/status", getSystemStatus)
        g.GET("/config", getSystemConfig)
        g.GET("/credentials", getCredentials)
        g.POST("/credentials", saveCredentials)
        g.DELETE("/credentials/:key", deleteCredential)
        g.GET("/scheduler", getSchedulerStatus)
        g.POST("/scheduler/restart", restartScheduler)
        g.POST("/scheduler/trigger", triggerScan)
        g.GET("/rate-stats", getRateStats)
        g.GET("/health", getHealth)

        rg.GET("/wallet/status", getWalletStatus)
        rg.GET("/portfolio/risk", getPortfolioRisk)
        rg.GET("/markets/trending", getTrendingMarkets)
}

func getSystemStatus(c *gin.Context) {
        cfg := services.GetConfig()
        uptimeSeconds := int64(time.Since(startTime).Seconds())
        var m runtime.MemStats
        runtime.ReadMemStats(&m)

        networkMode := services.GetNetworkMode()
        telegramOK := services.IsTelegramConfigured()
        clobOK := services.IsClobConfigured()

        schedulerStatus := services.GetSchedulerStatus()

        c.JSON(http.StatusOK, gin.H{
                "status":                 "healthy",
                "uptime":                 uptimeSeconds,
                "networkMode":            networkMode,
                "autoTradingEnabled":     cfg.AutoTradingEnabled,
                "telegramConfigured":     telegramOK,
                "clobConfigured":         clobOK,
                "scheduler":              schedulerStatus,
                "paperTradingMode":       cfg.PaperTradingMode,
                "emergencyStop":          services.IsEmergencyStop(),
                "memoryUsedMB":           m.Alloc / 1024 / 1024,
                "version":                "2.0.0-go",
        })
}

func getSystemConfig(c *gin.Context) {
        cfg := services.GetConfig()
        c.JSON(http.StatusOK, cfg)
}

func getCredentials(c *gin.Context) {
        keys := []string{
                "POLYMARKET_PRIVATE_KEY",
                "POLYMARKET_API_KEY",
                "POLYMARKET_API_SECRET",
                "POLYMARKET_API_PASSPHRASE",
                "TELEGRAM_BOT_TOKEN",
                "TELEGRAM_CHAT_ID",
        }
        result := make(map[string]interface{})
        for _, k := range keys {
                val := db.GetCred(k)
                if val == "" {
                        val = os.Getenv(k)
                }
                result[k] = val != ""
        }
        result["clobConfigured"] = services.IsClobConfigured()
        result["telegramConfigured"] = services.IsTelegramConfigured()
        c.JSON(http.StatusOK, result)
}

func saveCredentials(c *gin.Context) {
        var body map[string]string
        if err := c.ShouldBindJSON(&body); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body"})
                return
        }
        allowedKeys := map[string]bool{
                "POLYMARKET_PRIVATE_KEY":     true,
                "POLYMARKET_API_KEY":         true,
                "POLYMARKET_API_SECRET":      true,
                "POLYMARKET_API_PASSPHRASE":  true,
                "TELEGRAM_BOT_TOKEN":         true,
                "TELEGRAM_CHAT_ID":           true,
        }
        saved := 0
        for k, v := range body {
                if !allowedKeys[k] {
                        continue
                }
                db.DB.Exec("INSERT OR REPLACE INTO app_credentials (key, value) VALUES (?, ?)", k, v)
                saved++
        }
        c.JSON(http.StatusOK, gin.H{
                "message":            "Credentials saved",
                "saved":              saved,
                "clobConfigured":     services.IsClobConfigured(),
                "telegramConfigured": services.IsTelegramConfigured(),
        })
}

func deleteCredential(c *gin.Context) {
        key := c.Param("key")
        db.DB.Exec("DELETE FROM app_credentials WHERE key = ?", key)
        c.JSON(http.StatusOK, gin.H{"message": "Credential deleted", "key": key})
}

func getSchedulerStatus(c *gin.Context) {
        c.JSON(http.StatusOK, services.GetSchedulerStatus())
}

func restartScheduler(c *gin.Context) {
        services.RestartScheduler()
        c.JSON(http.StatusOK, gin.H{"message": "Scheduler restarted", "status": services.GetSchedulerStatus()})
}

func triggerScan(c *gin.Context) {
        services.TriggerManualScan()
        c.JSON(http.StatusOK, gin.H{"message": "Scan triggered"})
}

func getRateStats(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"requestsLastSecond": 0, "queueDepth": 0})
}

func getHealth(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
                "status":  "healthy",
                "uptime":  int64(time.Since(startTime).Seconds()),
                "version": "2.0.0-go",
        })
}

func getWalletStatus(c *gin.Context) {
        configured := services.IsClobConfigured()
        status := gin.H{
                "configured": configured,
                "address":    "",
                "network":    services.GetNetworkMode(),
                "balance":    0,
        }
        if configured {
                status["address"] = services.GetWalletAddress()
                if b, err := services.GetUsdcBalance(); err == nil {
                        status["balance"] = b
                }
        }
        c.JSON(http.StatusOK, status)
}

func getPortfolioRisk(c *gin.Context) {
        positions := services.GetPositions()

        // ── Concentration ──────────────────────────────────────────────────────
        totalValue := 0.0
        for _, p := range positions {
                totalValue += p.Value
        }

        // Herfindahl-Hirschman Index (HHI)
        hhi := 0.0
        topPositionPct := 0.0
        for _, p := range positions {
                if totalValue > 0 {
                        share := p.Value / totalValue
                        hhi += share * share * 10000 // scale to 0-10000
                        pct := share * 100
                        if pct > topPositionPct {
                                topPositionPct = pct
                        }
                }
        }
        concentrationScore := 0
        if len(positions) == 0 {
                concentrationScore = 0
        } else if hhi > 5000 || topPositionPct > 60 {
                concentrationScore = 80
        } else if hhi > 2500 || topPositionPct > 40 {
                concentrationScore = 55
        } else if hhi > 1500 || topPositionPct > 25 {
                concentrationScore = 30
        } else {
                concentrationScore = 10
        }

        // ── Urgency (positions resolving within 7 days) ────────────────────────
        markets, _ := services.GetCachedMarkets()
        endDateMap := make(map[string]string)
        for _, m := range markets {
                endDateMap[m.ID] = m.EndDate
        }

        within7Days := 0
        urgentValue := 0.0
        for _, p := range positions {
                endDate, ok := endDateMap[p.MarketID]
                if !ok {
                        continue
                }
                t, err := time.Parse(time.RFC3339, endDate)
                if err != nil {
                        continue
                }
                days := time.Until(t).Hours() / 24
                if days > 0 && days <= 7 {
                        within7Days++
                        urgentValue += p.Value
                }
        }
        urgentValuePct := 0.0
        if totalValue > 0 {
                urgentValuePct = math.Round((urgentValue/totalValue)*10000) / 100
        }
        urgencyScore := 0
        if within7Days >= 3 || urgentValuePct > 50 {
                urgencyScore = 75
        } else if within7Days >= 1 || urgentValuePct > 20 {
                urgencyScore = 40
        } else {
                urgencyScore = 5
        }

        // ── Drawdown (from P&L history) ────────────────────────────────────────
        pnlHistory := services.GetPnlHistory()
        peakCumulative := 0.0
        currentCumulative := 0.0
        for _, pt := range pnlHistory {
                if pt.Cumulative > peakCumulative {
                        peakCumulative = pt.Cumulative
                }
                currentCumulative = pt.Cumulative
        }
        currentDrawdownPct := 0.0
        if peakCumulative > 0 {
                currentDrawdownPct = math.Round(((peakCumulative-currentCumulative)/peakCumulative)*10000) / 100
                if currentDrawdownPct < 0 {
                        currentDrawdownPct = 0
                }
        }
        drawdownScore := 0
        if currentDrawdownPct > 25 {
                drawdownScore = 85
        } else if currentDrawdownPct > 15 {
                drawdownScore = 60
        } else if currentDrawdownPct > 5 {
                drawdownScore = 30
        } else {
                drawdownScore = 5
        }

        // ── Overall score ──────────────────────────────────────────────────────
        overallScore := int(math.Round(float64(concentrationScore)*0.4 + float64(urgencyScore)*0.3 + float64(drawdownScore)*0.3))
        if overallScore > 100 {
                overallScore = 100
        }
        label := "Healthy"
        if overallScore > 66 {
                label = "Elevated"
        } else if overallScore > 33 {
                label = "Moderate"
        }

        c.JSON(http.StatusOK, gin.H{
                "score": overallScore,
                "label": label,
                "concentration": gin.H{
                        "score":          concentrationScore,
                        "hhi":            math.Round(hhi),
                        "topPositionPct": math.Round(topPositionPct*10) / 10,
                        "positionCount":  len(positions),
                },
                "urgency": gin.H{
                        "score":          urgencyScore,
                        "within7Days":    within7Days,
                        "urgentValuePct": urgentValuePct,
                },
                "drawdown": gin.H{
                        "score":              drawdownScore,
                        "currentDrawdownPct": currentDrawdownPct,
                        "peakCumulative":     math.Round(peakCumulative*100) / 100,
                        "currentCumulative":  math.Round(currentCumulative*100) / 100,
                },
        })
}

func getTrendingMarkets(c *gin.Context) {
        markets, err := services.GetCachedMarkets()
        if err != nil {
                c.JSON(http.StatusOK, []interface{}{})
                return
        }
        prevPrices := services.GetCachedPrevPrices()

        type trendingItem struct {
                ID        string  `json:"id"`
                Question  string  `json:"question"`
                Category  string  `json:"category"`
                YesPrice  float64 `json:"yesPrice"`
                NoPrice   float64 `json:"noPrice"`
                Volume    float64 `json:"volume"`
                Volume24h float64 `json:"volume24h"`
                Liquidity float64 `json:"liquidity"`
                Change    float64 `json:"change"`
        }

        var items []trendingItem
        for _, m := range markets {
                if m.Status != "active" {
                        continue
                }
                change := 0.0
                if prev, ok := prevPrices[m.ID]; ok && prev > 0 {
                        change = ((m.YesPrice - prev) / prev) * 100
                }
                noPrice := 1.0 - m.YesPrice
                items = append(items, trendingItem{
                        ID:        m.ID,
                        Question:  m.Question,
                        Category:  m.Category,
                        YesPrice:  m.YesPrice,
                        NoPrice:   noPrice,
                        Volume:    m.Volume24h,
                        Volume24h: m.Volume24h,
                        Liquidity: m.Liquidity,
                        Change:    change,
                })
        }

        // Sort by volume24h descending
        for i := 1; i < len(items); i++ {
                for j := i; j > 0 && items[j].Volume24h > items[j-1].Volume24h; j-- {
                        items[j], items[j-1] = items[j-1], items[j]
                }
        }
        if len(items) > 20 {
                items = items[:20]
        }
        if items == nil {
                items = []trendingItem{}
        }
        c.JSON(http.StatusOK, items)
}
