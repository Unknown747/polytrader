package services

import (
        "database/sql"
        "fmt"
        "math"
        "regexp"
        "strconv"
        "time"

        "polymarket-trader/internal/db"
        "polymarket-trader/internal/models"
)

var seedOrders = []models.OrderEntry{
        {ID: "ord-001", MarketID: "mkt-001", MarketQuestion: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?", Side: "YES", Type: "BUY", Price: 0.72, Amount: 144.0, Shares: 200, Status: "filled", CreatedAt: "2025-04-10T09:23:11Z"},
        {ID: "ord-002", MarketID: "mkt-002", MarketQuestion: "Will Bitcoin stay above $90,000 through June 2026?", Side: "YES", Type: "BUY", Price: 0.81, Amount: 202.5, Shares: 250, Status: "filled", CreatedAt: "2025-04-15T14:05:32Z"},
        {ID: "ord-003", MarketID: "mkt-005", MarketQuestion: "Will Ethereum ETH price exceed $3,000 by end of May 2026?", Side: "YES", Type: "BUY", Price: 0.75, Amount: 150.0, Shares: 200, Status: "filled", CreatedAt: "2025-04-20T11:48:00Z"},
        {ID: "ord-004", MarketID: "mkt-006", MarketQuestion: "Will US GDP growth remain positive in Q1 2026?", Side: "YES", Type: "BUY", Price: 0.84, Amount: 168.0, Shares: 200, Status: "filled", CreatedAt: "2025-04-22T16:30:00Z"},
        {ID: "ord-005", MarketID: "mkt-008", MarketQuestion: "Will Solana (SOL) price exceed $200 by June 2026?", Side: "YES", Type: "BUY", Price: 0.79, Amount: 118.5, Shares: 150, Status: "filled", CreatedAt: "2025-04-25T08:15:00Z"},
}

var seedPositions = []models.PositionEntry{
        {ID: "pos-001", MarketID: "mkt-001", MarketQuestion: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?", Side: "YES", Shares: 200, AvgPrice: 0.72, CurrentPrice: 0.83, Pnl: 22.0, PnlPercent: 15.28, Value: 166.0},
        {ID: "pos-002", MarketID: "mkt-002", MarketQuestion: "Will Bitcoin stay above $90,000 through June 2026?", Side: "YES", Shares: 250, AvgPrice: 0.81, CurrentPrice: 0.86, Pnl: 12.5, PnlPercent: 6.17, Value: 215.0},
        {ID: "pos-003", MarketID: "mkt-005", MarketQuestion: "Will Ethereum ETH price exceed $3,000 by end of May 2026?", Side: "YES", Shares: 200, AvgPrice: 0.75, CurrentPrice: 0.82, Pnl: 14.0, PnlPercent: 9.33, Value: 164.0},
        {ID: "pos-004", MarketID: "mkt-006", MarketQuestion: "Will US GDP growth remain positive in Q1 2026?", Side: "YES", Shares: 200, AvgPrice: 0.84, CurrentPrice: 0.88, Pnl: 8.0, PnlPercent: 4.76, Value: 176.0},
        {ID: "pos-005", MarketID: "mkt-008", MarketQuestion: "Will Solana (SOL) price exceed $200 by June 2026?", Side: "YES", Shares: 150, AvgPrice: 0.79, CurrentPrice: 0.84, Pnl: 7.5, PnlPercent: 6.33, Value: 126.0},
}

var seedPnl = []models.PnlPoint{
        {Date: "2025-04-01", Pnl: 0, Cumulative: 0},
        {Date: "2025-04-05", Pnl: 6.2, Cumulative: 6.2},
        {Date: "2025-04-10", Pnl: 14.0, Cumulative: 20.2},
        {Date: "2025-04-12", Pnl: -3.5, Cumulative: 16.7},
        {Date: "2025-04-15", Pnl: 9.5, Cumulative: 26.2},
        {Date: "2025-04-17", Pnl: 7.1, Cumulative: 33.3},
        {Date: "2025-04-20", Pnl: 12.5, Cumulative: 45.8},
        {Date: "2025-04-22", Pnl: -4.2, Cumulative: 41.6},
        {Date: "2025-04-24", Pnl: 5.8, Cumulative: 47.4},
        {Date: "2025-04-25", Pnl: 8.0, Cumulative: 55.4},
        {Date: "2025-04-28", Pnl: -2.4, Cumulative: 53.0},
        {Date: "2025-04-30", Pnl: 11.0, Cumulative: 64.0},
}

func SeedIfEmpty() {
        var count int
        db.DB.QueryRow("SELECT COUNT(*) FROM portfolio_orders").Scan(&count)
        if count > 0 {
                return
        }
        for _, o := range seedOrders {
                db.DB.Exec(
                        "INSERT OR IGNORE INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        o.ID, o.MarketID, o.MarketQuestion, o.Side, o.Type, o.Price, o.Amount, o.Shares, o.Status, o.CreatedAt,
                )
        }
        for _, p := range seedPositions {
                db.DB.Exec(
                        "INSERT OR IGNORE INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        p.ID, p.MarketID, p.MarketQuestion, p.Side, p.Shares, p.AvgPrice, p.CurrentPrice, p.Pnl, p.PnlPercent, p.Value,
                )
        }
        for _, pt := range seedPnl {
                db.DB.Exec("INSERT OR IGNORE INTO portfolio_pnl (date, pnl, cumulative) VALUES (?, ?, ?)", pt.Date, pt.Pnl, pt.Cumulative)
        }
}

var ordIDRe = regexp.MustCompile(`ord-(\d+)`)
var posIDRe = regexp.MustCompile(`pos-(\d+)`)

func nextOrderID() string {
        var id string
        db.DB.QueryRow("SELECT id FROM portfolio_orders ORDER BY id DESC LIMIT 1").Scan(&id)
        if id == "" {
                return "ord-007"
        }
        m := ordIDRe.FindStringSubmatch(id)
        if m == nil {
                return "ord-007"
        }
        n, _ := strconv.Atoi(m[1])
        return fmt.Sprintf("ord-%03d", n+1)
}

func nextPositionID() string {
        var id string
        db.DB.QueryRow("SELECT id FROM portfolio_positions ORDER BY id DESC LIMIT 1").Scan(&id)
        if id == "" {
                return "pos-001"
        }
        m := posIDRe.FindStringSubmatch(id)
        if m == nil {
                return "pos-001"
        }
        n, _ := strconv.Atoi(m[1])
        return fmt.Sprintf("pos-%03d", n+1)
}

func GetOrders() []models.OrderEntry {
        rows, err := db.DB.Query("SELECT id, market_id, market_question, side, type, price, amount, shares, status, created_at FROM portfolio_orders ORDER BY created_at DESC")
        if err != nil {
                return nil
        }
        defer rows.Close()
        var orders []models.OrderEntry
        for rows.Next() {
                var o models.OrderEntry
                rows.Scan(&o.ID, &o.MarketID, &o.MarketQuestion, &o.Side, &o.Type, &o.Price, &o.Amount, &o.Shares, &o.Status, &o.CreatedAt)
                orders = append(orders, o)
        }
        return orders
}

func GetPositions() []models.PositionEntry {
        rows, err := db.DB.Query("SELECT id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value FROM portfolio_positions")
        if err != nil {
                return nil
        }
        defer rows.Close()
        var positions []models.PositionEntry
        for rows.Next() {
                var p models.PositionEntry
                rows.Scan(&p.ID, &p.MarketID, &p.MarketQuestion, &p.Side, &p.Shares, &p.AvgPrice, &p.CurrentPrice, &p.Pnl, &p.PnlPercent, &p.Value)
                positions = append(positions, p)
        }
        return positions
}

func GetPnlHistory() []models.PnlPoint {
        rows, err := db.DB.Query("SELECT date, pnl, cumulative FROM portfolio_pnl ORDER BY date ASC")
        if err != nil {
                return nil
        }
        defer rows.Close()
        var points []models.PnlPoint
        for rows.Next() {
                var p models.PnlPoint
                rows.Scan(&p.Date, &p.Pnl, &p.Cumulative)
                points = append(points, p)
        }
        return points
}

func AddOrder(entry models.OrderEntry) models.OrderEntry {
        entry.ID = nextOrderID()
        entry.CreatedAt = time.Now().Format(time.RFC3339)
        db.DB.Exec(
                "INSERT INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                entry.ID, entry.MarketID, entry.MarketQuestion, entry.Side, entry.Type, entry.Price, entry.Amount, entry.Shares, entry.Status, entry.CreatedAt,
        )
        if entry.Status == "filled" {
                upsertPosition(entry)
                appendPnlPoint()
        }
        return entry
}

func CancelPortfolioOrder(orderID string) *models.OrderEntry {
        var o models.OrderEntry
        err := db.DB.QueryRow("SELECT id, market_id, market_question, side, type, price, amount, shares, status, created_at FROM portfolio_orders WHERE id = ?", orderID).
                Scan(&o.ID, &o.MarketID, &o.MarketQuestion, &o.Side, &o.Type, &o.Price, &o.Amount, &o.Shares, &o.Status, &o.CreatedAt)
        if err != nil {
                return nil
        }
        db.DB.Exec("UPDATE portfolio_orders SET status = 'cancelled' WHERE id = ?", orderID)
        o.Status = "cancelled"
        return &o
}

func upsertPosition(order models.OrderEntry) {
        var existing struct {
                Shares   float64
                AvgPrice float64
                ID       string
        }
        err := db.DB.QueryRow("SELECT id, shares, avg_price FROM portfolio_positions WHERE market_id = ? AND side = ?", order.MarketID, order.Side).
                Scan(&existing.ID, &existing.Shares, &existing.AvgPrice)
        if err == sql.ErrNoRows {
                shares := order.Shares
                cost := math.Round(shares*order.Price*100) / 100
                db.DB.Exec(
                        "INSERT INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        nextPositionID(), order.MarketID, order.MarketQuestion, order.Side, shares, order.Price, order.Price, 0, 0, cost,
                )
        } else {
                totalShares := existing.Shares + order.Shares
                avgPrice := (existing.AvgPrice*existing.Shares + order.Price*order.Shares) / totalShares
                currentPrice := order.Price
                value := math.Round(totalShares*currentPrice*100) / 100
                cost := math.Round(totalShares*avgPrice*100) / 100
                pnl := math.Round((value-cost)*100) / 100
                pnlPct := 0.0
                if cost > 0 {
                        pnlPct = math.Round((pnl/cost)*10000) / 100
                }
                db.DB.Exec(
                        "UPDATE portfolio_positions SET shares=?, avg_price=?, current_price=?, pnl=?, pnl_percent=?, value=? WHERE market_id=? AND side=?",
                        totalShares, math.Round(avgPrice*1000)/1000, currentPrice, pnl, pnlPct, value, order.MarketID, order.Side,
                )
        }
}

func appendPnlPoint() {
        today := time.Now().Format("2006-01-02")
        var existing string
        err := db.DB.QueryRow("SELECT date FROM portfolio_pnl WHERE date = ?", today).Scan(&existing)
        if err == sql.ErrNoRows {
                var lastCumulative float64
                db.DB.QueryRow("SELECT cumulative FROM portfolio_pnl ORDER BY date DESC LIMIT 1").Scan(&lastCumulative)
                db.DB.Exec("INSERT INTO portfolio_pnl (date, pnl, cumulative) VALUES (?, 0, ?)", today, lastCumulative)
        }
}

func recordPnlPoint(pnl float64) {
        today := time.Now().Format("2006-01-02")
        var existing struct {
                Pnl        float64
                Cumulative float64
        }
        err := db.DB.QueryRow("SELECT pnl, cumulative FROM portfolio_pnl WHERE date = ?", today).Scan(&existing.Pnl, &existing.Cumulative)
        if err == sql.ErrNoRows {
                var lastCumulative float64
                db.DB.QueryRow("SELECT cumulative FROM portfolio_pnl ORDER BY date DESC LIMIT 1").Scan(&lastCumulative)
                newCum := math.Round((lastCumulative+pnl)*100) / 100
                db.DB.Exec("INSERT INTO portfolio_pnl (date, pnl, cumulative) VALUES (?, ?, ?)", today, math.Round(pnl*100)/100, newCum)
        } else {
                newPnl := math.Round((existing.Pnl+pnl)*100) / 100
                newCum := math.Round((existing.Cumulative+pnl)*100) / 100
                db.DB.Exec("UPDATE portfolio_pnl SET pnl=?, cumulative=? WHERE date=?", newPnl, newCum, today)
        }
}

func PartialClosePosition(posID string, sharesToSell, currentPrice float64) *struct {
        RealizedPnl    float64
        RemainingShares float64
} {
        var pos struct {
                MarketID       string
                MarketQuestion string
                Side           string
                Shares         float64
                AvgPrice       float64
        }
        err := db.DB.QueryRow("SELECT market_id, market_question, side, shares, avg_price FROM portfolio_positions WHERE id = ?", posID).
                Scan(&pos.MarketID, &pos.MarketQuestion, &pos.Side, &pos.Shares, &pos.AvgPrice)
        if err != nil {
                return nil
        }
        sell := math.Min(sharesToSell, pos.Shares)
        remainingShares := math.Round((pos.Shares-sell)*1000) / 1000
        costBasisSold := math.Round(sell*pos.AvgPrice*100) / 100
        proceeds := math.Round(sell*currentPrice*100) / 100
        realizedPnl := math.Round((proceeds-costBasisSold)*100) / 100

        if remainingShares <= 0.001 {
                db.DB.Exec("DELETE FROM portfolio_positions WHERE id = ?", posID)
        } else {
                newValue := math.Round(remainingShares*currentPrice*100) / 100
                newCost := math.Round(remainingShares*pos.AvgPrice*100) / 100
                newPnl := math.Round((newValue-newCost)*100) / 100
                newPnlPct := 0.0
                if newCost > 0 {
                        newPnlPct = math.Round((newPnl/newCost)*10000) / 100
                }
                db.DB.Exec("UPDATE portfolio_positions SET shares=?, current_price=?, pnl=?, pnl_percent=?, value=? WHERE id=?",
                        remainingShares, currentPrice, newPnl, newPnlPct, newValue, posID)
        }

        orderID := nextOrderID()
        now := time.Now().Format(time.RFC3339)
        db.DB.Exec(
                "INSERT INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at) VALUES (?, ?, ?, ?, 'SELL', ?, ?, ?, 'filled', ?)",
                orderID, pos.MarketID, pos.MarketQuestion, pos.Side, currentPrice, proceeds, sell, now,
        )
        recordPnlPoint(realizedPnl)
        return &struct {
                RealizedPnl    float64
                RemainingShares float64
        }{realizedPnl, remainingShares}
}

func FullClosePosition(posID string, currentPrice float64) *struct{ RealizedPnl float64 } {
        var shares float64
        db.DB.QueryRow("SELECT shares FROM portfolio_positions WHERE id = ?", posID).Scan(&shares)
        result := PartialClosePosition(posID, shares, currentPrice)
        if result == nil {
                return nil
        }
        return &struct{ RealizedPnl float64 }{result.RealizedPnl}
}

func UpdatePositionPrices(priceMap map[string]float64) {
        rows, err := db.DB.Query("SELECT id, market_id, side, shares, avg_price FROM portfolio_positions")
        if err != nil {
                return
        }
        defer rows.Close()
        type pos struct {
                id       string
                marketID string
                shares   float64
                avgPrice float64
        }
        var positions []pos
        for rows.Next() {
                var p pos
                var side string
                rows.Scan(&p.id, &p.marketID, &side, &p.shares, &p.avgPrice)
                positions = append(positions, p)
        }
        rows.Close()

        for _, p := range positions {
                currentPrice, ok := priceMap[p.marketID]
                if !ok {
                        continue
                }
                value := math.Round(p.shares*currentPrice*100) / 100
                cost := math.Round(p.shares*p.avgPrice*100) / 100
                pnl := math.Round((value-cost)*100) / 100
                pnlPct := 0.0
                if cost > 0 {
                        pnlPct = math.Round((pnl/cost)*10000) / 100
                }
                db.DB.Exec("UPDATE portfolio_positions SET current_price=?, pnl=?, pnl_percent=?, value=? WHERE id=?",
                        currentPrice, pnl, pnlPct, value, p.id)
        }
}

func GetPortfolioSummary() map[string]interface{} {
        positions := GetPositions()
        orders := GetOrders()
        cfg := GetConfig()

        openPositions := len(positions)
        investedAmount := 0.0
        currentValue := 0.0
        totalPnl := 0.0
        for _, p := range positions {
                investedAmount += p.Shares * p.AvgPrice
                currentValue += p.Value
                totalPnl += p.Pnl
        }

        filledOrders := 0
        winningOrders := 0
        for _, o := range orders {
                if o.Status == "filled" {
                        filledOrders++
                        for _, p := range positions {
                                if p.MarketID == o.MarketID && p.Side == o.Side && p.Pnl > 0 {
                                        winningOrders++
                                        break
                                }
                        }
                }
        }
        winRate := 0.0
        if filledOrders > 0 {
                winRate = math.Round(float64(winningOrders)/float64(filledOrders)*1000) / 10
        }

        bankroll := cfg.Bankroll
        availableBalance := math.Max(0, math.Round((bankroll-investedAmount)*100)/100)
        totalValue := math.Round((availableBalance+currentValue)*100) / 100
        totalPnlPct := 0.0
        if investedAmount > 0 {
                totalPnlPct = math.Round((totalPnl/investedAmount)*10000) / 100
        }

        return map[string]interface{}{
                "totalValue":       totalValue,
                "availableBalance": availableBalance,
                "investedAmount":   math.Round(investedAmount*100) / 100,
                "totalPnl":         math.Round(totalPnl*100) / 100,
                "totalPnlPercent":  totalPnlPct,
                "openPositions":    openPositions,
                "totalTrades":      filledOrders,
                "winRate":          winRate,
        }
}

func SeedDemoData() map[string]int {
        db.DB.Exec("DELETE FROM portfolio_orders")
        db.DB.Exec("DELETE FROM portfolio_positions")
        db.DB.Exec("DELETE FROM portfolio_pnl")
        db.DB.Exec("DELETE FROM auto_trade_history")
        for _, o := range seedOrders {
                db.DB.Exec(
                        "INSERT OR IGNORE INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        o.ID, o.MarketID, o.MarketQuestion, o.Side, o.Type, o.Price, o.Amount, o.Shares, o.Status, o.CreatedAt,
                )
        }
        for _, p := range seedPositions {
                db.DB.Exec(
                        "INSERT OR IGNORE INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        p.ID, p.MarketID, p.MarketQuestion, p.Side, p.Shares, p.AvgPrice, p.CurrentPrice, p.Pnl, p.PnlPercent, p.Value,
                )
        }
        for _, pt := range seedPnl {
                db.DB.Exec("INSERT OR IGNORE INTO portfolio_pnl (date, pnl, cumulative) VALUES (?, ?, ?)", pt.Date, pt.Pnl, pt.Cumulative)
        }
        return map[string]int{
                "orders":     len(seedOrders),
                "positions":  len(seedPositions),
                "pnl":        len(seedPnl),
                "autoTrades": 0,
        }
}
