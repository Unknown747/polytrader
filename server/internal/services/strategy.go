package services

import (
	"database/sql"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"polymarket-trader/internal/db"
	"polymarket-trader/internal/models"
)

var configCache *models.StrategyConfig

func LoadConfig() models.StrategyConfig {
	if configCache != nil {
		return *configCache
	}
	cfg := models.DefaultConfig
	rows, err := db.DB.Query("SELECT key, value FROM strategy_config")
	if err != nil {
		return cfg
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		applyConfigField(&cfg, k, v)
	}
	configCache = &cfg
	return cfg
}

func applyConfigField(cfg *models.StrategyConfig, key, value string) {
	switch key {
	case "autoTradingEnabled":
		cfg.AutoTradingEnabled = value == "true"
	case "bankroll":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.Bankroll = f
		}
	case "maxPositionPct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MaxPositionPct = f
		}
	case "minEdge":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MinEdge = f
		}
	case "minProbability":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MinProbability = f
		}
	case "maxDaysToResolution":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MaxDaysToResolution = f
		}
	case "minVolume24h":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MinVolume24h = f
		}
	case "minLiquidity":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MinLiquidity = f
		}
	case "scanIntervalMinutes":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.ScanIntervalMinutes = f
		}
	case "telegramAlertsEnabled":
		cfg.TelegramAlertsEnabled = value == "true"
	case "maxDailyTrades":
		if n, e := strconv.Atoi(value); e == nil {
			cfg.MaxDailyTrades = n
		}
	case "maxOpportunities":
		if n, e := strconv.Atoi(value); e == nil {
			cfg.MaxOpportunities = n
		}
	case "dailyReportHour":
		if n, e := strconv.Atoi(value); e == nil {
			cfg.DailyReportHour = n
		}
	case "stopLossPct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.StopLossPct = f
		}
	case "stopLossAutoExecute":
		cfg.StopLossAutoExecute = value == "true"
	case "takeProfitEnabled":
		cfg.TakeProfitEnabled = value == "true"
	case "takeProfitTier1Pct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.TakeProfitTier1Pct = f
		}
	case "takeProfitTier2Pct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.TakeProfitTier2Pct = f
		}
	case "takeProfitTier3Pct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.TakeProfitTier3Pct = f
		}
	case "trendFilterEnabled":
		cfg.TrendFilterEnabled = value == "true"
	case "autoCapital":
		cfg.AutoCapital = value == "true"
	case "autoCompound":
		cfg.AutoCompound = value == "true"
	case "categoryFilter":
		cfg.CategoryFilter = value
	case "paperTradingMode":
		cfg.PaperTradingMode = value == "true"
	case "paperBankroll":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.PaperBankroll = f
		}
	case "paperSlippagePct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.PaperSlippagePct = f
		}
	case "paperTakerFeePct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.PaperTakerFeePct = f
		}
	case "volatilityCheckEnabled":
		cfg.VolatilityCheckEnabled = value == "true"
	case "volatilityThresholdPct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.VolatilityThresholdPct = f
		}
	case "cooldownAfterLossEnabled":
		cfg.CooldownAfterLossEnabled = value == "true"
	case "maxRiskPerTradePct":
		if f, e := strconv.ParseFloat(value, 64); e == nil {
			cfg.MaxRiskPerTradePct = f
		}
	}
}

func GetConfig() models.StrategyConfig {
	return LoadConfig()
}

func UpdateConfig(patch map[string]interface{}) models.StrategyConfig {
	cfg := LoadConfig()
	tx, _ := db.DB.Begin()
	stmt, _ := tx.Prepare("INSERT OR REPLACE INTO strategy_config (key, value) VALUES (?, ?)")
	for k, v := range patch {
		val := fmt.Sprintf("%v", v)
		stmt.Exec(k, val)
		applyConfigField(&cfg, k, val)
	}
	stmt.Close()
	tx.Commit()
	configCache = &cfg
	return cfg
}

func daysUntil(dateStr string) float64 {
	t, err := time.Parse(time.RFC3339, dateStr)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05Z", dateStr)
		if err != nil {
			return 0
		}
	}
	diff := t.Sub(time.Now())
	if diff < 0 {
		return 0
	}
	return diff.Hours() / 24
}

func liquidityScore(liq float64) float64 {
	if liq >= 500000 {
		return 1.0
	}
	if liq >= 100000 {
		return 0.8
	}
	if liq >= 50000 {
		return 0.6
	}
	if liq >= 10000 {
		return 0.4
	}
	return 0.2
}

func volumeScore(vol float64) float64 {
	if vol >= 200000 {
		return 1.0
	}
	if vol >= 50000 {
		return 0.8
	}
	if vol >= 10000 {
		return 0.6
	}
	if vol >= 2000 {
		return 0.4
	}
	return 0.2
}

func timeUrgencyScore(days, maxDays float64) float64 {
	if days <= 1 {
		return 1.00
	}
	if days <= 2 {
		return 0.95
	}
	if days <= 3 {
		return 0.90
	}
	if days <= 7 {
		return 0.75 + (7-days)/7*0.15
	}
	ratio := 1 - days/maxDays
	return math.Pow(ratio, 1.5)
}

func estimateFairValue(price, days, maxDays, liquidity, volume24h float64) float64 {
	timeDecay := math.Max(0, 1-days/maxDays)
	convergenceBase := (1 - price) * timeDecay * 0.45
	liqBoost := liquidityScore(liquidity) * 0.03
	volBoost := volumeScore(volume24h) * 0.02
	boost := convergenceBase + liqBoost + volBoost
	return math.Min(0.99, math.Max(price, price+boost))
}

func seededRand(seed float64, i int) float64 {
	x := math.Sin(seed+float64(i)) * 10000
	return x - math.Floor(x)
}

func computePriceTrend(marketID string, currentPrice float64) string {
	days := 14
	seed := math.Floor(currentPrice*1000) + float64(int(marketID[0]))
	prices := make([]float64, days)
	price := math.Max(0.05, math.Min(0.95, currentPrice-0.15+seededRand(seed, 0)*0.3))
	for i := 0; i < days; i++ {
		progress := float64(i) / math.Max(1, float64(days-1))
		drift := (currentPrice - price) * progress * 0.25
		noise := (seededRand(seed, i+1) - 0.5) * 0.05
		price = math.Max(0.02, math.Min(0.98, price+drift/float64(days)+noise))
		prices[i] = price
	}
	prices[days-1] = currentPrice

	xMean := float64(days-1) / 2
	yMean := 0.0
	for _, p := range prices {
		yMean += p
	}
	yMean /= float64(days)
	var num, den float64
	for i, p := range prices {
		dx := float64(i) - xMean
		num += dx * (p - yMean)
		den += dx * dx
	}
	slope := 0.0
	if den > 0 {
		slope = num / den
	}
	if slope > 0.002 {
		return "up"
	}
	if slope < -0.002 {
		return "down"
	}
	return "flat"
}

func compositeScore(edge, expectedReturn, days, maxDays, liquidity, volume24h float64, trend string) float64 {
	normalizedEdge := math.Min(edge/0.15, 1)
	normalizedReturn := math.Min(expectedReturn/0.3, 1)
	tScore := timeUrgencyScore(days, maxDays)
	lScore := liquidityScore(liquidity)
	vScore := volumeScore(volume24h)
	base := normalizedEdge*0.35 + normalizedReturn*0.20 + tScore*0.20 + lScore*0.15 + vScore*0.10
	if days <= 3 {
		base = math.Min(1, base+0.08)
	} else if days <= 7 {
		base = math.Min(1, base+0.03)
	}
	if trend == "up" {
		base = math.Min(1, base+0.05)
	} else if trend == "down" {
		base = math.Max(0, base-0.12)
	}
	return base
}

func adjustedHalfKelly(p, price, liquidity, volume24h, days, maxDays float64) float64 {
	if price <= 0 || price >= 1 {
		return 0
	}
	fullKelly := (p - price) / (1 - price)
	if fullKelly <= 0 {
		return 0
	}
	liqConf := liquidityScore(liquidity)
	volConf := volumeScore(volume24h)
	timeConf := 1 - (days/maxDays)*0.3
	if days <= 3 {
		timeConf = 1.0
	} else if days <= 7 {
		timeConf = 0.85
	}
	confidence := math.Max(0.4, liqConf*0.5+volConf*0.25+timeConf*0.25)
	return math.Max(0, (fullKelly/2)*confidence)
}

func riskLevel(days, edge, liquidity float64) string {
	if days <= 7 && edge >= 0.06 && liquidity >= 50000 {
		return "low"
	}
	if days <= 14 && edge >= 0.04 {
		return "medium"
	}
	return "high"
}

func buildRationale(side string, price, fv, days, edge, volume24h, liquidity, score float64, trend string) string {
	pct := fmt.Sprintf("%.0f", price*100)
	fvPct := fmt.Sprintf("%.0f", fv*100)
	edgePct := fmt.Sprintf("%.1f", edge*100)
	scorePct := fmt.Sprintf("%.0f", score*100)
	dayStr := fmt.Sprintf("%.1f days", days)
	if days < 1 {
		dayStr = "< 1 day"
	}
	vol := fmt.Sprintf("$%.0f", volume24h)
	if volume24h >= 1000 {
		vol = fmt.Sprintf("$%.0fk", volume24h/1000)
	}
	liq := fmt.Sprintf("$%.0f", liquidity)
	if liquidity >= 1000 {
		liq = fmt.Sprintf("$%.0fk", liquidity/1000)
	}
	urgencyNote := "Near-resolution momentum."
	if days <= 1 {
		urgencyNote = "Resolves within 24h — maximum convergence pressure."
	} else if days <= 3 {
		urgencyNote = "Imminent resolution — price convergence accelerating."
	} else if days <= 7 {
		urgencyNote = "Short time horizon — high-probability outcome likely converging."
	}
	trendNote := ""
	if trend == "up" {
		trendNote = " Price trending up — momentum aligned."
	} else if trend == "down" {
		trendNote = " Caution: price in downtrend."
	}
	return fmt.Sprintf("%s at %s¢ vs fair value %s¢ (+%s%% edge). Resolves in ~%s. 24h vol: %s, Liquidity: %s. Composite score: %s/100. %s%s",
		side, pct, fvPct, edgePct, dayStr, vol, liq, scorePct, urgencyNote, trendNote)
}

func ComputeCorrelationPenalty(category string, openCategories []string) float64 {
	sameCount := 0
	lcat := strings.ToLower(category)
	for _, c := range openCategories {
		if strings.ToLower(c) == lcat {
			sameCount++
		}
	}
	return math.Max(0.60, 1-float64(sameCount)*0.15)
}

func ScanOpportunities(markets []models.NormalizedMarket, cfg models.StrategyConfig) []models.Opportunity {
	var allowedCategories map[string]bool
	if cfg.CategoryFilter != "" {
		allowedCategories = make(map[string]bool)
		for _, c := range strings.Split(cfg.CategoryFilter, ",") {
			allowedCategories[strings.ToLower(strings.TrimSpace(c))] = true
		}
	}

	var opportunities []models.Opportunity
	for _, m := range markets {
		if m.Status != "active" {
			continue
		}
		if allowedCategories != nil && !allowedCategories[strings.ToLower(m.Category)] {
			continue
		}
		days := daysUntil(m.EndDate)
		if days > cfg.MaxDaysToResolution || days < 0.05 {
			continue
		}
		if m.Volume24h < cfg.MinVolume24h || m.Liquidity < cfg.MinLiquidity {
			continue
		}

		sides := []struct {
			side  string
			price float64
		}{{"YES", m.YesPrice}, {"NO", m.NoPrice}}

		for _, s := range sides {
			price := s.price
			if price < cfg.MinProbability || price > 0.97 {
				continue
			}
			fv := estimateFairValue(price, days, cfg.MaxDaysToResolution, m.Liquidity, m.Volume24h)
			edge := fv - price
			if edge < cfg.MinEdge {
				continue
			}
			trend := computePriceTrend(m.ID, price)
			if cfg.TrendFilterEnabled && trend == "down" && edge < 0.06 {
				continue
			}
			expectedReturn := edge / price
			kelly := adjustedHalfKelly(fv, price, m.Liquidity, m.Volume24h, days, cfg.MaxDaysToResolution)
			cappedKelly := math.Min(kelly, cfg.MaxPositionPct/100)
			suggestedAmount := math.Round(cfg.Bankroll*cappedKelly*100) / 100
			score := compositeScore(edge, expectedReturn, days, cfg.MaxDaysToResolution, m.Liquidity, m.Volume24h, trend)

			opportunities = append(opportunities, models.Opportunity{
				MarketID:           m.ID,
				Question:           m.Question,
				Category:           m.Category,
				RecommendedSide:    s.side,
				CurrentPrice:       price,
				EstimatedFairValue: math.Round(fv*1000) / 1000,
				Edge:               math.Round(edge*1000) / 1000,
				ExpectedReturn:     math.Round(expectedReturn*1000) / 1000,
				KellyFraction:      math.Round(cappedKelly*1000) / 1000,
				SuggestedAmount:    suggestedAmount,
				RiskLevel:          riskLevel(days, edge, m.Liquidity),
				DaysToResolution:   math.Round(days*10) / 10,
				Volume24h:          m.Volume24h,
				Liquidity:          m.Liquidity,
				CompositeScore:     math.Round(score*1000) / 1000,
				Rationale:          buildRationale(s.side, price, fv, days, edge, m.Volume24h, m.Liquidity, score, trend),
				ConditionID:        m.ConditionID,
				PriceTrend:         trend,
			})
		}
	}

	// Sort by composite score descending
	for i := 1; i < len(opportunities); i++ {
		for j := i; j > 0 && opportunities[j].CompositeScore > opportunities[j-1].CompositeScore; j-- {
			opportunities[j], opportunities[j-1] = opportunities[j-1], opportunities[j]
		}
	}
	if len(opportunities) > cfg.MaxOpportunities {
		opportunities = opportunities[:cfg.MaxOpportunities]
	}
	return opportunities
}

type BacktestRequest struct {
	DaysBack            int     `json:"daysBack"`
	Bankroll            float64 `json:"bankroll"`
	MinProbability      float64 `json:"minProbability"`
	MaxDaysToResolution float64 `json:"maxDaysToResolution"`
	MaxPositionPct      float64 `json:"maxPositionPct"`
}

type BacktestTrade struct {
	Date       string  `json:"date"`
	Question   string  `json:"question"`
	Side       string  `json:"side"`
	EntryPrice float64 `json:"entryPrice"`
	ExitPrice  float64 `json:"exitPrice"`
	Amount     float64 `json:"amount"`
	Pnl        float64 `json:"pnl"`
	PnlPct     float64 `json:"pnlPct"`
	Outcome    string  `json:"outcome"`
	FeePaid    float64 `json:"feePaid"`
	Spread     float64 `json:"spread"`
}

type BacktestPnlPoint struct {
	Date       string  `json:"date"`
	Pnl        float64 `json:"pnl"`
	Cumulative float64 `json:"cumulative"`
}

type BacktestResult struct {
	TotalReturn     float64            `json:"totalReturn"`
	TotalReturnPct  float64            `json:"totalReturnPct"`
	WinRate         float64            `json:"winRate"`
	TotalTrades     int                `json:"totalTrades"`
	WinningTrades   int                `json:"winningTrades"`
	LosingTrades    int                `json:"losingTrades"`
	AvgReturn       float64            `json:"avgReturn"`
	MaxDrawdown     float64            `json:"maxDrawdown"`
	SharpeRatio     float64            `json:"sharpeRatio"`
	TotalFeesPaid   float64            `json:"totalFeesPaid"`
	AvgSpreadPct    float64            `json:"avgSpreadPct"`
	Trades          []BacktestTrade    `json:"trades"`
	EquityCurve     []BacktestPnlPoint `json:"equityCurve"`
}

type sampleMkt struct {
	Q         string
	Cat       string
	BaseProb  float64
	Liquidity float64
}

var sampleMarkets = []sampleMkt{
	{"Will the Fed cut rates in March 2025?", "Economics", 0.78, 250000},
	{"Will Bitcoin exceed $100k in Q1 2025?", "Crypto", 0.82, 800000},
	{"Will NVIDIA earnings beat estimates Q4 2024?", "Stocks", 0.85, 150000},
	{"Will Trump win the 2024 Presidential Election?", "Politics", 0.91, 5000000},
	{"Will Apple release Vision Pro 2 before Q3 2025?", "Tech", 0.76, 45000},
	{"Will Ethereum ETF launch in January 2025?", "Crypto", 0.88, 600000},
	{"Will the S&P 500 reach 5500 by end of Q1 2025?", "Stocks", 0.79, 200000},
	{"Will Solana surpass $300 before April 2025?", "Crypto", 0.81, 400000},
	{"Will Super Bowl LIX be won by the NFC?", "Sports", 0.52, 2000000},
	{"Will China GDP growth exceed 5% in 2024?", "Economics", 0.84, 90000},
}

func lcg(seed uint32) func() float64 {
	s := seed
	return func() float64 {
		s = 1664525*s + 1013904223
		return float64(s) / 0x100000000
	}
}

func estimateSpread(liq float64, r float64) float64 {
	var base float64
	if liq >= 1000000 {
		base = 0.003
	} else if liq >= 100000 {
		base = 0.008
	} else if liq >= 10000 {
		base = 0.015
	} else {
		base = 0.03
	}
	return base * (0.8 + r*0.4)
}

func RunBacktest(req BacktestRequest) BacktestResult {
	if req.Bankroll <= 0 {
		req.Bankroll = 100
	}
	if req.MaxDaysToResolution <= 0 {
		req.MaxDaysToResolution = 21
	}
	if req.MaxPositionPct <= 0 {
		req.MaxPositionPct = 5
	}
	if req.DaysBack <= 0 {
		req.DaysBack = 30
	}

	rng := lcg(uint32(req.DaysBack*1000 + int(req.Bankroll)))
	bankroll := req.Bankroll
	var trades []BacktestTrade
	var equityCurve []BacktestPnlPoint
	var returns []float64

	totalFees := 0.0
	totalSpread := 0.0
	cumulative := 0.0
	peak := bankroll

	start := time.Now().AddDate(0, 0, -req.DaysBack)
	for d := 0; d < req.DaysBack; d++ {
		date := start.AddDate(0, 0, d).Format("2006-01-02")
		dailyPnl := 0.0

		for _, sm := range sampleMarkets {
			if rng() > 0.3 {
				continue
			}
			baseProb := sm.BaseProb
			noise := (rng() - 0.5) * 0.1
			prob := math.Max(0.5, math.Min(0.98, baseProb+noise))
			if prob < req.MinProbability {
				continue
			}

			spread := estimateSpread(sm.Liquidity, rng())
			entryPrice := prob + spread/2
			if entryPrice >= 1 {
				entryPrice = 0.98
			}

			daysLeft := rng()*req.MaxDaysToResolution*0.8 + 2
			fv := estimateFairValue(entryPrice, daysLeft, req.MaxDaysToResolution, sm.Liquidity, 50000)
			edge := fv - entryPrice
			if edge < 0.03 {
				continue
			}

			kelly := adjustedHalfKelly(fv, entryPrice, sm.Liquidity, 50000, daysLeft, req.MaxDaysToResolution)
			capped := math.Min(kelly, req.MaxPositionPct/100)
			amount := math.Round(bankroll*capped*100) / 100
			if amount < 1 {
				continue
			}

			takerFee := 0.01
			makerFee := 0.0
			makerRate := 0.7
			blendedFee := makerFee*makerRate + takerFee*(1-makerRate)
			fee := amount * blendedFee
			netAmount := amount - fee

			won := rng() < prob
			exitPrice := 1.0
			if !won {
				exitPrice = rng() * 0.15
			}
			shares := netAmount / entryPrice
			pnl := math.Round((shares*exitPrice-netAmount)*100) / 100
			pnlPct := math.Round((pnl/amount)*10000) / 100
			outcome := "win"
			if !won {
				outcome = "loss"
			}

			totalFees += fee
			totalSpread += spread * amount
			dailyPnl += pnl
			bankroll = math.Round((bankroll+pnl)*100) / 100
			returns = append(returns, pnlPct/100)

			trades = append(trades, BacktestTrade{
				Date:       date,
				Question:   sm.Q,
				Side:       "YES",
				EntryPrice: math.Round(entryPrice*1000) / 1000,
				ExitPrice:  math.Round(exitPrice*1000) / 1000,
				Amount:     amount,
				Pnl:        pnl,
				PnlPct:     pnlPct,
				Outcome:    outcome,
				FeePaid:    math.Round(fee*100) / 100,
				Spread:     math.Round(spread*10000) / 100,
			})
		}

		cumulative += dailyPnl
		if bankroll > peak {
			peak = bankroll
		}
		equityCurve = append(equityCurve, BacktestPnlPoint{
			Date:       date,
			Pnl:        math.Round(dailyPnl*100) / 100,
			Cumulative: math.Round(cumulative*100) / 100,
		})
	}

	totalReturn := bankroll - req.Bankroll
	totalReturnPct := 0.0
	if req.Bankroll > 0 {
		totalReturnPct = (totalReturn / req.Bankroll) * 100
	}
	wins := 0
	for _, t := range trades {
		if t.Outcome == "win" {
			wins++
		}
	}
	winRate := 0.0
	if len(trades) > 0 {
		winRate = float64(wins) / float64(len(trades)) * 100
	}
	avgReturn := 0.0
	if len(trades) > 0 {
		sum := 0.0
		for _, t := range trades {
			sum += t.PnlPct
		}
		avgReturn = sum / float64(len(trades))
	}
	maxDrawdown := 0.0
	running := req.Bankroll
	pk := req.Bankroll
	for _, t := range trades {
		running += t.Pnl
		if running > pk {
			pk = running
		}
		dd := (pk - running) / pk * 100
		if dd > maxDrawdown {
			maxDrawdown = dd
		}
	}
	sharpe := 0.0
	if len(returns) > 1 {
		mean := 0.0
		for _, r := range returns {
			mean += r
		}
		mean /= float64(len(returns))
		variance := 0.0
		for _, r := range returns {
			variance += (r - mean) * (r - mean)
		}
		std := math.Sqrt(variance / float64(len(returns)))
		if std > 0 {
			sharpe = (mean / std) * math.Sqrt(252)
		}
	}
	avgSpread := 0.0
	if len(trades) > 0 {
		avgSpread = totalSpread / float64(len(trades))
	}

	return BacktestResult{
		TotalReturn:    math.Round(totalReturn*100) / 100,
		TotalReturnPct: math.Round(totalReturnPct*100) / 100,
		WinRate:        math.Round(winRate*10) / 10,
		TotalTrades:    len(trades),
		WinningTrades:  wins,
		LosingTrades:   len(trades) - wins,
		AvgReturn:      math.Round(avgReturn*100) / 100,
		MaxDrawdown:    math.Round(maxDrawdown*100) / 100,
		SharpeRatio:    math.Round(sharpe*100) / 100,
		TotalFeesPaid:  math.Round(totalFees*100) / 100,
		AvgSpreadPct:   math.Round(avgSpread*100) / 100,
		Trades:         trades,
		EquityCurve:    equityCurve,
	}
}

func ComputeAdaptiveProfile(balance float64, cfg models.StrategyConfig) map[string]interface{} {
	minOrder := 1.0
	var mode, modeLabel string
	var warnings []string
	if balance < 20 {
		mode = "micro"
		modeLabel = "Micro — terlalu kecil"
	} else if balance < 50 {
		mode = "small"
		modeLabel = "Small Capital"
	} else if balance < 200 {
		mode = "normal"
		modeLabel = "Normal"
	} else {
		mode = "comfortable"
		modeLabel = "Comfortable"
	}

	minPctForMinOrder := 100.0
	if balance > 0 {
		minPctForMinOrder = (minOrder / balance) * 100
	}
	effectiveMaxPosPct := math.Min(25, math.Max(cfg.MaxPositionPct, math.Ceil(minPctForMinOrder)))
	perTradeAmount := (balance * effectiveMaxPosPct) / 100

	minLiquidityRequired := cfg.MinLiquidity
	minEdgeRequired := cfg.MinEdge
	if mode == "micro" || mode == "small" {
		minLiquidityRequired = math.Max(cfg.MinLiquidity, 10000)
		warnings = append(warnings, "Hanya market dengan likuiditas >$10,000")
	}
	if mode == "micro" {
		minEdgeRequired = math.Max(cfg.MinEdge, 0.05)
		warnings = append(warnings, "Min edge dinaikkan ke 5%")
	} else if mode == "small" {
		minEdgeRequired = math.Max(cfg.MinEdge, 0.04)
		warnings = append(warnings, "Min edge dinaikkan ke 4%")
	}

	canTrade := perTradeAmount >= minOrder
	if !canTrade {
		warnings = append(warnings, fmt.Sprintf("Per trade $%.2f < minimum $1", perTradeAmount))
	}
	tradeCapacity := 0
	if perTradeAmount > 0 {
		tradeCapacity = int(math.Floor(balance / perTradeAmount))
	}

	return map[string]interface{}{
		"effectiveBankroll":    balance,
		"effectiveMaxPosPct":   effectiveMaxPosPct,
		"perTradeAmount":       perTradeAmount,
		"minLiquidityRequired": minLiquidityRequired,
		"minEdgeRequired":      minEdgeRequired,
		"mode":                 mode,
		"modeLabel":            modeLabel,
		"tradeCapacity":        tradeCapacity,
		"canTrade":             canTrade,
		"warnings":             warnings,
	}
}

func ShouldSkipMarket(marketID, side string) bool {
	dayStart := time.Now().Truncate(24 * time.Hour)
	var count int
	db.DB.QueryRow(
		"SELECT COUNT(*) FROM auto_trade_history WHERE market_id = ? AND side = ? AND timestamp >= ?",
		marketID, side, dayStart.Format(time.RFC3339),
	).Scan(&count)
	return count > 0
}

func IsVolatile(marketID string, currentPrice, thresholdPct float64) bool {
	cutoff := time.Now().Add(-60 * time.Second).Format(time.RFC3339)
	var price float64
	err := db.DB.QueryRow(
		"SELECT price FROM market_price_history WHERE market_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC LIMIT 1",
		marketID, cutoff,
	).Scan(&price)
	if err != nil {
		return false
	}
	if price == 0 {
		return false
	}
	chg := math.Abs((currentPrice-price)/price) * 100
	return chg > thresholdPct
}

func BatchRecordMarketPrices(prices map[string]float64) {
	if len(prices) == 0 {
		return
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-2 * time.Hour).Format(time.RFC3339)
	now := time.Now().Format(time.RFC3339)
	insert, _ := tx.Prepare("INSERT OR REPLACE INTO market_price_history (market_id, price, recorded_at) VALUES (?, ?, ?)")
	prune, _ := tx.Prepare("DELETE FROM market_price_history WHERE market_id = ? AND recorded_at < ?")
	for id, price := range prices {
		insert.Exec(id, price, now)
		prune.Exec(id, cutoff)
	}
	insert.Close()
	prune.Close()
	tx.Commit()
}

func TradesToday() int {
	dayStart := time.Now().Truncate(24 * time.Hour)
	var count int
	db.DB.QueryRow(
		"SELECT COUNT(*) FROM auto_trade_history WHERE success = 1 AND timestamp >= ?",
		dayStart.Format(time.RFC3339),
	).Scan(&count)
	return count
}

func GetRiskState(key string) string {
	var val string
	db.DB.QueryRow("SELECT value FROM trading_risk_state WHERE key = ?", key).Scan(&val)
	return val
}

func SetRiskState(key, value string) {
	db.DB.Exec("INSERT OR REPLACE INTO trading_risk_state (key, value) VALUES (?, ?)", key, value)
}

func IsEmergencyStop() bool {
	return GetRiskState("emergency_stop") == "true"
}

func SetEmergencyStop(active bool) {
	val := "false"
	if active {
		val = "true"
	}
	SetRiskState("emergency_stop", val)
}

func GetConsecutiveLosses() int {
	s := GetRiskState("consecutive_losses")
	n, _ := strconv.Atoi(s)
	return n
}

func GetLossCooldownUntil() *time.Time {
	val := GetRiskState("loss_cooldown_until")
	if val == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, val)
	if err != nil {
		return nil
	}
	return &t
}

func GetDailyLossPauseUntil() *time.Time {
	val := GetRiskState("daily_loss_pause_until")
	if val == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, val)
	if err != nil {
		return nil
	}
	return &t
}

func GetNetworkMode() string {
	var val string
	err := db.DB.QueryRow("SELECT value FROM bot_state WHERE key = 'NETWORK_MODE'").Scan(&val)
	if err != nil || val == "" {
		return "mainnet"
	}
	if val == "testnet" {
		return "testnet"
	}
	return "mainnet"
}

func SetNetworkMode(mode string) {
	db.DB.Exec("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('NETWORK_MODE', ?)", mode)
}

func RecordRiskEvent(posID, eventType string, sharesSold, realizedPnl, price float64) {
	db.DB.Exec(
		"INSERT OR IGNORE INTO position_risk_events (position_id, event_type, executed_at, shares_sold, realized_pnl, price_at_execution) VALUES (?, ?, ?, ?, ?, ?)",
		posID, eventType, time.Now().Format(time.RFC3339), sharesSold, realizedPnl, price,
	)
}

func HasRiskEvent(posID, eventType string) bool {
	var exists int
	db.DB.QueryRow("SELECT 1 FROM position_risk_events WHERE position_id = ? AND event_type = ?", posID, eventType).Scan(&exists)
	return exists == 1
}

func GetTradeHistory() []models.TradeRecord {
	rows, err := db.DB.Query("SELECT id, timestamp, market_id, question, side, price, amount, edge, composite_score, order_id, success, error FROM auto_trade_history ORDER BY timestamp DESC")
	if err != nil {
		return nil
	}
	defer rows.Close()
	var trades []models.TradeRecord
	for rows.Next() {
		var t models.TradeRecord
		var orderID, errMsg sql.NullString
		var success int
		rows.Scan(&t.ID, &t.Timestamp, &t.MarketID, &t.Question, &t.Side, &t.Price, &t.Amount, &t.Edge, &t.CompositeScore, &orderID, &success, &errMsg)
		t.Success = success == 1
		if orderID.Valid {
			t.OrderID = &orderID.String
		}
		if errMsg.Valid {
			t.Error = &errMsg.String
		}
		trades = append(trades, t)
	}
	return trades
}

func PersistTrade(t models.TradeRecord) int64 {
	var orderID, errMsg interface{}
	if t.OrderID != nil {
		orderID = *t.OrderID
	}
	if t.Error != nil {
		errMsg = *t.Error
	}
	success := 0
	if t.Success {
		success = 1
	}
	res, _ := db.DB.Exec(
		"INSERT INTO auto_trade_history (timestamp, market_id, question, side, price, amount, edge, composite_score, order_id, success, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		t.Timestamp, t.MarketID, t.Question, t.Side, t.Price, t.Amount, t.Edge, t.CompositeScore, orderID, success, errMsg,
	)
	id, _ := res.LastInsertId()
	return id
}
