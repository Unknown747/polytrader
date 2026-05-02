package services

import (
        "bytes"
        "encoding/json"
        "fmt"
        "log"
        "net/http"
        "os"
        "time"

        "polymarket-trader/internal/db"
        "polymarket-trader/internal/models"
)

const telegramBase = "https://api.telegram.org"

func getTelegramCred(key string) string {
        env := os.Getenv(key)
        if env != "" {
                return env
        }
        return db.GetCred(key)
}

func BotToken() string     { return getTelegramCred("TELEGRAM_BOT_TOKEN") }
func TelegramChatID() string { return getTelegramCred("TELEGRAM_CHAT_ID") }

func IsTelegramConfigured() bool {
        return BotToken() != "" && TelegramChatID() != ""
}

func sendTelegramMessage(text string) bool {
        token := BotToken()
        chatID := TelegramChatID()
        if token == "" || chatID == "" {
                return false
        }

        for attempt := 1; attempt <= 3; attempt++ {
                body, _ := json.Marshal(map[string]interface{}{
                        "chat_id":                  chatID,
                        "text":                     text,
                        "parse_mode":               "HTML",
                        "disable_web_page_preview": true,
                })
                req, _ := http.NewRequest("POST", fmt.Sprintf("%s/bot%s/sendMessage", telegramBase, token), bytes.NewReader(body))
                req.Header.Set("Content-Type", "application/json")
                client := &http.Client{Timeout: 10 * time.Second}
                resp, err := client.Do(req)
                if err == nil && resp.StatusCode == 200 {
                        resp.Body.Close()
                        log.Printf("Telegram message sent (attempt %d)", attempt)
                        return true
                }
                if resp != nil {
                        resp.Body.Close()
                        if resp.StatusCode >= 400 && resp.StatusCode < 500 {
                                break
                        }
                }
                if attempt < 3 {
                        time.Sleep(time.Duration(attempt) * time.Second)
                }
        }
        log.Println("Telegram: all retry attempts exhausted")
        return false
}

func SendTestMessage() map[string]interface{} {
        if !IsTelegramConfigured() {
                return map[string]interface{}{"success": false, "message": "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."}
        }
        ok := sendTelegramMessage("✅ <b>PolyTrader connected!</b>\n\nTelegram notifications are working. You'll receive alerts for new opportunities, filled orders, and daily P&L reports.")
        if ok {
                return map[string]interface{}{"success": true, "message": "Test message sent successfully!"}
        }
        return map[string]interface{}{"success": false, "message": "Failed to send message. Check your Bot Token and Chat ID."}
}

func NotifyOpportunities(opportunities []models.Opportunity) {
        if !IsTelegramConfigured() || len(opportunities) == 0 {
                return
        }
        top := opportunities
        if len(top) > 5 {
                top = top[:5]
        }
        lines := []string{fmt.Sprintf("🎯 <b>%d trading opportunit", len(opportunities))}
        if len(opportunities) == 1 {
                lines[0] += "y found!</b>"
        } else {
                lines[0] += "ies found!</b>"
        }
        lines = append(lines, "")
        for _, op := range top {
                side := "❌ NO"
                if op.RecommendedSide == "YES" {
                        side = "✅ YES"
                }
                days := fmt.Sprintf("%.0fd", op.DaysToResolution)
                if op.DaysToResolution < 1 {
                        days = "&lt;1 day"
                }
                lines = append(lines,
                        fmt.Sprintf("<b>%s</b>", op.Question),
                        fmt.Sprintf("%s @ %.0f¢ | Edge: +%.1f%% | Return: +%.1f%% | Score: %.0f/100",
                                side, op.CurrentPrice*100, op.Edge*100, op.ExpectedReturn*100, op.CompositeScore*100),
                        fmt.Sprintf("📅 %s | 💰 Suggested: $%.2f", days, op.SuggestedAmount),
                        "",
                )
        }
        if len(opportunities) > 5 {
                lines = append(lines, fmt.Sprintf("<i>...and %d more opportunities</i>", len(opportunities)-5))
        }
        text := ""
        for _, l := range lines {
                text += l + "\n"
        }
        sendTelegramMessage(text)
}

func NotifyOrderFilled(question, side string, price, amount float64) {
        if !IsTelegramConfigured() {
                return
        }
        sideStr := "❌ NO"
        if side == "YES" {
                sideStr = "✅ YES"
        }
        sendTelegramMessage(fmt.Sprintf("🔔 <b>Order Filled</b>\n\n<b>%s</b>\nBUY %s @ %.0f¢\nAmount: $%.2f", question, sideStr, price*100, amount))
}

func NotifyDailyReport(pnl, pnlPct float64, openPositions int, totalValue float64, totalTrades int, winRate float64) {
        if !IsTelegramConfigured() {
                return
        }
        sign := "+"
        emoji := "📈"
        if pnl < 0 {
                sign = ""
                emoji = "📉"
        }
        sendTelegramMessage(fmt.Sprintf("%s <b>Daily P&L Report</b>\n\nP&L: <b>%s$%.2f (%s%.2f%%)</b>\nPortfolio Value: $%.2f\nOpen Positions: %d\nTotal Trades: %d\nWin Rate: %.1f%%",
                emoji, sign, pnl, sign, pnlPct, totalValue, openPositions, totalTrades, winRate))
}

func NotifyPriceAlert(question, side, direction string, targetPrice, currentPrice float64) {
        if !IsTelegramConfigured() {
                return
        }
        dirEmoji := "📉"
        if direction == "above" {
                dirEmoji = "📈"
        }
        sideEmoji := "❌"
        if side == "YES" {
                sideEmoji = "✅"
        }
        sendTelegramMessage(fmt.Sprintf("%s <b>Price Alert Triggered!</b>\n\n<b>%s</b>\n\n%s <b>%s</b> price is now <b>%.0f¢</b>\nTarget: %s <b>%.0f¢</b>",
                dirEmoji, question, sideEmoji, side, currentPrice*100, direction, targetPrice*100))
}

func NotifyExpiringPosition(question, side string, hoursLeft int, currentPrice, pnl, value float64) {
        if !IsTelegramConfigured() {
                return
        }
        sideEmoji := "❌"
        if side == "YES" {
                sideEmoji = "✅"
        }
        pnlSign := "+"
        pnlEmoji := "🟢"
        if pnl < 0 {
                pnlSign = ""
                pnlEmoji = "🔴"
        }
        sendTelegramMessage(fmt.Sprintf("⏰ <b>Position Expiring Soon!</b>\n\n<b>%s</b>\n\n%s %s | Current: <b>%.0f¢</b>\nValue: $%.2f | %s P&L: %s$%.2f\n⏱ Resolves in ~%dh",
                question, sideEmoji, side, currentPrice*100, value, pnlEmoji, pnlSign, pnl, hoursLeft))
}

func NotifyStopLossExecuted(question, side string, entryPrice, currentPrice, sharesSold, realizedPnl, pnlPct float64) {
        if !IsTelegramConfigured() {
                return
        }
        absLoss := realizedPnl
        if absLoss < 0 {
                absLoss = -absLoss
        }
        sendTelegramMessage(fmt.Sprintf("🛑 <b>Stop-Loss EXECUTED</b>\n\n<b>%s</b>\n\n%s | Entry: %.0f¢ → Exit: <b>%.0f¢</b>\nShares sold: <b>%.3f</b>\nRealized Loss: <b>-$%.2f (%.1f%%)</b>\n\n✅ Position closed automatically to protect capital.",
                question, side, entryPrice*100, currentPrice*100, sharesSold, absLoss, pnlPct))
}

func NotifyTakeProfitTierExecuted(question, side string, tier int, tierPct, entryPrice, currentPrice, sharesSold, realizedPnl, remainingShares float64, action string) {
        if !IsTelegramConfigured() {
                return
        }
        actionDesc := ""
        switch action {
        case "capital_recovery":
                actionDesc = fmt.Sprintf("💰 Modal awal dikembalikan — sisa <b>%.3f shares</b> jalan gratis!", remainingShares)
        case "half_remaining":
                actionDesc = fmt.Sprintf("📤 50%% sisa dijual — <b>%.3f shares</b> masih jalan.", remainingShares)
        default:
                actionDesc = "🏁 Posisi DITUTUP PENUH — profit dikunci."
        }
        sendTelegramMessage(fmt.Sprintf("🎯 <b>Take-Profit Tier %d (%.0f%%) EXECUTED</b>\n\n<b>%s</b>\n\n%s | Entry: %.0f¢ → Now: <b>%.0f¢</b>\nShares sold: <b>%.3f</b>\nRealized Profit: <b>+$%.2f</b>\n\n%s",
                tier, tierPct, question, side, entryPrice*100, currentPrice*100, sharesSold, realizedPnl, actionDesc))
}

func NotifyLowBalance(balance, minRequired float64, mode, suggestion string) {
        if !IsTelegramConfigured() {
                return
        }
        sendTelegramMessage(fmt.Sprintf("⚠️ <b>Peringatan Saldo Rendah!</b>\n\nSaldo USDC: <b>$%.2f</b>\nMinimum yang disarankan: <b>$%.2f</b>\nMode saat ini: <b>%s</b>\n\n💡 %s\n\n<i>Bot tetap berjalan tapi akan lebih selektif.</i>",
                balance, minRequired, mode, suggestion))
}

func NotifyAutoCompound(oldBankroll, newBankroll, profit, profitPct float64) {
        if !IsTelegramConfigured() {
                return
        }
        sign := "+"
        if profit < 0 {
                sign = ""
        }
        sendTelegramMessage(fmt.Sprintf("♻️ <b>Auto-Compound Dijalankan</b>\n\nBankroll diperbarui: <b>$%.2f → $%.2f</b>\nProfit periode ini: <b>%s$%.2f (%s%.2f%%)</b>\n\n<i>Ukuran posisi berikutnya dihitung dari bankroll baru.</i>",
                oldBankroll, newBankroll, sign, profit, sign, profitPct))
}

func NotifyPaperTrade(question, side string, price, amount, edge, paperBalance float64) {
        if !IsTelegramConfigured() {
                return
        }
        sideEmoji := "❌"
        if side == "YES" {
                sideEmoji = "✅"
        }
        sendTelegramMessage(fmt.Sprintf("📝 <b>[PAPER TRADE] Simulasi Order</b>\n\n<b>%s</b>\n%s %s @ %.0f¢ | Amount: $%.2f\nEdge: +%.1f%%\nPaper balance sisa: <b>$%.2f</b>\n\n<i>⚠️ Ini simulasi — bukan order nyata di Polymarket.</i>",
                question, sideEmoji, side, price*100, amount, edge*100, paperBalance))
}

func NotifyMarketResolved(question, side, outcome string, pnl, finalPrice float64) {
        if !IsTelegramConfigured() {
                return
        }
        sideEmoji := "❌"
        if side == "YES" {
                sideEmoji = "✅"
        }
        outcomeEmoji := "💸"
        outcomeStr := "LOSS"
        if outcome == "win" {
                outcomeEmoji = "🏆"
                outcomeStr = "WIN"
        }
        pnlSign := "+"
        if pnl < 0 {
                pnlSign = ""
        }
        sendTelegramMessage(fmt.Sprintf("%s <b>Market Resolved — %s</b>\n\n<b>%s</b>\n\n%s %s resolved at <b>%.0f¢</b>\nP&L: <b>%s$%.2f</b>",
                outcomeEmoji, outcomeStr, question, sideEmoji, side, finalPrice*100, pnlSign, pnl))
}

func NotifyHeartbeatFailure(failCount int) {
        if !IsTelegramConfigured() {
                return
        }
        sendTelegramMessage(fmt.Sprintf("💔 <b>Heartbeat Failure</b>\n\nBot health check gagal <b>%dx</b> berturut-turut.\n\n<i>Periksa status server dan workflow di Replit.</i>", failCount))
}

