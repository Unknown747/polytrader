package services

import (
        "database/sql"
        "log"
        "math"
        "sync"
        "time"

        "polymarket-trader/internal/db"
        "polymarket-trader/internal/models"
)

var (
        schedulerMu           sync.Mutex
        schedulerRunning      bool
        schedulerStop         chan struct{}
        lastSuccessfulScanAt  = time.Now()
        heartbeatFailCount    int
        lastDailyReportDate   string
        scanCycleCount        int
        isScanning            bool
        lastOpportunityKeys   = make(map[string]bool)
        lastLowBalanceAlertAt time.Time
        lastAutoCompoundAt    time.Time
        athEquity             float64
        schedulerStatus       struct {
                running              bool
                scanCycleCount       int
                isScanning           bool
                lastSuccessfulScanAt time.Time
        }
)

func StartScheduler() {
        schedulerMu.Lock()
        defer schedulerMu.Unlock()
        if schedulerRunning {
                return
        }
        schedulerStop = make(chan struct{})
        schedulerRunning = true
        log.Println("Scheduler started")
        go runSchedulerLoop()
}

func StopScheduler() {
        schedulerMu.Lock()
        defer schedulerMu.Unlock()
        if !schedulerRunning {
                return
        }
        close(schedulerStop)
        schedulerRunning = false
        log.Println("Scheduler stopped")
}

func RestartScheduler() {
        StopScheduler()
        time.Sleep(100 * time.Millisecond)
        StartScheduler()
}

func TriggerManualScan() {
        go runScan()
}

func GetSchedulerStatus() map[string]interface{} {
        schedulerMu.Lock()
        defer schedulerMu.Unlock()
        lastScanAgo := int64(time.Since(lastSuccessfulScanAt).Seconds())
        return map[string]interface{}{
                "running":              schedulerRunning,
                "scanCycleCount":       scanCycleCount,
                "isScanning":           isScanning,
                "lastSuccessfulScanAgo": lastScanAgo,
        }
}

func runSchedulerLoop() {
        runScan()
        for {
                cfg := GetConfig()
                interval := time.Duration(cfg.ScanIntervalMinutes) * time.Minute
                if interval < time.Minute {
                        interval = time.Minute
                }
                select {
                case <-schedulerStop:
                        return
                case <-time.After(interval):
                        runScan()
                }
        }
}

func runScan() {
        schedulerMu.Lock()
        if isScanning {
                schedulerMu.Unlock()
                log.Println("Scan already in progress, skipping")
                return
        }
        isScanning = true
        scanCycleCount++
        schedulerMu.Unlock()

        defer func() {
                schedulerMu.Lock()
                isScanning = false
                schedulerMu.Unlock()
        }()

        log.Printf("Strategy scan starting (cycle %d)", scanCycleCount)
        InvalidateCache()

        markets, err := GetCachedMarkets()
        if err != nil {
                log.Printf("Strategy scan failed: %v", err)
                return
        }

        priceMap := make(map[string]float64)
        for _, m := range markets {
                priceMap[m.ID] = m.YesPrice
        }
        if len(priceMap) > 0 {
                UpdatePositionPrices(priceMap)
                BatchRecordMarketPrices(priceMap)
                log.Printf("Position prices updated: %d markets", len(priceMap))
        }

        cfg := GetConfig()
        opportunities := ScanOpportunities(markets, cfg)

        // Equity snapshot
        balance := 0.0
        if IsClobConfigured() {
                balance, _ = GetUsdcBalance()
        }
        summary := GetPortfolioSummary()
        unrealizedPnl := 0.0
        if v, ok := summary["totalPnl"]; ok {
                if f, ok2 := v.(float64); ok2 {
                        unrealizedPnl = f
                }
        }
        RecordEquitySnapshot(balance, unrealizedPnl)

        lastSuccessfulScanAt = time.Now()

        if cfg.TelegramAlertsEnabled || cfg.AutoTradingEnabled {
                var newOps []models.Opportunity
                for _, op := range opportunities {
                        key := op.MarketID + "-" + op.RecommendedSide
                        if !lastOpportunityKeys[key] {
                                newOps = append(newOps, op)
                        }
                }
                newKeys := make(map[string]bool)
                for _, op := range opportunities {
                        newKeys[op.MarketID+"-"+op.RecommendedSide] = true
                }
                lastOpportunityKeys = newKeys

                if len(newOps) > 0 && cfg.TelegramAlertsEnabled {
                        NotifyOpportunities(newOps)
                }

                if cfg.AutoTradingEnabled && GetNetworkMode() != "testnet" {
                        executeOpportunities(opportunities, cfg)
                }
        }

        checkPriceAlerts(priceMap)
        checkExpiringPositions()
        checkStopLossTakeProfit(cfg)
        checkMarketResolutions()
        checkDailyReport(cfg)
        checkLowBalance(cfg)
        runAutoCompound(cfg)

        isTestnet := GetNetworkMode() == "testnet"
        if cfg.PaperTradingMode || isTestnet {
                ExecutePaperOpportunities(opportunities, cfg)
                ResolvePaperTradesNearResolution(priceMap, &cfg)
        }

        if scanCycleCount%4 == 0 {
                reconcileOrphanedOrders()
        }

        log.Printf("Strategy scan complete: total=%d opportunities", len(opportunities))
}

func executeOpportunities(opportunities []models.Opportunity, cfg models.StrategyConfig) {
        if !cfg.AutoTradingEnabled {
                return
        }
        if IsEmergencyStop() {
                log.Println("Auto-trading: emergency stop active")
                return
        }
        if !IsClobConfigured() {
                return
        }

        today := TradesToday()
        remaining := cfg.MaxDailyTrades - today
        if remaining <= 0 {
                log.Printf("Auto-trading: daily limit reached (%d/%d)", today, cfg.MaxDailyTrades)
                return
        }

        balance, _ := GetUsdcBalance()
        if balance < 1 {
                log.Printf("Auto-trading: insufficient USDC balance ($%.2f)", balance)
                return
        }

        positions := GetPositions()
        categoryMap := make(map[string]string)
        for _, op := range opportunities {
                categoryMap[op.MarketID] = op.Category
        }
        var openCategories []string
        for _, p := range positions {
                if cat, ok := categoryMap[p.MarketID]; ok {
                        openCategories = append(openCategories, cat)
                } else {
                        openCategories = append(openCategories, "General")
                }
        }

        count := 0
        for _, op := range opportunities {
                if count >= remaining {
                        break
                }
                if op.Edge < cfg.MinEdge {
                        continue
                }
                if op.CompositeScore < 0.4 {
                        continue
                }
                if ShouldSkipMarket(op.MarketID, op.RecommendedSide) {
                        continue
                }
                if op.ConditionID == "" {
                        continue
                }
                if cfg.VolatilityCheckEnabled && IsVolatile(op.MarketID, op.CurrentPrice, cfg.VolatilityThresholdPct) {
                        log.Printf("Auto-trading: skipping volatile market: %s", op.Question)
                        continue
                }

                corrPenalty := ComputeCorrelationPenalty(op.Category, openCategories)
                riskCapPct := cfg.MaxRiskPerTradePct
                if riskCapPct == 0 {
                        riskCapPct = cfg.MaxPositionPct
                }
                amount := math.Min(
                        balance*op.KellyFraction*corrPenalty,
                        math.Min((balance*riskCapPct)/100, balance*0.2),
                )
                if op.Liquidity > 0 && amount/op.Liquidity > 0.10 {
                        amount = op.Liquidity * 0.05
                }
                if amount < 0.5 {
                        continue
                }
                amount = math.Round(amount*100) / 100

                side := "BUY"
                if op.RecommendedSide == "NO" {
                        side = "SELL"
                }
                success, orderID, errMsg := PlaceOrder(PlaceOrderParams{
                        TokenID:  op.ConditionID,
                        Side:     side,
                        Price:    op.CurrentPrice,
                        Amount:   amount,
                        Question: op.Question,
                })

                var orderIDPtr *string
                if orderID != "" {
                        orderIDPtr = &orderID
                }
                var errPtr *string
                if errMsg != "" {
                        errPtr = &errMsg
                }
                record := models.TradeRecord{
                        Timestamp:      time.Now().Format(time.RFC3339),
                        MarketID:       op.MarketID,
                        Question:       op.Question,
                        Side:           op.RecommendedSide,
                        Price:          op.CurrentPrice,
                        Amount:         amount,
                        Edge:           op.Edge,
                        CompositeScore: op.CompositeScore,
                        OrderID:        orderIDPtr,
                        Success:        success,
                        Error:          errPtr,
                }
                PersistTrade(record)

                if success {
                        count++
                        openCategories = append(openCategories, op.Category)
                        AddOrder(models.OrderEntry{
                                MarketID:       op.MarketID,
                                MarketQuestion: op.Question,
                                Side:           op.RecommendedSide,
                                Type:           "BUY",
                                Price:          op.CurrentPrice,
                                Amount:         amount,
                                Shares:         math.Round((amount/op.CurrentPrice)*100) / 100,
                                Status:         "filled",
                        })
                        NotifyOrderFilled(op.Question, op.RecommendedSide, op.CurrentPrice, amount)
                        log.Printf("Auto-trade executed: %s %s", op.Question, op.RecommendedSide)
                } else {
                        log.Printf("Auto-trade failed: %s — %s", op.Question, errMsg)
                }
                time.Sleep(500 * time.Millisecond)
        }
}

func checkPriceAlerts(priceMap map[string]float64) {
        cfg := GetConfig()
        if !cfg.TelegramAlertsEnabled {
                return
        }
        rows, err := db.DB.Query("SELECT id, market_id, market_question, side, direction, target_price FROM price_alerts WHERE triggered = 0")
        if err != nil {
                return
        }
        defer rows.Close()
        type alertRow struct {
                id          int64
                marketID    string
                question    string
                side        string
                direction   string
                targetPrice float64
        }
        var alerts []alertRow
        for rows.Next() {
                var a alertRow
                rows.Scan(&a.id, &a.marketID, &a.question, &a.side, &a.direction, &a.targetPrice)
                alerts = append(alerts, a)
        }
        rows.Close()

        for _, a := range alerts {
                yesPrice, ok := priceMap[a.marketID]
                if !ok {
                        continue
                }
                currentPrice := yesPrice
                if a.side == "NO" {
                        currentPrice = 1 - yesPrice
                }
                triggered := (a.direction == "above" && currentPrice >= a.targetPrice) ||
                        (a.direction == "below" && currentPrice <= a.targetPrice)
                if triggered {
                        db.DB.Exec("UPDATE price_alerts SET triggered = 1, triggered_at = ? WHERE id = ?", time.Now().Format(time.RFC3339), a.id)
                        NotifyPriceAlert(a.question, a.side, a.direction, a.targetPrice, currentPrice)
                }
        }
}

func checkExpiringPositions() {
        cfg := GetConfig()
        if !cfg.TelegramAlertsEnabled {
                return
        }
        positions := GetPositions()
        if len(positions) == 0 {
                return
        }
        markets, err := GetCachedMarkets()
        if err != nil {
                return
        }
        marketMap := make(map[string]string)
        for _, m := range markets {
                marketMap[m.ID] = m.EndDate
        }
        for _, pos := range positions {
                endDate, ok := marketMap[pos.MarketID]
                if !ok {
                        continue
                }
                t, err := time.Parse(time.RFC3339, endDate)
                if err != nil {
                        continue
                }
                msLeft := t.Sub(time.Now())
                hoursLeft := msLeft.Hours()
                if hoursLeft > 0 && hoursLeft <= 48 {
                        NotifyExpiringPosition(pos.MarketQuestion, pos.Side, int(hoursLeft), pos.CurrentPrice, pos.Pnl, pos.Value)
                        log.Printf("Expiring position alert: %s %.1fh", pos.MarketID, hoursLeft)
                }
        }
}

func checkDailyReport(cfg models.StrategyConfig) {
        if !cfg.TelegramAlertsEnabled {
                return
        }
        now := time.Now().UTC()
        todayDate := now.Format("2006-01-02")
        if now.Hour() == cfg.DailyReportHour && todayDate != lastDailyReportDate {
                lastDailyReportDate = todayDate
                summary := GetPortfolioSummary()
                pnl := 0.0
                pnlPct := 0.0
                openPositions := 0
                totalValue := 0.0
                totalTrades := 0
                winRate := 0.0
                if v, ok := summary["totalPnl"].(float64); ok {
                        pnl = v
                }
                if v, ok := summary["totalPnlPercent"].(float64); ok {
                        pnlPct = v
                }
                if v, ok := summary["openPositions"].(int); ok {
                        openPositions = v
                }
                if v, ok := summary["totalValue"].(float64); ok {
                        totalValue = v
                }
                if v, ok := summary["totalTrades"].(int); ok {
                        totalTrades = v
                }
                if v, ok := summary["winRate"].(float64); ok {
                        winRate = v
                }
                NotifyDailyReport(pnl, pnlPct, openPositions, totalValue, totalTrades, winRate)
        }
}

func checkStopLossTakeProfit(cfg models.StrategyConfig) {
        slPct := math.Max(10, math.Min(20, cfg.StopLossPct))
        positions := GetPositions()
        for _, pos := range positions {
                if pos.AvgPrice <= 0 || pos.CurrentPrice <= 0 {
                        continue
                }
                pnlPct := ((pos.CurrentPrice - pos.AvgPrice) / pos.AvgPrice) * 100

                if pnlPct <= -slPct && cfg.StopLossAutoExecute {
                        if !HasRiskEvent(pos.ID, "sl") {
                                log.Printf("Stop-loss executing: %s pnl=%.1f%%", pos.MarketID, pnlPct)
                                result := FullClosePosition(pos.ID, pos.CurrentPrice)
                                realizedPnl := 0.0
                                if result != nil {
                                        realizedPnl = result.RealizedPnl
                                }
                                RecordRiskEvent(pos.ID, "sl", pos.Shares, realizedPnl, pos.CurrentPrice)
                                NotifyStopLossExecuted(pos.MarketQuestion, pos.Side, pos.AvgPrice, pos.CurrentPrice, pos.Shares, realizedPnl, pnlPct)
                        }
                        continue
                }

                if !cfg.TakeProfitEnabled {
                        continue
                }

                if pnlPct >= cfg.TakeProfitTier1Pct && !HasRiskEvent(pos.ID, "tp1") {
                        costBasis := pos.Shares * pos.AvgPrice
                        sharesToSell := math.Min(costBasis/pos.CurrentPrice, pos.Shares)
                        if sharesToSell < 0.001 {
                                continue
                        }
                        result := PartialClosePosition(pos.ID, sharesToSell, pos.CurrentPrice)
                        if result == nil {
                                continue
                        }
                        RecordRiskEvent(pos.ID, "tp1", sharesToSell, result.RealizedPnl, pos.CurrentPrice)
                        NotifyTakeProfitTierExecuted(pos.MarketQuestion, pos.Side, 1, cfg.TakeProfitTier1Pct, pos.AvgPrice, pos.CurrentPrice, sharesToSell, result.RealizedPnl, result.RemainingShares, "capital_recovery")
                } else if pnlPct >= cfg.TakeProfitTier2Pct && HasRiskEvent(pos.ID, "tp1") && !HasRiskEvent(pos.ID, "tp2") {
                        sharesToSell := pos.Shares * 0.5
                        if sharesToSell < 0.001 {
                                continue
                        }
                        result := PartialClosePosition(pos.ID, sharesToSell, pos.CurrentPrice)
                        if result == nil {
                                continue
                        }
                        RecordRiskEvent(pos.ID, "tp2", sharesToSell, result.RealizedPnl, pos.CurrentPrice)
                        NotifyTakeProfitTierExecuted(pos.MarketQuestion, pos.Side, 2, cfg.TakeProfitTier2Pct, pos.AvgPrice, pos.CurrentPrice, sharesToSell, result.RealizedPnl, result.RemainingShares, "half_remaining")
                } else if pnlPct >= cfg.TakeProfitTier3Pct && !HasRiskEvent(pos.ID, "tp3") {
                        sharesToSell := pos.Shares
                        result := FullClosePosition(pos.ID, pos.CurrentPrice)
                        if result == nil {
                                continue
                        }
                        RecordRiskEvent(pos.ID, "tp3", sharesToSell, result.RealizedPnl, pos.CurrentPrice)
                        NotifyTakeProfitTierExecuted(pos.MarketQuestion, pos.Side, 3, cfg.TakeProfitTier3Pct, pos.AvgPrice, pos.CurrentPrice, sharesToSell, result.RealizedPnl, 0, "full_close")
                }
        }
}

func checkMarketResolutions() {
        cfg := GetConfig()
        if !cfg.TelegramAlertsEnabled {
                return
        }
        positions := GetPositions()
        for _, pos := range positions {
                var exists int
                db.DB.QueryRow("SELECT 1 FROM resolved_market_notifications WHERE position_id = ? AND side = ?", pos.ID, pos.Side).Scan(&exists)
                if exists == 1 {
                        continue
                }
                isResolvedYes := pos.CurrentPrice >= 0.97
                isResolvedNo := pos.CurrentPrice <= 0.03
                if !isResolvedYes && !isResolvedNo {
                        continue
                }
                isWin := (pos.Side == "YES" && isResolvedYes) || (pos.Side == "NO" && isResolvedNo)
                finalPrice := 0.0
                if isResolvedYes {
                        finalPrice = 1.0
                }
                db.DB.Exec("INSERT OR IGNORE INTO resolved_market_notifications (position_id, side, notified_at) VALUES (?, ?, ?)", pos.ID, pos.Side, time.Now().Format(time.RFC3339))
                outcome := "loss"
                if isWin {
                        outcome = "win"
                }
                NotifyMarketResolved(pos.MarketQuestion, pos.Side, outcome, pos.Pnl, finalPrice)
        }
}

func checkLowBalance(cfg models.StrategyConfig) {
        if !cfg.TelegramAlertsEnabled || !IsClobConfigured() {
                return
        }
        if time.Since(lastLowBalanceAlertAt) < 4*time.Hour {
                return
        }
        balance, err := GetUsdcBalance()
        if err != nil || balance <= 0 {
                return
        }
        var threshold float64
        var mode, suggestion string
        if balance >= 50 {
                return
        } else if balance < 5 {
                threshold = 20
                mode = "Kritis"
                suggestion = "Saldo sangat rendah. Top-up segera."
        } else if balance < 20 {
                threshold = 20
                mode = "Micro"
                suggestion = "Minimal $20 agar bot bisa place order."
        } else {
                threshold = 50
                mode = "Small Capital"
                suggestion = "Dengan $50+ bot bisa diversifikasi lebih baik."
        }

        var lastAlertAt sql.NullString
        db.DB.QueryRow("SELECT alerted_at FROM low_balance_alerts ORDER BY id DESC LIMIT 1").Scan(&lastAlertAt)
        if lastAlertAt.Valid {
                t, _ := time.Parse(time.RFC3339, lastAlertAt.String)
                if time.Since(t) < 4*time.Hour {
                        return
                }
        }
        db.DB.Exec("INSERT INTO low_balance_alerts (balance, threshold, alerted_at) VALUES (?, ?, ?)", balance, threshold, time.Now().Format(time.RFC3339))
        lastLowBalanceAlertAt = time.Now()
        NotifyLowBalance(balance, threshold, mode, suggestion)
}

func runAutoCompound(cfg models.StrategyConfig) {
        if !cfg.AutoCompound || !IsClobConfigured() {
                return
        }
        if time.Since(lastAutoCompoundAt) < 24*time.Hour {
                return
        }
        balance, err := GetUsdcBalance()
        if err != nil || balance <= 0 || balance == cfg.Bankroll {
                return
        }
        profit := balance - cfg.Bankroll
        if math.Abs(profit) < 0.50 {
                return
        }
        profitPct := 0.0
        if cfg.Bankroll > 0 {
                profitPct = (profit / cfg.Bankroll) * 100
        }
        UpdateConfig(map[string]interface{}{"bankroll": math.Round(balance*100) / 100})
        lastAutoCompoundAt = time.Now()
        log.Printf("Auto-compound: bankroll updated $%.2f -> $%.2f", cfg.Bankroll, balance)
        if cfg.TelegramAlertsEnabled {
                NotifyAutoCompound(cfg.Bankroll, balance, profit, profitPct)
        }
}

func reconcileOrphanedOrders() {
        if !IsClobConfigured() {
                return
        }
        openOrders := GetOpenOrders()
        if len(openOrders) == 0 {
                return
        }
        openOrderIDs := make(map[string]bool)
        for _, o := range openOrders {
                openOrderIDs[o.ID] = true
        }
        rows, err := db.DB.Query("SELECT id, order_id FROM auto_trade_history WHERE success = 0 AND order_id IS NOT NULL")
        if err != nil {
                return
        }
        defer rows.Close()
        var toRecover []struct {
                id      int64
                orderID string
        }
        for rows.Next() {
                var id int64
                var orderID string
                rows.Scan(&id, &orderID)
                if openOrderIDs[orderID] {
                        toRecover = append(toRecover, struct {
                                id      int64
                                orderID string
                        }{id, orderID})
                }
        }
        rows.Close()
        for _, r := range toRecover {
                db.DB.Exec("UPDATE auto_trade_history SET success = 1 WHERE id = ?", r.id)
                log.Printf("Orphaned order recovered: id=%d orderID=%s", r.id, r.orderID)
        }
}
