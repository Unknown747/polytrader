package services

import (
        "database/sql"
        "log"
        "math"
        "time"

        "polymarket-trader/internal/db"
        "polymarket-trader/internal/models"
)

const paperBalanceKey = "paper_balance"
const paperInitialKey = "paper_initial_balance"

func getPaperBalance(cfg models.StrategyConfig) float64 {
        var fval float64
        err := db.DB.QueryRow("SELECT CAST(value AS REAL) FROM paper_portfolio WHERE key = ?", paperBalanceKey).Scan(&fval)
        if err != nil {
                return cfg.PaperBankroll
        }
        return fval
}

func setPaperBalance(balance float64) {
        db.DB.Exec("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)", paperBalanceKey, balance)
}

func getInitialBalance(cfg models.StrategyConfig) float64 {
        var val float64
        err := db.DB.QueryRow("SELECT CAST(value AS REAL) FROM paper_portfolio WHERE key = ?", paperInitialKey).Scan(&val)
        if err == sql.ErrNoRows || val == 0 {
                db.DB.Exec("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)", paperInitialKey, cfg.PaperBankroll)
                return cfg.PaperBankroll
        }
        return val
}

func alreadyOpenToday(marketID, side string) bool {
        start := time.Now().Truncate(24 * time.Hour)
        var count int
        db.DB.QueryRow(
                "SELECT COUNT(*) FROM paper_trades WHERE market_id = ? AND side = ? AND timestamp >= ? AND status IN ('open','pending')",
                marketID, side, start.Format(time.RFC3339),
        ).Scan(&count)
        return count > 0
}

func ExecutePaperOpportunities(opportunities []models.Opportunity, cfg models.StrategyConfig) []models.PaperTrade {
        if !cfg.PaperTradingMode {
                return nil
        }
        balance := getPaperBalance(cfg)
        if balance < 1 {
                log.Printf("Paper trading: balance too low ($%.2f)", balance)
                return nil
        }

        slippagePct := cfg.PaperSlippagePct
        takerFeePct := cfg.PaperTakerFeePct

        var eligible []models.Opportunity
        for _, op := range opportunities {
                if op.Edge < cfg.MinEdge {
                        continue
                }
                if op.CompositeScore < 0.4 {
                        continue
                }
                if alreadyOpenToday(op.MarketID, op.RecommendedSide) {
                        continue
                }
                if op.Volume24h < 500 {
                        continue
                }
                if op.Liquidity < 1000 {
                        continue
                }
                eligible = append(eligible, op)
                if len(eligible) >= cfg.MaxDailyTrades {
                        break
                }
        }

        var placed []models.PaperTrade
        for _, op := range eligible {
                maxAmount := (balance * cfg.MaxPositionPct) / 100
                kellyAmount := cfg.PaperBankroll * op.KellyFraction
                amount := math.Min(kellyAmount, math.Min(maxAmount, balance*0.2))
                amount = math.Round(amount*100) / 100
                if amount < 1 {
                        continue
                }

                slippageFactor := slippagePct / 100
                effectiveEntryPrice := op.CurrentPrice * (1 + slippageFactor)
                if op.RecommendedSide == "NO" {
                        effectiveEntryPrice = op.CurrentPrice * (1 - slippageFactor)
                }
                if effectiveEntryPrice > 0.99 {
                        effectiveEntryPrice = 0.99
                }
                if effectiveEntryPrice < 0.01 {
                        effectiveEntryPrice = 0.01
                }

                feeCost := math.Round(amount*(takerFeePct/100)*100) / 100
                amountAfterFee := math.Round((amount-feeCost)*100) / 100
                shares := math.Round((amountAfterFee/effectiveEntryPrice)*1000) / 1000
                balance = math.Round((balance-amount)*100) / 100
                setPaperBalance(balance)

                now := time.Now().Format(time.RFC3339)
                res, err := db.DB.Exec(
                        "INSERT INTO paper_trades (timestamp, market_id, question, category, side, entry_price, effective_entry_price, amount, shares, edge, composite_score, slippage_pct, fee_pct, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
                        now, op.MarketID, op.Question, op.Category, op.RecommendedSide, op.CurrentPrice, effectiveEntryPrice, amount, shares, op.Edge, op.CompositeScore, slippagePct, takerFeePct,
                )
                if err != nil {
                        log.Printf("Paper trade insert failed: %v", err)
                        continue
                }
                id, _ := res.LastInsertId()

                trade := models.PaperTrade{
                        ID:                  id,
                        Timestamp:           now,
                        MarketID:            op.MarketID,
                        Question:            op.Question,
                        Category:            op.Category,
                        Side:                op.RecommendedSide,
                        EntryPrice:          op.CurrentPrice,
                        EffectiveEntryPrice: effectiveEntryPrice,
                        Amount:              amount,
                        Shares:              shares,
                        Edge:                op.Edge,
                        CompositeScore:      op.CompositeScore,
                        SlippagePct:         slippagePct,
                        FeePct:              takerFeePct,
                        Status:              "open",
                }
                placed = append(placed, trade)
                log.Printf("Paper trade placed: %s %s $%.2f effectiveEntry=%.3f", op.Question, op.RecommendedSide, amount, effectiveEntryPrice)

                if cfg.TelegramAlertsEnabled {
                        NotifyPaperTrade(op.Question, op.RecommendedSide, op.CurrentPrice, amount, op.Edge, balance)
                }

                time.Sleep(100 * time.Millisecond)
        }
        return placed
}

func ResolvePaperTradesNearResolution(priceMap map[string]float64, cfg *models.StrategyConfig) {
        rows, err := db.DB.Query("SELECT id, market_id, side, entry_price, effective_entry_price, amount, shares, slippage_pct, fee_pct FROM paper_trades WHERE status IN ('open', 'pending')")
        if err != nil {
                return
        }
        defer rows.Close()

        type row struct {
                id                  int64
                marketID            string
                side                string
                entryPrice          float64
                effectiveEntryPrice sql.NullFloat64
                amount              float64
                shares              float64
                slippagePct         float64
                feePct              float64
        }

        var openTrades []row
        for rows.Next() {
                var r row
                rows.Scan(&r.id, &r.marketID, &r.side, &r.entryPrice, &r.effectiveEntryPrice, &r.amount, &r.shares, &r.slippagePct, &r.feePct)
                openTrades = append(openTrades, r)
        }
        rows.Close()

        slippagePct := 0.75
        takerFeePct := 1.0
        if cfg != nil {
                slippagePct = cfg.PaperSlippagePct
                takerFeePct = cfg.PaperTakerFeePct
        }

        for _, t := range openTrades {
                yesPrice, ok := priceMap[t.marketID]
                if !ok {
                        continue
                }
                currentPrice := yesPrice
                if t.side == "NO" {
                        currentPrice = 1 - yesPrice
                }
                isWon := currentPrice >= 0.97
                isLost := currentPrice <= 0.03
                if !isWon && !isLost {
                        continue
                }

                rawExitPrice := 0.0
                if isWon {
                        rawExitPrice = 1.0
                }
                slipFactor := t.slippagePct / 100
                if t.slippagePct == 0 {
                        slipFactor = slippagePct / 100
                }
                effectiveExitPrice := rawExitPrice
                if isWon {
                        effectiveExitPrice = math.Max(0, rawExitPrice*(1-slipFactor))
                }

                feeRate := t.feePct / 100
                if t.feePct == 0 {
                        feeRate = takerFeePct / 100
                }
                grossProceeds := t.shares * effectiveExitPrice
                exitFee := grossProceeds * feeRate
                netProceeds := grossProceeds - exitFee
                pnl := math.Round((netProceeds-t.amount)*100) / 100
                pnlPct := 0.0
                if t.amount > 0 {
                        pnlPct = math.Round((pnl/t.amount)*10000) / 100
                }
                status := "lost"
                if isWon {
                        status = "won"
                }
                now := time.Now().Format(time.RFC3339)

                db.DB.Exec(
                        "UPDATE paper_trades SET status = ?, exit_price = ?, effective_exit_price = ?, pnl = ?, pnl_pct = ?, closed_at = ? WHERE id = ?",
                        status, rawExitPrice, effectiveExitPrice, pnl, pnlPct, now, t.id,
                )

                bal := getPaperBalance(models.StrategyConfig{PaperBankroll: 1000})
                newBal := math.Round((bal+t.amount+pnl)*100) / 100
                setPaperBalance(newBal)
                log.Printf("Paper trade resolved: id=%d status=%s pnl=%.2f", t.id, status, pnl)
        }
}

func GetPaperPortfolio(cfg models.StrategyConfig) map[string]interface{} {
        balance := getPaperBalance(cfg)
        initialBalance := getInitialBalance(cfg)

        rows, err := db.DB.Query("SELECT id, timestamp, market_id, question, category, side, entry_price, COALESCE(effective_entry_price, entry_price), amount, shares, edge, composite_score, COALESCE(slippage_pct,0), COALESCE(fee_pct,0), status, exit_price, effective_exit_price, pnl, pnl_pct, closed_at FROM paper_trades ORDER BY timestamp DESC LIMIT 100")
        if err != nil {
                return map[string]interface{}{"balance": balance, "initialBalance": initialBalance, "trades": []interface{}{}}
        }
        defer rows.Close()

        var trades []models.PaperTrade
        for rows.Next() {
                var t models.PaperTrade
                var exitPrice, effectiveExitPrice, pnl, pnlPct sql.NullFloat64
                var closedAt sql.NullString
                rows.Scan(&t.ID, &t.Timestamp, &t.MarketID, &t.Question, &t.Category, &t.Side, &t.EntryPrice, &t.EffectiveEntryPrice, &t.Amount, &t.Shares, &t.Edge, &t.CompositeScore, &t.SlippagePct, &t.FeePct, &t.Status, &exitPrice, &effectiveExitPrice, &pnl, &pnlPct, &closedAt)
                if exitPrice.Valid {
                        t.ExitPrice = &exitPrice.Float64
                }
                if effectiveExitPrice.Valid {
                        t.EffectiveExitPrice = &effectiveExitPrice.Float64
                }
                if pnl.Valid {
                        t.Pnl = &pnl.Float64
                }
                if pnlPct.Valid {
                        t.PnlPct = &pnlPct.Float64
                }
                if closedAt.Valid {
                        t.ClosedAt = &closedAt.String
                }
                trades = append(trades, t)
        }

        var closed, openTrades, winning []models.PaperTrade
        for _, t := range trades {
                if t.Status == "won" || t.Status == "lost" {
                        closed = append(closed, t)
                        if t.Status == "won" {
                                winning = append(winning, t)
                        }
                } else {
                        openTrades = append(openTrades, t)
                }
        }

        totalPnl := 0.0
        for _, t := range closed {
                if t.Pnl != nil {
                        totalPnl += *t.Pnl
                }
        }
        openPositionValue := 0.0
        for _, t := range openTrades {
                openPositionValue += t.Amount
        }
        totalPnlPct := 0.0
        if initialBalance > 0 {
                totalPnlPct = (totalPnl / initialBalance) * 100
        }
        winRate := 0.0
        if len(closed) > 0 {
                winRate = math.Round(float64(len(winning))/float64(len(closed))*1000) / 10
        }

        return map[string]interface{}{
                "balance":           balance,
                "initialBalance":    initialBalance,
                "totalTrades":       len(closed),
                "openTrades":        len(openTrades),
                "winningTrades":     len(winning),
                "losingTrades":      len(closed) - len(winning),
                "totalPnl":          math.Round(totalPnl*100) / 100,
                "totalPnlPct":       math.Round(totalPnlPct*100) / 100,
                "winRate":           winRate,
                "openPositionValue": math.Round(openPositionValue*100) / 100,
                "trades":            trades,
        }
}

func ResetPaperPortfolio(cfg models.StrategyConfig) {
        db.DB.Exec("DELETE FROM paper_trades")
        db.DB.Exec("DELETE FROM paper_portfolio")
        db.DB.Exec("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)", paperBalanceKey, cfg.PaperBankroll)
        db.DB.Exec("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)", paperInitialKey, cfg.PaperBankroll)
        log.Printf("Paper portfolio reset to $%.2f", cfg.PaperBankroll)
}

func GetPerformanceAnalytics() map[string]interface{} {
        rows, err := db.DB.Query("SELECT id, timestamp, market_id, question, category, side, entry_price, COALESCE(effective_entry_price, entry_price), amount, shares, edge, composite_score, COALESCE(slippage_pct,0), COALESCE(fee_pct,0), status, exit_price, effective_exit_price, pnl, pnl_pct, closed_at FROM paper_trades WHERE status IN ('won','lost') ORDER BY timestamp DESC LIMIT 500")
        if err != nil {
                return map[string]interface{}{"byCategory": []interface{}{}, "totalTrades": 0}
        }
        defer rows.Close()

        var all []models.PaperTrade
        for rows.Next() {
                var t models.PaperTrade
                var exitPrice, effectiveExitPrice, pnl, pnlPct sql.NullFloat64
                var closedAt sql.NullString
                rows.Scan(&t.ID, &t.Timestamp, &t.MarketID, &t.Question, &t.Category, &t.Side, &t.EntryPrice, &t.EffectiveEntryPrice, &t.Amount, &t.Shares, &t.Edge, &t.CompositeScore, &t.SlippagePct, &t.FeePct, &t.Status, &exitPrice, &effectiveExitPrice, &pnl, &pnlPct, &closedAt)
                if exitPrice.Valid {
                        t.ExitPrice = &exitPrice.Float64
                }
                if pnl.Valid {
                        t.Pnl = &pnl.Float64
                }
                if pnlPct.Valid {
                        t.PnlPct = &pnlPct.Float64
                }
                if closedAt.Valid {
                        t.ClosedAt = &closedAt.String
                }
                all = append(all, t)
        }

        byCategory := make(map[string]struct {
                wins, total int
                pnl, edge   float64
        })
        for _, t := range all {
                c := byCategory[t.Category]
                c.total++
                c.edge += t.Edge
                if t.Pnl != nil {
                        c.pnl += *t.Pnl
                }
                if t.Status == "won" {
                        c.wins++
                }
                byCategory[t.Category] = c
        }

        var catSummary []map[string]interface{}
        for cat, d := range byCategory {
                winRate := 0.0
                if d.total > 0 {
                        winRate = math.Round(float64(d.wins)/float64(d.total)*1000) / 10
                }
                catSummary = append(catSummary, map[string]interface{}{
                        "category": cat,
                        "trades":   d.total,
                        "winRate":  winRate,
                        "totalPnl": math.Round(d.pnl*100) / 100,
                        "avgEdge":  math.Round((d.edge/math.Max(1, float64(d.total)))*10000) / 100,
                })
        }

        winning := 0
        totalPnl := 0.0
        avgEdge := 0.0
        totalFees := 0.0
        totalSlippage := 0.0
        for _, t := range all {
                if t.Status == "won" {
                        winning++
                }
                if t.Pnl != nil {
                        totalPnl += *t.Pnl
                }
                avgEdge += t.Edge
                totalFees += t.Amount * (t.FeePct / 100)
                totalSlippage += t.Amount * (t.SlippagePct / 100)
        }
        overallWinRate := 0.0
        if len(all) > 0 {
                overallWinRate = math.Round(float64(winning)/float64(len(all))*1000) / 10
                avgEdge = math.Round((avgEdge/float64(len(all)))*10000) / 100
        }

        return map[string]interface{}{
                "byCategory":        catSummary,
                "bestTrades":        []interface{}{},
                "worstTrades":       []interface{}{},
                "totalTrades":       len(all),
                "overallWinRate":    overallWinRate,
                "totalPnl":          math.Round(totalPnl*100) / 100,
                "avgEdge":           avgEdge,
                "totalFeesPaid":     math.Round(totalFees*100) / 100,
                "totalSlippageCost": math.Round(totalSlippage*100) / 100,
        }
}

func GetEquityCurve() []map[string]interface{} {
        rows, err := db.DB.Query("SELECT timestamp, balance, unrealized_pnl, total_value, drawdown_pct, is_ath FROM equity_snapshots ORDER BY timestamp ASC LIMIT 500")
        if err != nil {
                return nil
        }
        defer rows.Close()
        var result []map[string]interface{}
        for rows.Next() {
                var timestamp string
                var balance, unrealizedPnl, totalValue, drawdownPct float64
                var isAth int
                rows.Scan(&timestamp, &balance, &unrealizedPnl, &totalValue, &drawdownPct, &isAth)
                result = append(result, map[string]interface{}{
                        "timestamp":    timestamp,
                        "balance":      balance,
                        "totalValue":   totalValue,
                        "drawdownPct":  drawdownPct,
                        "isAth":        isAth == 1,
                })
        }
        return result
}

func RecordEquitySnapshot(balance, unrealizedPnl float64) {
        totalValue := balance + unrealizedPnl
        var athVal float64
        db.DB.QueryRow("SELECT MAX(total_value) FROM equity_snapshots").Scan(&athVal)
        isAth := 0
        if totalValue > athVal {
                isAth = 1
        }
        drawdown := 0.0
        if athVal > 0 {
                drawdown = math.Round(((athVal-totalValue)/athVal)*10000) / 100
        }
        db.DB.Exec(
                "INSERT INTO equity_snapshots (timestamp, balance, unrealized_pnl, total_value, drawdown_pct, is_ath) VALUES (?, ?, ?, ?, ?, ?)",
                time.Now().Format(time.RFC3339), balance, unrealizedPnl, totalValue, drawdown, isAth,
        )
        cutoff := time.Now().AddDate(0, 0, -90).Format(time.RFC3339)
        db.DB.Exec("DELETE FROM equity_snapshots WHERE timestamp < ?", cutoff)
}
